#!/usr/bin/env bash
#
# 운영 스크립트 cron 설치 (sudo 불필요)
#
# 이 호스트에는 passwordless sudo 가 없다. /etc/cron.d 나 /usr/local/bin 에
# 넣는 원래 계획이 막혀서 ops 스크립트들이 작성만 되고 실제로는 돌지 않았다.
# 전부 유저 crontab 으로 설치한다 — 기존 디스크 정리 cron 도 원래 여기 있었다.
#
# 사용:
#   scripts/ops/install-cron.sh          # 설치 / 갱신 (멱등)
#   scripts/ops/install-cron.sh --show   # 현재 등록 상태만 출력
#   scripts/ops/install-cron.sh --remove # 제거
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OPS="$REPO/scripts/ops"
ENV_FILE="$HOME/.config/nexus-ops.env"
LOG_DIR="$HOME/.local/state/nexus-ops"
MARK_BEGIN="# >>> nexus-ops managed block — install-cron.sh >>>"
MARK_END="# <<< nexus-ops <<<"

# 마커에 슬래시·괄호가 섞여도 안전하도록 sed 정규식이 아니라 awk 고정문자열로 다룬다.
strip_block() {
  awk -v b="$MARK_BEGIN" -v e="$MARK_END" '
    index($0, b) { skip = 1 }
    !skip { print }
    index($0, e) { skip = 0 }
  '
}
show_block() {
  awk -v b="$MARK_BEGIN" -v e="$MARK_END" '
    index($0, b) { skip = 1 }
    skip { print }
    index($0, e) { skip = 0 }
  '
}

case "${1:-}" in
  --show)   crontab -l 2>/dev/null | show_block; exit 0 ;;
  --remove) crontab -l 2>/dev/null | strip_block | crontab -
            echo "제거 완료"; exit 0 ;;
esac

mkdir -p "$LOG_DIR" "$(dirname "$ENV_FILE")"

# 웹훅 등 비밀값은 crontab 라인이 아니라 이 파일에 둔다.
# crontab 은 `ps` 나 `crontab -l` 로 쉽게 보이고, 백업·스크린 공유에도 딸려간다.
if [ ! -f "$ENV_FILE" ]; then
  install -m 0600 /dev/null "$ENV_FILE"
  cat > "$ENV_FILE" <<'ENVEOF'
# NEXUS 운영 스크립트 공용 설정 (권한 0600 유지)
# 디스크 정리·디스크 경고·백업 세 스크립트가 이 파일을 공유한다.
#
# `: "${VAR:=값}"` 은 "이미 설정돼 있으면 그대로 두고, 아니면 이 값을 쓴다"는 뜻이다.
# 그냥 VAR="값" 으로 쓰면 파일이 항상 이기기 때문에
# `DISK_ALERT_THRESHOLD=1 ./disk-alert.sh` 같은 일회성 오버라이드가 먹지 않는다.

# Discord 웹훅 — 정리 결과 보고, 디스크 임계 경고, 백업 실패 알림
: "${NEXUS_OPS_WEBHOOK:=}"

# 백업 보관 위치와 개수 (core=매일, full=주간)
: "${NEXUS_BACKUP_DIR:=$HOME/nexus-backups}"
: "${NEXUS_BACKUP_KEEP_DAILY:=14}"
: "${NEXUS_BACKUP_KEEP_WEEKLY:=3}"

# 호스트 밖 사본 (rsync 경로 또는 user@host:/path). 비워두면 로컬 사본만 남는다.
: "${NEXUS_BACKUP_RSYNC_TARGET:=}"

# 디스크 경고 임계치(%)
: "${DISK_ALERT_THRESHOLD:=80}"
ENVEOF
  echo "생성: $ENV_FILE (웹훅을 채워 넣을 것)"
else
  echo "유지: $ENV_FILE (기존 설정 보존)"
fi
chmod 600 "$ENV_FILE"

BLOCK="$MARK_BEGIN
# 매일 03:30 — DB·업로드 백업 (정리보다 먼저 돈다)
30 3 * * * $OPS/nexus-backup.sh >> $LOG_DIR/backup.log 2>&1
# 매일 04:00 — 디스크 정리
0 4 * * * $OPS/nexus-cleanup.sh >> $LOG_DIR/cleanup.log 2>&1
# 30분마다 — 디스크 사용률 경고 (임계 초과 시 하루 1회)
*/30 * * * * $OPS/disk-alert.sh >> $LOG_DIR/disk-alert.log 2>&1
$MARK_END"

# 기존 블록 제거 후 재삽입 = 멱등. 흡수된 구버전 disk-cleanup.sh 라인도 같이 걷어낸다.
# grep -v 는 남는 줄이 하나도 없으면 exit 1 을 낸다. pipefail 과 만나면 설치가
# "기존 cron 이 이 두 줄뿐일 때만" 실패하는 함정이 되므로 awk 로 거른다.
{
  crontab -l 2>/dev/null \
    | strip_block \
    | awk '!index($0, "scripts/disk-cleanup.sh") && !index($0, "# Nexus 디스크 자동 정리")'
  echo "$BLOCK"
} | crontab -

echo
echo "설치 완료 — 현재 등록:"
crontab -l | show_block
echo
echo "로그: $LOG_DIR/"
[ -z "$(. "$ENV_FILE"; echo "${NEXUS_OPS_WEBHOOK:-}")" ] && \
  echo "⚠️  NEXUS_OPS_WEBHOOK 이 비어 있다 — 알림이 가지 않는다. $ENV_FILE 을 채울 것."
exit 0
