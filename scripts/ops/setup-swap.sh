#!/usr/bin/env bash
#
# swap 파일 생성 (TODO_server_reliability Task 4)
#
# 메모리가 바닥나면 OOM-killer가 무엇을 죽일지 고르지 않는다. 2026-08-06에는
# WSL이 OOM에 빠지면서 healthcheck부터 무너졌고, 최악의 경우 sshd·tailscaled가
# 죽어 원격 복구 경로 자체가 끊긴다. swap은 그 순간을 느리게 만들어
# "죽는" 대신 "느려지는" 쪽으로 바꾼다.
#
# swappiness=10: 평소에는 거의 쓰지 않고 정말 부족할 때만 쓰게 한다.
#
# ⚠️ 이 스크립트는 호스트를 변경한다. 실행 전 아래를 확인할 것:
#   - 여유 디스크가 SWAP_SIZE보다 충분한가 (df -h /)
#   - WSL이면 .wslconfig의 swap 설정과 중복되지 않는가
#
# 실행: sudo bash scripts/ops/setup-swap.sh
set -euo pipefail

SWAP_FILE="${SWAP_FILE:-/swapfile}"
SWAP_SIZE="${SWAP_SIZE:-4G}"
SWAPPINESS="${SWAPPINESS:-10}"

if [ "$(id -u)" -ne 0 ]; then
  echo "root 권한이 필요합니다: sudo bash $0" >&2
  exit 1
fi

if swapon --show | grep -q .; then
  echo "이미 활성화된 swap이 있습니다:"
  swapon --show
  echo "새로 만들려면 기존 swap을 먼저 끄세요 (swapoff -a)."
  exit 0
fi

AVAIL_KB=$(df --output=avail / | tail -1 | tr -dc '0-9')
# 4G → 4194304KB. 여유가 swap 크기의 2배는 남아야 안전하다.
NEED_KB=$(numfmt --from=iec "${SWAP_SIZE}" | awk '{print int($1/1024)}')
if [ "$AVAIL_KB" -lt $((NEED_KB * 2)) ]; then
  echo "디스크 여유 부족: $(df -h / | tail -1)" >&2
  echo "swap ${SWAP_SIZE}을 만들려면 최소 그 2배의 여유를 권장합니다." >&2
  exit 1
fi

echo "swap 파일 생성: ${SWAP_FILE} (${SWAP_SIZE})"
# fallocate는 희소 파일을 만들 수 있어 swap에 부적합한 파일시스템이 있다.
# 실패하면 dd로 실제 블록을 채운다.
fallocate -l "$SWAP_SIZE" "$SWAP_FILE" 2>/dev/null || {
  echo "fallocate 실패 — dd로 생성"
  dd if=/dev/zero of="$SWAP_FILE" bs=1M count="$((NEED_KB / 1024))" status=progress
}
chmod 600 "$SWAP_FILE"
mkswap "$SWAP_FILE"
swapon "$SWAP_FILE"

# 재부팅 후에도 유지
if ! grep -q "^${SWAP_FILE} " /etc/fstab; then
  echo "${SWAP_FILE} none swap sw 0 0" >> /etc/fstab
  echo "/etc/fstab 에 등록했습니다."
fi

sysctl -w "vm.swappiness=${SWAPPINESS}"
if ! grep -q "^vm.swappiness" /etc/sysctl.conf; then
  echo "vm.swappiness=${SWAPPINESS}" >> /etc/sysctl.conf
fi

echo "완료:"
swapon --show
free -h
