# 장애 대응 런북

사고 중에 읽는 문서다. 위에서부터 순서대로 따라간다.
구조 설명은 [OPERATIONS_RECOVERY.md](./OPERATIONS_RECOVERY.md)에 있고, 여기에는 명령만 둔다.

- 운영 호스트: WSL(Ubuntu-24.04), 프로젝트 경로 `/home/haru/projects/nexus`
- **이 호스트에서 절대 빌드하지 않는다.** `--build` / `docker build` 금지 — WSL OOM을 재유발한다.
- **`docker compose down` 금지.** 컨테이너를 지워 재부팅 자동 복구를 무력화한다.

```bash
cd /home/haru/projects/nexus
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"
```

---

## 1. 사이트가 502 — 1분 안에 할 일

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}'   # 어디가 죽었는지
df -h /                                              # 디스크가 원인인가
free -h                                              # 메모리가 원인인가
```

`Status`가 `unhealthy`거나 목록에 없는 컨테이너를 찾는다. 헬스체크 경로:

| 컨테이너 | 헬스체크 |
|---|---|
| `nexus-nginx` | `http://127.0.0.1/healthz` |
| `nexus-web` | `http://127.0.0.1:3000/healthz` |
| `nexus-api` | `http://127.0.0.1:4000/api/health` |
| `nexus-postgres` | `pg_isready` |
| `nexus-redis` | `redis-cli ping` |

죽은 컨테이너만 되살린다 (전체 재시작보다 빠르고 안전하다):

```bash
$COMPOSE up -d --no-deps <service>        # web / api / nginx / postgres / redis / cloudflared
docker logs --tail 100 nexus-<service>    # 왜 죽었는지
```

nginx만 이상하면 설정부터 확인한다:

```bash
$COMPOSE exec -T nginx nginx -t && $COMPOSE exec -T nginx nginx -s reload
```

---

## 2. 디스크가 찼을 때

`df -h /`가 90% 이상이면 배포도 자동으로 막힌다(CD의 디스크 게이트).

```bash
scripts/ops/nexus-cleanup.sh        # 이것만으로 대개 끝난다 (매일 04:00 cron 으로도 돈다)

# 더 급하면 직접:
docker system df                    # 무엇이 차지하는지 먼저 본다
docker image prune -a -f            # 안 쓰는 이미지 (실행 중 이미지는 보호됨)
docker builder prune -a -f          # 빌드 캐시
docker container prune -f           # 종료된 컨테이너
journalctl --vacuum-time=7d         # 시스템 로그 (sudo 필요)
```

cron 설치/확인은 `scripts/ops/install-cron.sh --show`.

---

## 2-1. DB·업로드 복원

백업 위치: `~/nexus-backups/` (daily = core 덤프·업로드, weekly = full 덤프)
- `db-core-*.sql.gz` — **매일**. `riot_match_cache` 데이터만 빠진 전체 DB. 평상시엔 이걸로 복원한다.
- `db-full-*.sql.gz` — **주 1회(일요일)**. 외부 매치 캐시까지 포함.
- `uploads-*.tar.gz` — 업로드 볼륨(클랜 로고·배너 등)

```bash
# 0) 먼저 무엇을 복원할지 고른다
ls -lht ~/nexus-backups/daily ~/nexus-backups/weekly

# 1) 앱을 내려 쓰기를 멈춘다 (DB·redis 는 그대로 둔다)
docker compose -f docker-compose.prod.yml stop api web

# 2) DB 복원 — 덤프에 DROP 이 들어 있어 기존 객체를 지우고 덮어쓴다
gunzip -c ~/nexus-backups/daily/db-core-<STAMP>.sql.gz \
  | docker exec -i nexus-postgres psql -U nexus -d nexus

# 3) 업로드 복원
docker run --rm -v nexus_uploads_data:/data -i alpine \
  sh -c 'rm -rf /data/* && tar xzf - -C /data' < ~/nexus-backups/daily/uploads-<STAMP>.tar.gz

# 4) 올린다
docker compose -f docker-compose.prod.yml start api web
```

**되돌릴 수 없는 작업이다.** 확신이 없으면 먼저 임시 DB 로 복원해 내용을 확인한다:

```bash
docker exec nexus-postgres psql -U nexus -d postgres -c "CREATE DATABASE restore_check;"
gunzip -c <덤프> | docker exec -i nexus-postgres psql -U nexus -d restore_check
docker exec nexus-postgres psql -U nexus -d restore_check -c "SELECT count(*) FROM users;"
docker exec nexus-postgres psql -U nexus -d postgres -c "DROP DATABASE restore_check;"
```

이 절차는 2026-09-03 에 실제로 한 번 돌려 검증했다(임시 DB 복원 → 행 수 대조 일치).

---

## 3. 메모리가 부족할 때

OOM-killer가 sshd·tailscaled를 죽이면 원격 복구 경로 자체가 끊긴다.

```bash
free -h
dmesg -T | grep -i 'killed process' | tail -20      # 무엇이 죽었는지
sudo systemctl status nexus-oom-alert.service       # OOM 감시 동작 여부
```

swap이 없으면 [scripts/ops/setup-swap.sh](../../scripts/ops/setup-swap.sh)로 만든다
(`swapon --show`가 비어 있으면 없는 것).

---

## 4. 배포가 반영되지 않을 때

```bash
# 지금 어떤 이미지로 떠 있는지
docker inspect -f '{{.Config.Image}}' nexus-api nexus-web
grep '^IMAGE_TAG=' .env.production
```

- CI(이미지 빌드)가 실패하면 CD 자체가 돌지 않는다. GitHub Actions에서 **CI** 워크플로우를 먼저 본다.
- `DEPLOY_ALERT_DISCORD_WEBHOOK` 시크릿을 넣어두면 두 실패 모두 Discord로 온다.

---

## 5. 직전 배포로 롤백

```bash
# 되돌릴 커밋 SHA를 GitHub Actions 실행 목록에서 고른다
IMAGE_TAG=<sha> $COMPOSE pull api web
IMAGE_TAG=<sha> $COMPOSE up -d --no-build --no-deps api web

# 재부팅 후에도 그 버전으로 뜨게 고정
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=<sha>/" .env.production
```

---

## 6. SSH가 안 될 때

순서대로 시도한다.

1. **Tailscale**: 다른 기기에서 `tailscale status`로 호스트가 보이는지 확인
2. **Cloudflare Tunnel**: `cloudflared`만 살아 있으면 사이트는 502라도 응답한다 —
   터널 SSH 라우트는 아직 미설정(TODO Task 9)
3. **Windows 쪽**: WSL 워치독 로그
   `Get-Content "$env:APPDATA\CodexWslKeepAlive\wsl-watchdog.log" -Tail 40`
4. **물리 접근**: 위가 전부 안 되면 직접 재부팅. WSL 부팅 20초 뒤
   `nexus.timer` → `nexus.service`가 컨테이너를 복구한다.

---

## 7. 재부팅 후 컨테이너가 안 뜰 때

```bash
systemctl status nexus.service nexus.timer --no-pager -l
sudo systemctl start nexus.service
journalctl -u nexus.service -n 50 --no-pager
```

`nexus.service`는 `--no-build`로 `.env.production`의 `IMAGE_TAG` 로컬 이미지만 쓴다.
이미지가 없으면 뜨지 않으므로 `$COMPOSE pull` 후 다시 시작한다.

---

## 8. DB 스키마가 안 맞을 때

이 호스트에서 `pnpm db:push`나 dev compose를 **실행하지 않는다** — dev/prod가
프로젝트·네트워크·서비스명을 공유해 운영이 내려간다.

```bash
docker exec -i nexus-api npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
```

---

## 남아 있는 구멍

[TODO_server_reliability.md](../features/TODO_server_reliability.md) 기준:

- Task 6 tailscaled 행(hang) 대응 — systemd 는 `Restart=on-failure` 라 프로세스가 죽으면 살아나지만,
  응답 없이 매달린 경우는 감지하지 못한다
- Task 7 컨테이너 자가 복구 — healthcheck 는 5개 서비스에 있는데 unhealthy 를 보고 재시작해 줄 주체가 없다
- Task 9 Cloudflare Tunnel SSH 라우트 — Tailscale이 끊기면 아직 원격 복구 수단이 없다.
  cloudflared 가 `TUNNEL_TOKEN` 원격 관리형이라 이 저장소가 아니라 Cloudflare 대시보드에서 설정해야 한다
- Task 10 Wake-on-LAN — 호스트가 완전히 행 걸리면 물리 접근 외 방법이 없다
- Task 11 Discord ops 명령 — 봇만 살아 있을 때 컨테이너를 재시작할 수단
- **백업 호스트 밖 사본** — `NEXUS_BACKUP_RSYNC_TARGET` 이 비어 있어 지금 백업은 이 호스트에만 있다.
  볼륨 손상에는 대응하지만 호스트 전손에는 대응하지 못한다
