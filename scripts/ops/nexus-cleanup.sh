#!/usr/bin/env bash
#
# 디스크 자동 정리 (TODO_server_reliability Task 1)
#
# 2026-05-09 사고: 빌드마다 쌓인 도커 이미지 레이어로 디스크가 차서
# `mkdir ... input/output error` → web/nginx 다운 → SSH까지 거부.
#
# 빌드는 이제 GitHub runner 에서 하지만(Task 5), pull 한 옛 SHA 이미지와
# 컨테이너 로그·journald 는 여전히 이 호스트에 쌓인다. 배포가 한동안 없으면
# CD 의 정리 단계도 돌지 않으므로 매일 한 번 독립적으로 청소한다.
#
# 2026-09-03: 같은 일을 하던 scripts/disk-cleanup.sh 를 여기로 흡수했다.
#   흡수한 것 — npm/pnpm/apt 캐시 정리, before/after 디스크 Discord 보고
#   유지한 것 — `until=24h` 필터(롤백용 직전 이미지 보존), docker system df 로그
#
# 설치: scripts/ops/install-cron.sh (sudo 불필요, 유저 crontab)
# 수동 실행: scripts/ops/nexus-cleanup.sh
set -uo pipefail

# shellcheck source=/dev/null
[ -r "${NEXUS_OPS_ENV:-$HOME/.config/nexus-ops.env}" ] && . "${NEXUS_OPS_ENV:-$HOME/.config/nexus-ops.env}"
WEBHOOK="${NEXUS_OPS_WEBHOOK:-}"

log() { echo "[nexus-cleanup] $*"; }
disk_summary() { df -h / | awk 'NR==2 {printf "%s used / %s total (%s)", $3, $2, $5}'; }

notify() {
  [ -z "$WEBHOOK" ] && return 0
  curl -fsS -X POST -H "Content-Type: application/json" -d @- "$WEBHOOK" >/dev/null 2>&1 <<JSON || true
{"content": $(printf '%s' "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}
JSON
}

START=$(date +%s)
BEFORE=$(disk_summary)
log "=== 정리 전 — $BEFORE ==="
docker system df 2>/dev/null || true

# 1) 도커 — 실행 중 컨테이너가 참조하는 이미지는 Docker 가 자동 보호한다.
#    until 필터로 최근 24시간 내 이미지는 남겨 롤백 여지를 지운다.
if command -v docker >/dev/null 2>&1; then
  log "도커 이미지/컨테이너/네트워크 정리 (24시간 이전)"
  docker system prune -af --filter "until=24h" 2>&1 | sed 's/^/  [docker] /' || log "docker prune 실패(무시)"
  log "BuildKit 캐시 정리"
  docker builder prune -af 2>&1 | sed 's/^/  [builder] /' || log "builder prune 실패(무시)"
fi

# 2) 패키지 매니저 캐시 — 이 호스트에서 pnpm install 을 돌리면 계속 쌓인다.
command -v npm  >/dev/null 2>&1 && { npm cache clean --force 2>&1 | sed 's/^/  [npm] /' || true; }
command -v pnpm >/dev/null 2>&1 && { pnpm store prune  2>&1 | sed 's/^/  [pnpm] /' || true; }

# 3) sudo 가 필요한 것들 — passwordless sudo 가 없으면 조용히 건너뛴다.
#    컨테이너 로그는 compose 의 max-size 로 이미 묶여 있어 여기서는 호스트 쪽만 본다.
if command -v apt-get >/dev/null 2>&1; then
  sudo -n apt-get clean 2>/dev/null && log "[apt] 캐시 정리 완료" || log "[apt] sudo 권한 없음 → 스킵"
fi
if command -v journalctl >/dev/null 2>&1; then
  sudo -n journalctl --vacuum-time=7d 2>&1 | sed 's/^/  [journal] /' || log "[journal] sudo 권한 없음 → 스킵"
fi

AFTER=$(disk_summary)
ELAPSED=$(($(date +%s) - START))
log "=== 정리 후 (${ELAPSED}s) — $AFTER ==="
docker system df 2>/dev/null || true

notify "🧹 **NEXUS 디스크 정리 완료** (${ELAPSED}s)"$'\n'"- Before: \`$BEFORE\`"$'\n'"- After: \`$AFTER\`"
