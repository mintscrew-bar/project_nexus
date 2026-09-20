#!/usr/bin/env bash
# =============================================================================
# 개발 서버 관리 — 포트 하나만 쓴다
#
# [설계 원칙]
# 이 호스트는 운영 상주 서버다. 개발 서버는 **단 하나의 고정 포트**로만 뜬다.
# 포트를 늘리지 않는 이유:
#   - dev 인스턴스가 늘어나는 만큼 메모리를 먹고, 그게 2026-09-16·09-20 두 번
#     WSL VM 을 얼려 사이트를 Cloudflare 1033 으로 내린 원인이었다.
#   - 어느 포트에 뭐가 떠 있는지 모르면 "껐다고 생각했는데 살아있는" 프로세스가
#     남는다. 실제로 PID 193735 가 그렇게 3010 을 잡은 채 방치돼 있었다.
# 그래서 유닛도 하나(nexus-dev.service), 포트도 하나다. systemd 가 중복 기동을
# 구조적으로 막는다.
#
# 포트를 바꿔야 하면 아래 DEV_PORT 한 줄만 고친다. 포트를 **추가**하지 않는다.
#
# [메모리]
# transient systemd 사용자 서비스로 띄워 메모리 상한을 건다. 상한을 넘기면
# dev 만 OOM kill 되고 운영 컨테이너는 산다. 운영은 system.slice(도커) 아래라
# 이 상한의 영향을 받지 않는다. 계산은 scripts/dev-mem-limits.sh 참고.
#
# [사용법]
#   scripts/dev-server.sh start     (= pnpm dev)
#   scripts/dev-server.sh status    (= pnpm dev:status)
#   scripts/dev-server.sh stop      (= pnpm dev:stop)
#   scripts/dev-server.sh restart
#   scripts/dev-server.sh logs [-n 200]
#   scripts/dev-server.sh stop --force   # 유닛 밖 잔류 프로세스까지 정리
# =============================================================================
set -euo pipefail

# --- 고정값: 여기가 단일 진실 공급원 ---------------------------------------
readonly DEV_PORT=3010
readonly UNIT="nexus-dev"
readonly DEV_HOST="0.0.0.0" # 같은 LAN/Tailscale 기기에서 확인하려고 열어둔다
readonly STARTUP_TIMEOUT=90 # next dev 첫 컴파일이 느릴 수 있다

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/dev-mem-limits.sh
source "$REPO_ROOT/scripts/dev-mem-limits.sh"

# --- 출력 헬퍼 ---------------------------------------------------------------
say() { printf '%s\n' "$*"; }
err() { printf '%s\n' "$*" >&2; }

# --- 상태 조회 ---------------------------------------------------------------
unit_is_active() { systemctl --user is-active --quiet "$UNIT" 2>/dev/null; }
unit_is_failed() { systemctl --user is-failed --quiet "$UNIT" 2>/dev/null; }

# 포트를 잡고 있는 프로세스의 "PID 명령어" 를 출력한다. 없으면 빈 문자열.
port_holder() {
  local pid
  pid=$(ss -ltnpH "sport = :$DEV_PORT" 2>/dev/null |
    grep -oP 'pid=\K[0-9]+' | head -1)
  [[ -z "$pid" ]] && return 0
  printf '%s %s' "$pid" "$(ps -p "$pid" -o args= 2>/dev/null | cut -c1-80)"
}

port_is_open() { [[ -n "$(port_holder)" ]]; }

# 바이트를 사람이 읽는 단위로.
human_bytes() {
  local b="${1:-0}"
  [[ "$b" =~ ^[0-9]+$ ]] || {
    printf '?'
    return
  }
  awk -v b="$b" 'BEGIN {
    if (b >= 1073741824) printf "%.2fGB", b/1073741824;
    else printf "%.0fMB", b/1048576;
  }'
}

# --- status ------------------------------------------------------------------
cmd_status() {
  nexus_dev_compute_limits
  local holder pid mem_cur mem_max since

  say "개발 서버 (포트 $DEV_PORT 고정, 유닛 $UNIT.service)"
  say ""

  if unit_is_active; then
    pid=$(systemctl --user show "$UNIT" -p MainPID --value 2>/dev/null)
    mem_cur=$(systemctl --user show "$UNIT" -p MemoryCurrent --value 2>/dev/null)
    mem_max=$(systemctl --user show "$UNIT" -p MemoryMax --value 2>/dev/null)
    since=$(systemctl --user show "$UNIT" -p ActiveEnterTimestamp --value 2>/dev/null)
    say "  상태   : 켜짐"
    say "  PID    : $pid"
    say "  메모리 : $(human_bytes "$mem_cur") / $(human_bytes "$mem_max") 상한"
    say "  시작   : $since"
  elif unit_is_failed; then
    say "  상태   : 실패로 종료됨 (메모리 상한 초과일 수 있다)"
    say "           로그: scripts/dev-server.sh logs"
  else
    say "  상태   : 꺼짐"
  fi

  holder="$(port_holder)"
  if [[ -n "$holder" ]]; then
    say "  포트   : $DEV_PORT 사용 중 — $holder"
    if ! unit_is_active; then
      say ""
      say "  ⚠ 유닛은 꺼져 있는데 포트를 누가 잡고 있다. 관리 밖 잔류 프로세스다."
      say "    메모리 상한이 안 걸린 상태이므로 정리하는 편이 좋다:"
      say "      scripts/dev-server.sh stop --force"
    else
      say "  주소   : http://localhost:$DEV_PORT"
    fi
  else
    say "  포트   : $DEV_PORT 비어 있음"
  fi

  say ""
  say "  적용될 상한: 메모리 $NEXUS_DEV_MEM_MAX (소프트 $NEXUS_DEV_MEM_HIGH), 스왑 차단, CPU $NEXUS_DEV_CPU_QUOTA"
}

# --- start -------------------------------------------------------------------
cmd_start() {
  if [[ $# -gt 0 ]]; then
    err "start 는 인자를 받지 않는다. 포트는 $DEV_PORT 하나로 고정이다."
    err "다른 포트가 필요하면 포트를 늘리지 말고 scripts/dev-server.sh 의 DEV_PORT 를 바꿔라."
    exit 2
  fi

  nexus_dev_compute_limits

  if unit_is_active; then
    say "이미 켜져 있다. 새로 띄우지 않는다."
    say ""
    cmd_status
    return 0
  fi

  # 이전에 실패로 끝난 유닛이 남아 있으면 치운다. 안 그러면 기동이 막힌다.
  unit_is_failed && systemctl --user reset-failed "$UNIT" 2>/dev/null || true

  local holder
  holder="$(port_holder)"
  if [[ -n "$holder" ]]; then
    err "포트 $DEV_PORT 를 다른 프로세스가 잡고 있어 띄울 수 없다:"
    err "  $holder"
    err ""
    err "이 프로세스는 메모리 상한 밖이라 그대로 두면 VM 을 얼릴 수 있다."
    err "정리하려면: scripts/dev-server.sh stop --force"
    exit 1
  fi

  say "개발 서버를 띄운다 — 포트 $DEV_PORT, 메모리 상한 $NEXUS_DEV_MEM_MAX, 스왑 차단"

  systemd-run --user --unit="$UNIT" --collect --quiet \
    -p "Description=Nexus dev server (web, port $DEV_PORT)" \
    -p "WorkingDirectory=$REPO_ROOT" \
    -p "MemoryMax=$NEXUS_DEV_MEM_MAX" \
    -p "MemoryHigh=$NEXUS_DEV_MEM_HIGH" \
    -p "MemorySwapMax=$NEXUS_DEV_MEM_SWAP" \
    -p "CPUQuota=$NEXUS_DEV_CPU_QUOTA" \
    -p "Restart=no" \
    --setenv="PATH=$PATH" \
    --setenv="HOME=$HOME" \
    -- pnpm --filter @nexus/web exec next dev -p "$DEV_PORT" -H "$DEV_HOST"

  # 포트가 열릴 때까지 기다린다. 그냥 돌아가면 떴는지 안 떴는지 알 수 없다.
  local waited=0
  while ((waited < STARTUP_TIMEOUT)); do
    if port_is_open; then
      say "떴다 — http://localhost:$DEV_PORT  (${waited}초)"
      return 0
    fi
    if ! unit_is_active; then
      err ""
      err "기동 중 죽었다. 마지막 로그:"
      journalctl --user -u "$UNIT" -n 30 --no-pager 2>/dev/null || true
      exit 1
    fi
    sleep 1
    waited=$((waited + 1))
  done

  err "${STARTUP_TIMEOUT}초 안에 포트가 열리지 않았다. 유닛은 아직 살아 있다."
  err "로그를 확인해라: scripts/dev-server.sh logs"
  exit 1
}

# --- stop --------------------------------------------------------------------
cmd_stop() {
  local force=0
  [[ "${1:-}" == "--force" ]] && force=1

  local did_something=0

  if unit_is_active; then
    say "개발 서버를 내린다."
    systemctl --user stop "$UNIT"
    did_something=1
  elif unit_is_failed; then
    systemctl --user reset-failed "$UNIT" 2>/dev/null || true
    say "실패 상태로 남아 있던 유닛을 정리했다."
    did_something=1
  fi

  # 유닛 밖에서 포트를 잡고 있는 잔류 프로세스 처리.
  local holder pid
  holder="$(port_holder)"
  if [[ -n "$holder" ]]; then
    pid="${holder%% *}"
    if ((force)); then
      say "포트 $DEV_PORT 잔류 프로세스를 정리한다: $holder"
      # 자식까지 함께 내려가도록 프로세스 그룹에 보낸다.
      kill -TERM -- "-$(ps -o pgid= -p "$pid" | tr -d ' ')" 2>/dev/null ||
        kill -TERM "$pid" 2>/dev/null || true
      local waited=0
      while ((waited < 10)) && port_is_open; do
        sleep 1
        waited=$((waited + 1))
      done
      port_is_open && kill -KILL "$pid" 2>/dev/null || true
      did_something=1
    else
      say ""
      say "⚠ 유닛 밖에서 포트 $DEV_PORT 를 잡고 있는 프로세스가 남아 있다:"
      say "    $holder"
      say "  이건 메모리 상한 밖이다. 정리하려면: scripts/dev-server.sh stop --force"
      return 0
    fi
  fi

  ((did_something)) || say "이미 꺼져 있다."
  port_is_open || say "포트 $DEV_PORT 비었다."
}

# --- 기타 --------------------------------------------------------------------
cmd_restart() {
  cmd_stop
  say ""
  cmd_start
}

cmd_logs() {
  local args=("$@")
  ((${#args[@]})) || args=(-n 100 -f)
  journalctl --user -u "$UNIT" --no-pager "${args[@]}"
}

usage() {
  cat <<USAGE
개발 서버 관리 — 포트 $DEV_PORT 하나만 쓴다

  scripts/dev-server.sh start            띄운다 (이미 켜져 있으면 아무것도 안 한다)
  scripts/dev-server.sh stop [--force]   내린다 (--force 는 유닛 밖 잔류까지)
  scripts/dev-server.sh restart          내렸다 띄운다
  scripts/dev-server.sh status           켜짐/꺼짐, PID, 메모리, 포트 점유
  scripts/dev-server.sh logs [옵션]      기본 -n 100 -f

포트는 의도적으로 하나다. 늘리지 마라 — 이유는 이 파일 상단 주석 참고.
USAGE
}

case "${1:-}" in
start | up) shift; cmd_start "$@" ;;
stop | down) shift; cmd_stop "$@" ;;
restart) shift; cmd_restart ;;
status | st) shift; cmd_status ;;
logs | log) shift; cmd_logs "$@" ;;
"" | -h | --help | help) usage ;;
*)
  err "알 수 없는 명령: $1"
  err ""
  usage >&2
  exit 2
  ;;
esac
