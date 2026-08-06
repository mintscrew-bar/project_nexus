#!/usr/bin/env bash
set -euo pipefail

# nexus OOM 감시 스크립트.
# 컨테이너가 cgroup 메모리 상한을 넘어 OOM-kill 될 때 docker events가 내보내는
# `oom` 이벤트를 스트리밍하며, 이벤트마다 Discord OPERATION 채널로 알림을 보낸다.
#
# 목적: 2026-08-06 WSL OOM 조치(컨테이너별 mem_limit)는 폭발 반경만 줄인다.
# 상한을 넘긴 컨테이너는 OOM-kill 후 restart 정책으로 재기동되는데, 이 재기동이
# 조용히 반복되면(사이트 간헐 다운) 알아채기 어렵다. 이 감시가 그 조기경보다.
#
# 사용:
#   scripts/oom-alert.sh          # 감시 루프 (systemd가 실행)
#   scripts/oom-alert.sh --test   # Discord 전송이 되는지 1회 테스트

ENV_FILE="${NEXUS_ENV_FILE:-/home/haru/projects/nexus/.env.production}"

# .env.production에서 필요한 키만 읽는다. 전체 source는 부작용 위험이 있어 피한다.
read_env() {
  grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2- \
    | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

BOT_TOKEN="$(read_env DISCORD_BOT_TOKEN)"
CHANNEL_ID="$(read_env ADMIN_ALERT_DISCORD_OPERATION_CHANNEL_ID)"
[ -z "$CHANNEL_ID" ] && CHANNEL_ID="$(read_env ADMIN_ALERT_DISCORD_CHANNEL_ID)"

if [ -z "$BOT_TOKEN" ] || [ -z "$CHANNEL_ID" ]; then
  echo "[oom-alert] DISCORD_BOT_TOKEN 또는 OPERATION 채널 ID를 찾지 못했습니다 ($ENV_FILE)." >&2
  exit 1
fi

# Discord 메시지 전송. content는 한글 고정문 + 컨테이너명/시각(안전 문자)만 포함하므로
# jq 없이 최소 이스케이프로 JSON을 구성한다.
send() {
  content="$1"
  # 역슬래시와 큰따옴표만 이스케이프 (개행은 만들지 않는다)
  esc=$(printf '%s' "$content" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')
  curl -sf -m 10 -X POST \
    "https://discord.com/api/v10/channels/${CHANNEL_ID}/messages" \
    -H "Authorization: Bot ${BOT_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "{\"content\":\"${esc}\"}" >/dev/null \
    || echo "[oom-alert] Discord 전송 실패" >&2
}

if [ "${1:-}" = "--test" ]; then
  send "✅ nexus OOM 감시 테스트 메시지 ($(hostname) · $(date '+%Y-%m-%d %H:%M:%S %Z'))"
  echo "[oom-alert] 테스트 메시지 전송 시도 완료. Discord OPERATION 채널을 확인하세요."
  exit 0
fi

echo "[oom-alert] OOM 이벤트 감시 시작 (channel=${CHANNEL_ID})."

# docker events의 oom 이벤트를 스트리밍한다. docker 데몬 재시작 등으로 스트림이
# 끊기면 이 프로세스가 종료되고, systemd Restart=always가 다시 띄운다.
docker events --filter event=oom --format '{{.Actor.Attributes.name}}' \
  | while IFS= read -r name; do
      ts="$(date '+%Y-%m-%d %H:%M:%S %Z')"
      send "🚨 **OOM-kill 감지** — 컨테이너 \`${name:-unknown}\`이(가) 메모리 상한 초과로 종료되었습니다 (${ts}). restart 정책으로 재기동 중입니다. 반복되면 해당 서비스의 mem_limit(예: web 2GB / api 1.5GB) 재검토가 필요합니다."
    done
