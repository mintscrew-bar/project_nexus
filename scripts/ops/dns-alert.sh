#!/usr/bin/env bash
#
# 컨테이너 DNS(외부 이름 조회) 실패 경고
#
# 2026-10-26 테일스케일이 로그아웃되자 컨테이너 안에서 바깥 이름 조회가 약 25시간 실패했다.
# 디스코드 로그인 500·봇 API·치지직/숲 조회·cloudflared 재연결이 전부 막혔는데,
# 헬스체크는 "API 가 떠 있는지"만 봐서 통과했고 외부 호출 실패는 경고 로그로만 남아
# 사용자가 로그인하다 겪기 전까지 아무도 몰랐다.
# 그래서 컨테이너 "안에서" 실제로 이름을 조회해 보고, 실패하면 디스코드로 알린다.
#
# 설치: scripts/ops/install-cron.sh (5분마다, 유저 crontab)
# 수동 실행: scripts/ops/dns-alert.sh
# 강제 시험: DNS_ALERT_TEST_NAME=nonexistent.invalid scripts/ops/dns-alert.sh
set -uo pipefail

# 웹훅은 정리·백업·디스크 경고 스크립트와 같은 파일을 공유한다.
ENV_FILE="${NEXUS_OPS_ENV:-$HOME/.config/nexus-ops.env}"
# shellcheck source=/dev/null
[ -r "$ENV_FILE" ] && . "$ENV_FILE"

# node 가 들어 있어 직접 조회해 볼 수 있는 컨테이너들.
NODE_CONTAINERS="${DNS_ALERT_CONTAINERS:-nexus-api nexus-web nexus-uptime-kuma}"
# 조회해 볼 이름. 둘 다 실패해야 실패로 본다 — 한 도메인 자체의 장애를 DNS 고장으로 오인하지 않게.
NAMES="${DNS_ALERT_TEST_NAME:-discord.com cloudflare.com}"
# 같은 장애로 5분마다 울리면 알림을 꺼버리게 된다. 계속 실패 중이면 6시간마다 한 번만 다시 알린다.
COOLDOWN_SECONDS="${DNS_ALERT_COOLDOWN:-21600}"
STATE_FILE="${DNS_ALERT_STATE_FILE:-$HOME/.cache/nexus-dns-alert.state}"
mkdir -p "$(dirname "$STATE_FILE")"

# 컨테이너 안에서 NAMES 중 하나라도 조회되면 0, 전부 실패하면 1.
# node 안에서 8초 뒤 스스로 끝내고, 바깥 timeout 은 docker exec 자체가 멈추는 경우에 대비한다.
lookup_in_container() {
  local container="$1"
  # shellcheck disable=SC2086
  timeout 15 docker exec "$container" node -e '
    const dns = require("dns");
    const names = process.argv.slice(1);
    setTimeout(() => process.exit(1), 8000);
    let left = names.length;
    for (const n of names) {
      dns.lookup(n, (err) => {
        if (!err) process.exit(0);
        if (--left === 0) process.exit(1);
      });
    }
  ' $NAMES >/dev/null 2>&1
}

# cloudflared 이미지에는 셸도 node 도 없어서 직접 조회할 수 없다.
# 대신 5분마다 남기는 DNS 갱신 로그에서 조회 실패를 찾는다(장애 당시 이 로그가 계속 찍혔다).
cloudflared_dns_failing() {
  docker container inspect nexus-cloudflared >/dev/null 2>&1 || return 1
  docker logs --since 6m nexus-cloudflared 2>&1 \
    | grep -qE "lookup .*(i/o timeout|no such host|server misbehaving)"
}

is_running() {
  [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null)" = "true" ]
}

check_all() {
  local failed=""
  for c in $NODE_CONTAINERS; do
    # 꺼져 있는 컨테이너는 DNS 문제가 아니다 — 배포 실패 알림 쪽 소관이라 건너뛴다.
    is_running "$c" || continue
    lookup_in_container "$c" || failed="$failed $c"
  done
  cloudflared_dns_failing && failed="$failed nexus-cloudflared"
  echo "${failed# }"
}

send() {
  local webhook="${DNS_ALERT_WEBHOOK:-${NEXUS_OPS_WEBHOOK:-}}"
  if [ -z "$webhook" ]; then
    echo "[dns-alert] 웹훅 미설정(NEXUS_OPS_WEBHOOK) — 알림 생략" >&2
    return 1
  fi
  # JSON 이스케이프 도구 없이 printf 로 만든다. 가변 부분은 컨테이너 이름(영문·하이픈)과
  # 숫자뿐이라 따옴표가 섞일 일이 없고, 줄바꿈은 호출하는 쪽에서 \\n 으로 넣는다.
  printf '{"content":"%s"}' "$1" \
    | curl -fsS -X POST -H "Content-Type: application/json" -d @- "$webhook" >/dev/null
}

now=$(date +%s)
failed=$(check_all)

if [ -z "$failed" ]; then
  echo "[dns-alert] 정상"
  # 알림을 보냈던 장애가 풀렸으면 복구 소식도 알린다 — 계속 고장인지 헷갈리지 않게.
  if [ -f "$STATE_FILE" ]; then
    since=$(cut -d' ' -f1 "$STATE_FILE" 2>/dev/null || echo "$now")
    minutes=$(((now - since) / 60))
    send "✅ **NEXUS 컨테이너 DNS 복구** — 외부 이름 조회가 다시 됩니다 (약 ${minutes}분 만)" \
      && rm -f "$STATE_FILE"
  fi
  exit 0
fi

# 순간적인 끊김으로 울리지 않게 20초 뒤 한 번 더 확인한다.
sleep "${DNS_ALERT_RETRY_DELAY:-20}"
failed=$(check_all)
if [ -z "$failed" ]; then
  echo "[dns-alert] 일시적 실패 — 재확인 시 정상"
  exit 0
fi
echo "[dns-alert] 실패: $failed"

# 상태 파일: "<장애 시작 시각> <마지막 알림 시각>"
since="$now"
last=0
if [ -f "$STATE_FILE" ]; then
  read -r since last < "$STATE_FILE" || true
  since="${since:-$now}"
  last="${last:-0}"
fi
if [ $((now - last)) -lt "$COOLDOWN_SECONDS" ]; then
  echo "[dns-alert] 쿨다운 중 — 알림 생략"
  exit 0
fi

# 호스트에서도 안 되면 인터넷·윈도우 DNS 쪽 문제, 호스트는 되면 컨테이너 DNS 설정 문제다.
# shellcheck disable=SC2086
if getent hosts $NAMES >/dev/null 2>&1; then
  cause="호스트는 정상 — 컨테이너 DNS 설정 문제입니다.\\n조치: \`docker restart ${failed}\` 후 \`journalctl -u docker | grep resolver\` 로 상위 DNS 확인"
else
  cause="호스트에서도 조회 실패 — 서버 인터넷 또는 윈도우 DNS 문제입니다."
fi

if send "🚨 **NEXUS 컨테이너 DNS 실패** — 외부 이름 조회 불가\\n대상: \`${failed}\`\\n영향: 디스코드 로그인·봇, 라이엇·치지직·숲 조회, cloudflared 재연결\\n${cause}"; then
  echo "$since $now" > "$STATE_FILE"
else
  echo "[dns-alert] 알림 전송 실패" >&2
fi
