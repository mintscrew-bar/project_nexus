# Operations Recovery

This host uses two recovery layers:

1. Windows keeps the WSL distro alive.
2. WSL systemd restores the Nexus deployment.

## Windows Layer

Windows is responsible only for starting and keeping `Ubuntu-24.04` alive.

- Watchdog script: `C:\Users\mango\AppData\Roaming\CodexWslKeepAlive\wsl-watchdog.ps1`
- Startup shortcut: `C:\Users\mango\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\keep-wsl-ubuntu-24.04.vbs`
- User login autorun: `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\CodexWslWatchdog`
- WSL keepalive process: `/home/haru/.local/bin/codex-wsl-keepalive`
- Watchdog log: `C:\Users\mango\AppData\Roaming\CodexWslKeepAlive\wsl-watchdog.log`
- Legacy Task Scheduler wrapper: `C:\scripts\start-nexus.ps1`
- Legacy wrapper backup: `C:\scripts\start-nexus.legacy-20260730.ps1`

The watchdog runs a 60 second heartbeat. It logs only startup, recovery, errors,
and the 12 hour full status check so the log stays readable.

Older Task Scheduler entries still exist because this user session cannot modify
them without elevation:

- `NexusAutoStart`: still enabled, but its target script is now a compatibility
  wrapper that starts the watchdog and asks systemd to start `nexus.service`.
  It no longer runs `docker compose up` directly.
- `WSL Keep Alive`: still enabled, but its last result was `15`; the current
  watchdog replaces it.
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
