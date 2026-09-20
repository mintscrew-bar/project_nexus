#!/usr/bin/env bash
# =============================================================================
# 로컬 dev 프로세스 메모리 캡 래퍼
#
# [왜 필요한가]
# 이 호스트는 운영 상주 서버다. 운영 스택(도커)과 로컬 개발이 같은 WSL2 VM
# 하나의 메모리를 나눠 쓴다. 2026-09-16과 2026-09-20 두 번, 로컬 dev 프로세스가
# VM 메모리와 스왑을 전부 먹어 커널이 vmbus 링버퍼(order:7) 할당조차 못 하는
# 상태가 됐고, VM 전체가 굳었다가 재부팅됐다. 재부팅 5분 동안 cloudflared가
# 떠 있지 않아 사이트는 Cloudflare 1033(터널 없음)을 띄웠다.
#
# 이때 Linux OOM killer는 한 번도 돌지 않았다. 아무도 죽지 않아서 다 같이 죽었다.
#
# [무엇을 하는가]
# dev 명령을 systemd 사용자 스코프에 넣고 메모리 상한을 건다.
#   - 상한을 넘기면 dev만 OOM으로 죽고 운영 컨테이너는 살아남는다.
#   - 스왑은 0으로 막는다. 스왑으로 새기 시작하는 순간 VM 전체가 느려지다
#     굳기 때문에, 차라리 빨리 죽는 편이 낫다.
#   - CPU도 제한해 dev 빌드가 운영 응답을 굶기지 않게 한다.
#
# 운영 컨테이너는 system.slice(도커) 아래라 이 캡의 영향을 전혀 받지 않는다.
# 이 스코프는 user@1000.service/app.slice 아래에만 만들어진다.
#
# [사용법]
#   pnpm dev                                   # package.json이 이 래퍼를 탄다
#   scripts/dev-capped.sh                      # 인자 없으면 turbo dev
#   scripts/dev-capped.sh pnpm --filter @nexus/web exec next dev -p 3010
#   NEXUS_DEV_MEM_MAX=6G scripts/dev-capped.sh # 상한 수동 지정
#
# [환경변수]
#   NEXUS_DEV_MEM_MAX    하드 상한. 넘기면 즉시 OOM kill. (기본: 자동 계산)
#   NEXUS_DEV_MEM_HIGH   소프트 상한. 넘기면 스로틀 + 회수 시도. (기본: MAX의 75%)
#   NEXUS_DEV_CPU_QUOTA  CPU 상한. 100%가 코어 1개. (기본: 600%)
#   NEXUS_DEV_NO_CAP=1   캡 없이 그냥 실행 (긴급 탈출구)
# =============================================================================
set -euo pipefail

# 인자가 없으면 모노레포 전체 dev를 띄운다.
if [[ $# -eq 0 ]]; then
  set -- turbo dev
fi

# --- 탈출구: 명시적으로 캡을 끈 경우 ---------------------------------------
if [[ "${NEXUS_DEV_NO_CAP:-}" == "1" ]]; then
  echo "[dev-capped] NEXUS_DEV_NO_CAP=1 — 메모리 캡 없이 실행한다." >&2
  exec "$@"
fi

# --- systemd 사용자 관리자가 없는 환경(도커 빌드, CI)에서는 그대로 실행 ----
# 여기서 실패하면 개발이 막히므로, 캡을 포기하되 실행은 계속한다.
if ! command -v systemd-run >/dev/null 2>&1 \
  || ! systemctl --user is-system-running >/dev/null 2>&1; then
  echo "[dev-capped] systemd 사용자 세션이 없어 캡을 적용하지 못한다. 그대로 실행한다." >&2
  exec "$@"
fi

# --- 상한 자동 계산 ---------------------------------------------------------
# 운영 컨테이너 mem_limit 합계가 약 5.7GiB, 커널·도커·셸 오버헤드를 1.3GiB로 잡아
# 7GiB를 떼어놓고 나머지를 dev 몫으로 준다. .wslconfig의 memory를 올리면
# 이 값도 자동으로 따라 올라가므로 손댈 곳이 없다.
readonly RESERVED_GIB=7
readonly MIN_GIB=2
readonly MAX_GIB=10

compute_default_max_gib() {
  local total_kb total_gib budget
  total_kb=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
  total_gib=$((total_kb / 1024 / 1024))
  budget=$((total_gib - RESERVED_GIB))
  (( budget < MIN_GIB )) && budget=$MIN_GIB
  (( budget > MAX_GIB )) && budget=$MAX_GIB
  echo "$budget"
}

MEM_MAX="${NEXUS_DEV_MEM_MAX:-$(compute_default_max_gib)G}"

# 소프트 상한은 하드 상한의 75%. 여기서 먼저 스로틀이 걸리며 페이지를 회수하므로,
# 일시적인 스파이크는 죽지 않고 넘어간다.
if [[ -n "${NEXUS_DEV_MEM_HIGH:-}" ]]; then
  MEM_HIGH="$NEXUS_DEV_MEM_HIGH"
else
  # "8G"/"2048M" 같은 문자열에서 숫자와 단위를 분리해 75%를 계산한다.
  # 단위를 그대로 보존하지 않으면 2048M → 1536G 처럼 사실상 무제한이 되어
  # 소프트 상한이 꺼져버린다.
  _max_num="${MEM_MAX//[^0-9]/}"
  _max_unit="${MEM_MAX//[0-9]/}"
  _high_num=$(( _max_num * 3 / 4 ))
  (( _high_num < 1 )) && _high_num=1
  MEM_HIGH="${_high_num}${_max_unit}"
fi

CPU_QUOTA="${NEXUS_DEV_CPU_QUOTA:-600%}"

# 스코프 이름에 PID를 붙여 여러 dev를 동시에 띄워도 충돌하지 않게 한다.
SCOPE_NAME="nexus-dev-$$"

cat >&2 <<BANNER
[dev-capped] 메모리 상한 아래에서 실행한다.
             하드 상한 : ${MEM_MAX}  (넘기면 dev만 OOM kill, 운영은 무사)
             소프트 상한: ${MEM_HIGH}  (넘기면 스로틀 + 회수)
             스왑       : 차단 (0)
             CPU        : ${CPU_QUOTA}
             스코프     : ${SCOPE_NAME}.scope
             해제하려면 NEXUS_DEV_NO_CAP=1
BANNER

# --- 실행 -------------------------------------------------------------------
# --scope: 별도 서비스가 아니라 현재 터미널에 붙은 채로 실행한다(Ctrl-C 정상 동작).
# --collect: 실패로 끝나도 스코프 찌꺼기를 남기지 않는다.
set +e
systemd-run --user --scope --collect --quiet \
  --unit="$SCOPE_NAME" \
  -p "MemoryMax=$MEM_MAX" \
  -p "MemoryHigh=$MEM_HIGH" \
  -p "MemorySwapMax=0" \
  -p "CPUQuota=$CPU_QUOTA" \
  -- "$@"
exit_code=$?
set -e

# 128+9(SIGKILL) = 137. cgroup 상한을 넘겨 커널이 죽인 경우다.
if [[ $exit_code -eq 137 ]]; then
  cat >&2 <<OOM_MSG

[dev-capped] dev 프로세스가 메모리 상한(${MEM_MAX})을 넘겨 강제 종료됐다.
             이건 의도된 동작이다 — 운영 컨테이너를 살리려고 dev를 먼저 죽였다.
             캡이 없었다면 VM 전체가 굳고 사이트가 1033으로 내려갔을 상황이다.

             대응:
               1) 불필요한 dev 프로세스를 정리한다 (전체 대신 --filter 로 한 앱만)
               2) 그래도 모자라면 상한을 올린다:
                    NEXUS_DEV_MEM_MAX=8G pnpm dev
               3) 상한을 올릴 여유가 없으면 .wslconfig의 memory를 키운다
                  (docs/setup/OPERATIONS_RECOVERY.md 참고)
OOM_MSG
fi

exit $exit_code
