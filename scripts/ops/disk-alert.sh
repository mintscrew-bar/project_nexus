#!/usr/bin/env bash
#
# 디스크 사용률 경고 (TODO_server_reliability Task 3)
#
# 사후 복구가 아니라 사전 경고로 전환하는 게 목적이다. 디스크가 꽉 차면
# SSH조차 거부되어 그때는 알림을 보낼 수단도 남지 않는다.
#
# 설치: scripts/ops/install-cron.sh (sudo 불필요, 유저 crontab)
# 수동 실행: scripts/ops/disk-alert.sh
#
# 2026-09-03: 이 호스트에 passwordless sudo 가 없어 /etc/ + /etc/cron.d 설치가
# 불가능했다(그래서 이 스크립트는 작성만 되고 한 번도 돌지 않았다).
# 웹훅과 상태 파일을 유저 홈으로 옮겨 sudo 없이 설치되게 바꿨다.
set -euo pipefail

# 웹훅은 정리·백업 스크립트와 같은 파일을 공유한다.
ENV_FILE="${NEXUS_OPS_ENV:-$HOME/.config/nexus-ops.env}"
# shellcheck source=/dev/null
[ -r "$ENV_FILE" ] && . "$ENV_FILE"

THRESHOLD="${DISK_ALERT_THRESHOLD:-80}"
# 한 번 넘겼다고 30분마다 계속 울리면 알림을 꺼버리게 된다. 하루 한 번만 보낸다.
STATE_FILE="${DISK_ALERT_STATE_FILE:-$HOME/.cache/nexus-disk-alert.state}"
mkdir -p "$(dirname "$STATE_FILE")"
COOLDOWN_SECONDS="${DISK_ALERT_COOLDOWN:-86400}"

USAGE=$(df --output=pcent / | tail -1 | tr -dc '0-9')
echo "[disk-alert] / 사용률 ${USAGE}% (임계치 ${THRESHOLD}%)"

if [ "$USAGE" -lt "$THRESHOLD" ]; then
  # 정상으로 돌아오면 상태를 지워, 다음에 다시 넘길 때 즉시 알린다.
  rm -f "$STATE_FILE"
  exit 0
fi

now=$(date +%s)
if [ -f "$STATE_FILE" ]; then
  last=$(cat "$STATE_FILE" 2>/dev/null || echo 0)
  if [ $((now - last)) -lt "$COOLDOWN_SECONDS" ]; then
    echo "[disk-alert] 쿨다운 중 — 알림 생략"
    exit 0
  fi
fi

WEBHOOK="${DISK_ALERT_WEBHOOK:-${NEXUS_OPS_WEBHOOK:-}}"
if [ -z "$WEBHOOK" ]; then
  echo "[disk-alert] 웹훅 미설정(NEXUS_OPS_WEBHOOK) — 알림 생략" >&2
  exit 0
fi

DETAIL=$(df -h / | tail -1 | tr -s ' ' ' ')
printf '{"content":"⚠️ **NEXUS 서버 디스크 %s%%** (임계치 %s%%)\\n`%s`\\n정리: `scripts/ops/nexus-cleanup.sh`"}' \
  "$USAGE" "$THRESHOLD" "$DETAIL" \
  | curl -fsS -X POST -H "Content-Type: application/json" -d @- "$WEBHOOK" \
  && echo "$now" > "$STATE_FILE" \
  || echo "[disk-alert] 알림 전송 실패" >&2
