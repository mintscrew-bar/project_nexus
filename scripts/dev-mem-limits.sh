# =============================================================================
# dev 프로세스 메모리 상한 계산 (source 전용 — 직접 실행하지 않는다)
#
# scripts/dev-capped.sh 와 scripts/dev-server.sh 가 같이 쓴다.
# 상한 숫자가 두 곳에 갈라져 서로 달라지면 한쪽만 보호되는 상황이 생기므로
# 계산을 여기 한 곳에 모아 둔다.
#
# 배경은 docs/setup/OPERATIONS_RECOVERY.md 의
# "Local dev is not covered by these limits either" 항목 참고.
# =============================================================================

# 운영 컨테이너 mem_limit 합계가 약 5.7GiB, 커널·도커·셸 오버헤드를 1.3GiB로 잡아
# 7GiB를 떼어놓고 나머지를 dev 몫으로 준다. .wslconfig 의 memory 를 올리면
# 이 값도 자동으로 따라 올라가므로 손댈 곳이 없다.
NEXUS_DEV_RESERVED_GIB=7
NEXUS_DEV_MIN_GIB=2
NEXUS_DEV_MAX_GIB=12

# 호출 후 NEXUS_DEV_MEM_MAX / NEXUS_DEV_MEM_HIGH 가 채워진다.
# 환경변수로 이미 지정돼 있으면 그것을 존중한다.
nexus_dev_compute_limits() {
  local total_kb total_gib budget max_num max_unit high_num

  if [[ -z "${NEXUS_DEV_MEM_MAX:-}" ]]; then
    total_kb=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
    total_gib=$((total_kb / 1024 / 1024))
    budget=$((total_gib - NEXUS_DEV_RESERVED_GIB))
    ((budget < NEXUS_DEV_MIN_GIB)) && budget=$NEXUS_DEV_MIN_GIB
    ((budget > NEXUS_DEV_MAX_GIB)) && budget=$NEXUS_DEV_MAX_GIB
    NEXUS_DEV_MEM_MAX="${budget}G"
  fi

  if [[ -z "${NEXUS_DEV_MEM_HIGH:-}" ]]; then
    # 소프트 상한은 하드 상한의 75%. 여기서 먼저 스로틀이 걸리며 페이지를
    # 회수하므로 일시적인 스파이크는 죽지 않고 넘어간다.
    # 단위를 보존하지 않으면 2048M -> 1536G 처럼 사실상 무제한이 되어
    # 소프트 상한이 꺼져버린다.
    max_num="${NEXUS_DEV_MEM_MAX//[^0-9]/}"
    max_unit="${NEXUS_DEV_MEM_MAX//[0-9]/}"
    high_num=$((max_num * 3 / 4))
    ((high_num < 1)) && high_num=1
    NEXUS_DEV_MEM_HIGH="${high_num}${max_unit}"
  fi

  # 스왑으로 새기 시작하는 순간 VM 전체가 느려지다 굳는다. 차라리 빨리 죽는다.
  NEXUS_DEV_MEM_SWAP="0"
  NEXUS_DEV_CPU_QUOTA="${NEXUS_DEV_CPU_QUOTA:-600%}"
}
