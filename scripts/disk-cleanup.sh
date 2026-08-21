#!/usr/bin/env bash
# WSL2 Linux 측 디스크 정리 — 매일 자동 실행되도록 cron 등록 권장.
# - Docker 미사용 리소스(이미지/빌더/컨테이너) 정리
# - npm/pnpm 캐시 정리
# - apt 캐시 정리
# - 큰 로그 파일 truncate (저널/도커 로그)
# - 시작/종료 시점 디스크 사용량을 Discord webhook 으로 보고 (옵션)
#
# 환경 변수:
#   DISK_AUTOMATION_WEBHOOK_URL  Discord webhook URL (없으면 알림 생략)
#
# 사용:
#   crontab -e
#   0 4 * * * /home/haru/projects/nexus/scripts/disk-cleanup.sh >> /var/log/disk-cleanup.log 2>&1

set -uo pipefail

WEBHOOK_URL="${DISK_AUTOMATION_WEBHOOK_URL:-}"

# 디스크 사용량 한 줄 요약 (사람이 읽기 좋은 형식)
disk_summary() {
  df -h / | awk 'NR==2 {printf "%s used / %s total (%s)", $3, $2, $5}'
}

# Discord 알림 (webhook 미설정 시 no-op)
notify() {
  local content="$1"
  if [[ -z "$WEBHOOK_URL" ]]; then return 0; fi
  curl -fsS -X POST -H "Content-Type: application/json" \
    -d "{\"content\":${content@Q}}" "$WEBHOOK_URL" >/dev/null 2>&1 || true
}

START_TS=$(date +%s)
BEFORE=$(disk_summary)
echo "[$(date '+%F %T')] 디스크 정리 시작 — $BEFORE"

# 1) Docker 미사용 리소스 정리 (실행 중 컨테이너/이미지/볼륨은 자동 보호됨)
if command -v docker >/dev/null 2>&1; then
  docker image prune -a -f 2>&1 | sed 's/^/  [image] /' || true
  docker builder prune -a -f 2>&1 | sed 's/^/  [builder] /' || true
  docker container prune -f 2>&1 | sed 's/^/  [container] /' || true
fi

# 2) npm 캐시 (전역)
if command -v npm >/dev/null 2>&1; then
  npm cache clean --force 2>&1 | sed 's/^/  [npm] /' || true
fi

# 3) pnpm store 미사용 패키지 정리
if command -v pnpm >/dev/null 2>&1; then
  pnpm store prune 2>&1 | sed 's/^/  [pnpm] /' || true
fi

# 4) apt 캐시 (sudo 필요 — passwordless sudo 가 안 되면 스킵됨)
if command -v apt-get >/dev/null 2>&1; then
  sudo -n apt-get clean 2>/dev/null && echo "  [apt] 캐시 정리 완료" || echo "  [apt] sudo 권한 없음 → 스킵"
fi

# 5) systemd journal 7일치 이상 정리
if command -v journalctl >/dev/null 2>&1; then
  sudo -n journalctl --vacuum-time=7d 2>&1 | sed 's/^/  [journal] /' || echo "  [journal] sudo 권한 없음 → 스킵"
fi

AFTER=$(disk_summary)
ELAPSED=$(($(date +%s) - START_TS))
echo "[$(date '+%F %T')] 디스크 정리 완료 (${ELAPSED}s) — $AFTER"

# Discord 알림 — before/after 비교
notify "🧹 **Linux 디스크 정리 완료** (${ELAPSED}s)\n- Before: \`$BEFORE\`\n- After: \`$AFTER\`"
