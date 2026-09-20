# Operations Recovery

This host uses two recovery layers:

1. Windows keeps the WSL distro alive.
2. WSL systemd restores the Nexus deployment.

## Windows Layer

Windows is responsible only for starting and keeping `Ubuntu-24.04` alive.

- Watchdog script: `C:\Users\mango\AppData\Roaming\CodexWslKeepAlive\wsl-watchdog.ps1`
- User login autorun: `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\CodexWslWatchdog`
- Archived startup shortcut: `C:\Users\mango\AppData\Roaming\CodexWslKeepAlive\archive\keep-wsl-ubuntu-24.04.vbs.disabled-20260806`
- WSL keepalive process: `/home/haru/.local/bin/codex-wsl-keepalive`
- Watchdog log: `C:\Users\mango\AppData\Roaming\CodexWslKeepAlive\wsl-watchdog.log`
- Legacy Task Scheduler wrapper: `C:\scripts\start-nexus.ps1`
- Legacy wrapper backup: `C:\scripts\start-nexus.legacy-20260730.ps1`

The watchdog runs a 60 second heartbeat. It logs only startup, recovery, errors,
and the 12 hour full status check so the log stays readable. If WSL returns an
HCS timeout or fails to start, it backs off for 5 minutes before retrying.

Older Task Scheduler entries:

- `NexusAutoStart`: disabled. Its target script is a compatibility wrapper if
  it is ever re-enabled; it no longer runs `docker compose up` directly.
- `WSL Keep Alive`: disabled. Its old `wsl.exe sleep infinity` action is
  replaced by the current watchdog.
- `WSL Compact`: keep enabled. It handles the monthly VHDX compact maintenance.

## WSL Layer

WSL owns the actual application recovery.

- Service: `/etc/systemd/system/nexus.service`
- Source unit: `/home/haru/projects/nexus/systemd/nexus.service`
- Compose file: `/home/haru/projects/nexus/docker-compose.prod.yml`
- Env file: `/home/haru/projects/nexus/.env.production`

On WSL boot, `nexus.service` runs:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --no-build
```

The compose services use `restart: unless-stopped`, so Docker can restart the
existing containers without deleting them.

## Manual Checks

```powershell
wsl -l -v
Get-Content "$env:APPDATA\CodexWslKeepAlive\wsl-watchdog.log" -Tail 40
```

```bash
systemctl status nexus.service --no-pager -l
docker ps
ps -eo pid,ppid,comm,args | grep -E '[c]odex-wsl-keepalive|[s]leep 86400'
```

## Important Notes

- Do not use `docker compose down` for routine recovery. It deletes containers
  and can interfere with Docker restart behavior.
- The stale `C:/scripts/start-nexus.ps1` script was archived because it targeted
  the old `Ubuntu` distro name and duplicated what `nexus.service` already does.
- If recovery must happen before Windows login, replace the user-level autorun
  with an elevated Task Scheduler task or Windows service.

## Resource Guardrails

The production compose file sets memory, swap, CPU, and PID limits on every
service. This prevents one container from exhausting WSL memory and forcing the
host into disk-backed swap thrashing.

Current intent:

- `nexus-web`: 2 GB RAM, no extra container swap, 2 CPUs, 256 PIDs
- `nexus-api`: 1.5 GB RAM, no extra container swap, 2 CPUs, 256 PIDs
- `nexus-postgres`: 1 GB RAM, no extra container swap, 1.5 CPUs, 256 PIDs
- smaller sidecars use 128-512 MB limits

Healthchecks for `web` and `api` use `wget`, not `node -e`. Do not change them
back to Node-based checks. During the 2026-08-06 incident, WSL hit OOM while
`nexus-web` had multiple `MainThread` processes and Docker healthchecks were
timing out. Spawning extra Node processes for healthchecks made that failure
mode worse.

### Builds are not covered by these limits

`mem_limit` / `memswap_limit` apply to **running containers only**. They do not
constrain the `docker build` step. The web build runs with
`NODE_OPTIONS=--max-old-space-size=3072` (3 GB heap), which is uncapped on this
host and can re-trigger the same WSL OOM if it runs while all services are up.

Therefore, on this host:

- Never run `docker compose ... up --build` or `docker build` here.
- `nexus.service` already uses `up -d --no-build` and only starts local images.
- Image pull/build is CI/CD's job (GHCR). Recovery and manual redeploys pull the
  tagged image, they do not build it:
  `IMAGE_TAG=<sha> docker compose -f docker-compose.prod.yml up -d --no-build`

The `build:` sections in `docker-compose.prod.yml` are kept only as a local dev
fallback and carry a warning comment. Do not use them on the production host.

#### Root-owned build artifacts

A container build that bind-mounts the repo writes as `root`, and the resulting
directories stay root-owned after the build. On 2026-08-06 this was found on
`.turbo/`, created 2026-04-02. Turbo could not write its cache, so every build
since then silently failed with `WARNING IO error: Permission denied (os error
13)` and reported `Cached: 0`. Fixing the ownership took a full build from 49s
to 358ms (`FULL TURBO`).

The warning is non-fatal and easy to miss — builds still succeed, just never
cached. If builds feel slow, check ownership before anything else:

```bash
find . -maxdepth 2 \( -name .turbo -o -name .next -o -name dist -o -name node_modules \) ! -user "$USER"
sudo chown -R "$USER:$USER" <path>
```

### Local dev is not covered by these limits either

Same gap as builds, different trigger. `pnpm dev` runs on the host, outside every
container limit. The WSL VM froze twice this way:

| When             | Signature                                                                      |
| ---------------- | ------------------------------------------------------------------------------ |
| 2026-09-16 19:10 | `Free swap = 0kB`, order:7 allocation failure, VM rebooted 19:13               |
| 2026-09-20 17:15 | identical signature, VM rebooted 17:18, site served Cloudflare 1033 for ~5 min |

Note what did **not** happen: `syslog` has zero `oom-kill` events on both dates.
The Linux OOM killer never ran. Nothing got killed, so everything died together —
the kernel could not satisfy an order:7 allocation for a vmbus ring buffer and the
VM stopped responding. `nexus-oom-alert.service` only watches `docker events`, so
it is blind to this class of failure.

Production containers were not the cause. Their `mem_limit` total is 5.7 GB and
real usage sits around 700 MB. The 11.3 GB of anonymous memory was almost entirely
host-side dev processes; a single `next dev` reaches ~2 GB within half an hour.

The guardrail is `scripts/dev-capped.sh`. It runs the dev command inside a systemd
user scope with a hard memory cap and swap disabled, so dev is OOM-killed before
the VM is. `pnpm dev`, `pnpm dev:web`, and `pnpm dev:api` all route through it.

- The cap is derived from `MemTotal` minus 7 GB (container limits plus
  kernel/docker overhead), clamped to 2-10 GB. Raising `memory` in `.wslconfig`
  raises the cap automatically — there is no second number to keep in sync.
- Swap is pinned to 0 inside the scope. Swapping is what turns a memory problem
  into a frozen VM, so failing fast is the point.
- Override with `NEXUS_DEV_MEM_MAX=8G pnpm dev`. Bypass with `NEXUS_DEV_NO_CAP=1`.
- The scope lives under `user@1000.service/app.slice`. Docker containers run under
  `system.slice`, so production is never inside this cap.

Slice-level capping is not an option here. WSL starts shells from `/init.scope`
without a systemd login session, so `user-1000.slice` stays empty and capping it
would catch nothing; `user.slice` itself needs root, which this host does not have
passwordless. The wrapper therefore has to be invoked explicitly, which is why the
`dev*` package scripts point at it. A dev command typed directly (for example
`pnpm --filter @nexus/web exec next dev`) is **not** capped — wrap it:

```bash
scripts/dev-capped.sh pnpm --filter @nexus/web exec next dev -p 3010
```

### OOM alerting

`nexus-oom-alert.service` streams `docker events --filter event=oom` and posts to
the Discord OPERATION channel whenever a container is OOM-killed. The mem limits
above only cap the blast radius; a container that exceeds its limit is OOM-killed
and restarted by `restart: unless-stopped`. This watcher makes that visible so a
silent restart loop does not go unnoticed.

- Watcher script: `/home/haru/projects/nexus/scripts/oom-alert.sh`
- Source unit: `/home/haru/projects/nexus/systemd/nexus-oom-alert.service`
- Installed by `scripts/install-nexus-systemd.sh`
- Manual test: `scripts/oom-alert.sh --test`

Windows WSL limits are set in `C:\Users\mango\.wslconfig`:

```ini
[wsl2]
memory=20GB
processors=8
swap=4GB
vmIdleTimeout=-1

[general]
instanceIdleTimeout=-1

[experimental]
autoMemoryReclaim=gradual
```

Raised from 12GB/2GB on 2026-09-21 after the second freeze. The host has 32 GB
physical, so 12 GB of it was sitting unused while the VM starved. Swap is capped
at 4 GB rather than higher because the swap vhdx lives on `C:`, which has only
~37 GB free.

These WSL settings apply after `wsl --shutdown`. **That shuts production down** —
`wsl --shutdown` kills the VM, and recovery takes about 90 seconds (Docker restart
policy brings containers back, then `nexus.timer` fires `nexus.service` 20 s after
boot). Do it during a quiet window, not mid-day.
