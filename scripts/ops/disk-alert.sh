#!/usr/bin/env bash
#
# 디스크 사용률 경고 (TODO_server_reliability Task 3)
#
# 사후 복구가 아니라 사전 경고로 전환하는 게 목적이다. 디스크가 꽉 차면
# SSH조차 거부되어 그때는 알림을 보낼 수단도 남지 않는다.
#
# 설치:
#   sudo install -m 0755 scripts/ops/disk-alert.sh /usr/local/bin/nexus-disk-alert
#   # 웹훅은 root만 읽을 수 있게 둔다
#   sudo install -m 0600 /dev/null /etc/nexus-disk-alert.env
#   echo 'DISK_ALERT_WEBHOOK=https://discord.com/api/webhooks/...' | sudo tee /etc/nexus-disk-alert.env
#   # 30분마다 검사
#   echo '*/30 * * * * root /usr/local/bin/nexus-disk-alert' | sudo tee /etc/cron.d/nexus-disk-alert
#
# 수동 실행: sudo nexus-disk-alert
set -euo pipefail

ENV_FILE="${DISK_ALERT_ENV_FILE:-/etc/nexus-disk-alert.env}"
[ -r "$ENV_FILE" ] && . "$ENV_FILE"

THRESHOLD="${DISK_ALERT_THRESHOLD:-80}"
# 한 번 넘겼다고 30분마다 계속 울리면 알림을 꺼버리게 된다. 하루 한 번만 보낸다.
STATE_FILE="${DISK_ALERT_STATE_FILE:-/var/tmp/nexus-disk-alert.state}"
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

if [ -z "${DISK_ALERT_WEBHOOK:-}" ]; then
  echo "[disk-alert] DISK_ALERT_WEBHOOK 미설정 — 알림 생략" >&2
  exit 0
fi

DETAIL=$(df -h / | tail -1 | tr -s ' ' ' ')
printf '{"content":"⚠️ **NEXUS 서버 디스크 %s%%** (임계치 %s%%)\\n`%s`\\n정리: `sudo nexus-cleanup`"}' \
  "$USAGE" "$THRESHOLD" "$DETAIL" \
  | curl -fsS -X POST -H "Content-Type: application/json" -d @- "$DISK_ALERT_WEBHOOK" \
  && echo "$now" > "$STATE_FILE" \
  || echo "[disk-alert] 알림 전송 실패" >&2
