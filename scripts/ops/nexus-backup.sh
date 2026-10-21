#!/usr/bin/env bash
#
# DB·업로드 백업 (TODO_improvements Task 6)
#
# 왜 필요한가: Postgres 데이터와 사용자 업로드가 각각 도커 네임드 볼륨
# (nexus_postgres_data / nexus_uploads_data) 한 벌로만 존재한다. 볼륨이 깨지면 전손이다.
# 배포 직전 덤프를 뜨던 scripts/deploy.sh 는 배포가 GitHub Actions 로 넘어가면서
# 더 이상 실행되지 않는다.
#
# 왜 2단계로 나누는가 (2026-09-03 실측):
#   DB 6.7GB 중 riot_match_cache 가 4.8GB 다. 폐기된 Lab 인제스트가 남긴 외부 매치
#   원본 JSON 이고, Riot 에서 다시 받을 수 있는 캐시다. 이걸 매일 뜨면 덤프 한 번에
#   500MB+ / 수 분이 걸려서 백업 자체를 안 돌리게 된다.
#   정작 대체 불가능한 데이터(유저 387, 클랜 10, 내전 매치 19, 채팅 1.8k)는 훨씬 작다.
#   → core(캐시 데이터 제외)를 매일, full(전체)을 주 1회.
#   core 에도 riot_match_cache 의 *스키마* 는 들어가므로 복원 후 테이블은 존재한다(비어 있을 뿐).
#
# 설치: scripts/ops/install-cron.sh (sudo 불필요, 유저 crontab)
# 수동 실행: scripts/ops/nexus-backup.sh
# 복원 절차: docs/setup/RECOVERY_PLAYBOOK.md
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
[ -r "${NEXUS_OPS_ENV:-$HOME/.config/nexus-ops.env}" ] && . "${NEXUS_OPS_ENV:-$HOME/.config/nexus-ops.env}"

BACKUP_DIR="${NEXUS_BACKUP_DIR:-$HOME/nexus-backups}"
KEEP_DAILY="${NEXUS_BACKUP_KEEP_DAILY:-14}"   # core 일간 보관 개수 (작아서 넉넉히 둔다)
KEEP_WEEKLY="${NEXUS_BACKUP_KEEP_WEEKLY:-3}"  # full 주간 보관 개수
# 매일 full 을 뜨고 싶으면 1 로 둔다 (덤프 시간·용량이 크게 늘어난다)
FULL_EVERY_RUN="${NEXUS_BACKUP_FULL_EVERY_RUN:-0}"
# 데이터를 빼는 테이블 — 스키마는 유지되고 행만 비운다
EXCLUDE_ARGS=(--exclude-table-data=riot_match_cache)
WEBHOOK="${NEXUS_OPS_WEBHOOK:-}"
PG_CONTAINER="${NEXUS_PG_CONTAINER:-nexus-postgres}"
PG_USER="${POSTGRES_USER:-nexus}"
PG_DB="${POSTGRES_DB:-nexus}"

STAMP=$(date +%Y%m%d-%H%M%S)
DOW=$(date +%u) # 7 = 일요일
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"

log() { echo "[nexus-backup] $*"; }
fail() { log "FAIL: $*"; FAILED="${FAILED:-}${FAILED:+, }$1"; }

notify() {
  [ -z "$WEBHOOK" ] && return 0
  curl -fsS -X POST -H "Content-Type: application/json" -d @- "$WEBHOOK" >/dev/null 2>&1 <<JSON || true
{"content": $(printf '%s' "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}
JSON
}

START=$(date +%s)
log "=== 백업 시작 $STAMP ==="

# 1) Postgres 논리 덤프. --clean --if-exists 로 복원 시 기존 객체를 지우고 덮어쓴다.
#    파이프라인이라 pg_dump 가 죽어도 빈 gz 가 남아 성공처럼 보인다.
#    PIPESTATUS 와 크기 둘 다로 확인한다.
dump_db() {
  local out="$1" label="$2"; shift 2
  docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" --clean --if-exists "$@" 2>/dev/null \
    | gzip -9 > "$out"
  local rc=${PIPESTATUS[0]}
  local size; size=$(stat -c %s "$out" 2>/dev/null || echo 0)
  if [ "$rc" -ne 0 ] || [ "$size" -lt 1024 ]; then
    rm -f "$out"; fail "$label 덤프 실패(rc=$rc, ${size}B)"; return 1
  fi
  log "$label 덤프 완료 — $(du -h "$out" | cut -f1)"
}

# core — 매일. 대체 불가능한 데이터만.
DUMP="$BACKUP_DIR/daily/db-core-$STAMP.sql.gz"
dump_db "$DUMP" "core" "${EXCLUDE_ARGS[@]}"

# full — 주 1회(일요일) 또는 강제 설정 시. 외부 매치 캐시까지 포함.
FULLDUMP=""
if [ "$DOW" = "7" ] || [ "$FULL_EVERY_RUN" = "1" ]; then
  FULLDUMP="$BACKUP_DIR/weekly/db-full-$STAMP.sql.gz"
  dump_db "$FULLDUMP" "full" || FULLDUMP=""
fi

# 2) 업로드 볼륨.
#    ⚠️ 운영은 UPLOAD_DRIVER=r2 라서 실제 파일은 Cloudflare R2 에 있고 이 볼륨은 비어 있다.
#    (2026-09-03 확인: 0개 파일). 이 덤프는 UPLOAD_DRIVER=local 로 돌리는 환경용 폴백이고,
#    운영에서는 사실상 빈 tar 가 나온다 — **R2 버킷 백업은 이 스크립트가 다루지 않는다.**
#    R2 쪽 보호는 별도 결정이 필요하다(버킷 버저닝 또는 주기적 rclone 동기화).
UPLOADS="$BACKUP_DIR/daily/uploads-$STAMP.tar.gz"
if docker run --rm -v nexus_uploads_data:/data:ro alpine \
     tar czf - -C /data . > "$UPLOADS" 2>/dev/null; then
  log "업로드 백업 완료 — $(du -h "$UPLOADS" | cut -f1)"
else
  rm -f "$UPLOADS"; fail "업로드 백업 실패"
fi

# 3) 업로드도 일요일치는 주간 보관으로 하드링크(용량 추가 소모 없음)
if [ "$DOW" = "7" ] && [ -f "$UPLOADS" ]; then
  ln -f "$UPLOADS" "$BACKUP_DIR/weekly/$(basename "$UPLOADS")" 2>/dev/null || true
  log "업로드 주간 보관본 생성"
fi

# 4) 로테이션 — 오래된 것부터 지운다
rotate() {
  local dir="$1" pattern="$2" keep="$3"
  # shellcheck disable=SC2012
  ls -1t "$dir"/$pattern 2>/dev/null | tail -n "+$((keep + 1))" | while read -r old; do
    rm -f "$old" && log "삭제: $(basename "$old")"
  done
}
rotate "$BACKUP_DIR/daily"  "db-core-*.sql.gz"   "$KEEP_DAILY"
rotate "$BACKUP_DIR/daily"  "uploads-*.tar.gz"   "$KEEP_DAILY"
rotate "$BACKUP_DIR/weekly" "db-full-*.sql.gz"   "$KEEP_WEEKLY"
rotate "$BACKUP_DIR/weekly" "uploads-*.tar.gz"   "$KEEP_WEEKLY"

# 5) 호스트 밖 사본 — 설정돼 있을 때만. 볼륨이 아니라 호스트가 통째로 죽는 경우 대비.
if [ -n "${NEXUS_BACKUP_RSYNC_TARGET:-}" ]; then
  if rsync -a --delete "$BACKUP_DIR/" "$NEXUS_BACKUP_RSYNC_TARGET/" 2>/dev/null; then
    log "외부 동기화 완료 → $NEXUS_BACKUP_RSYNC_TARGET"
  else
    fail "외부 동기화 실패"
  fi
fi

# 6) Cloudflare R2 오프사이트 사본 — NEXUS_BACKUP_R2_REMOTE 가 설정돼 있을 때만.
#
#    왜 sync 가 아니라 copy --immutable 인가:
#      sync 는 로컬과 똑같이 맞추므로, 로컬 백업 폴더가 실수(rm)나 디스크 손상으로
#      비면 다음 실행 때 R2 사본까지 같이 지운다. 오프사이트 사본은 로컬이 망가졌을
#      때 쓰려고 두는 것이라, 로컬 상태에 끌려가면 안 된다.
#      → 올리기만 하고, 이미 올라간 파일은 절대 덮어쓰지 않는다(--immutable).
#      → 삭제는 R2 버킷의 수명주기 규칙(daily/ 30일, weekly/ 90일)이 맡는다.
#
#    자격증명은 rclone 설정 파일 대신 nexus-ops.env 의 RCLONE_CONFIG_<리모트>_* 환경변수로
#    받는다. 백업 전용 비공개 버킷 + 그 버킷만 쓸 수 있는 토큰을 쓴다 — 업로드용 버킷은
#    공개 버킷이라 DB 덤프를 넣으면 안 된다.
#      예) NEXUS_BACKUP_R2_REMOTE=nexusr2:nexus-db-backups
#          RCLONE_CONFIG_NEXUSR2_TYPE=s3
#          RCLONE_CONFIG_NEXUSR2_PROVIDER=Cloudflare
#          RCLONE_CONFIG_NEXUSR2_ENDPOINT=https://<계정ID>.r2.cloudflarestorage.com
#          RCLONE_CONFIG_NEXUSR2_ACCESS_KEY_ID=...
#          RCLONE_CONFIG_NEXUSR2_SECRET_ACCESS_KEY=...
#          RCLONE_CONFIG_NEXUSR2_NO_CHECK_BUCKET=true   # 버킷 한정 토큰은 버킷 생성 권한이 없다
#
#    cron 의 PATH 에는 ~/.local/bin 이 없으므로 rclone 은 절대 경로로 부른다.
RCLONE_BIN="${NEXUS_RCLONE_BIN:-$HOME/.local/bin/rclone}"
# 설정 파일은 쓰지 않는다(전부 환경변수) — 없다는 NOTICE 가 매일 로그에 찍히지 않게 막아 둔다
RCLONE_ARGS=(--config /dev/null)
if [ -n "${NEXUS_BACKUP_R2_REMOTE:-}" ]; then
  if [ ! -x "$RCLONE_BIN" ]; then
    fail "R2 업로드 실패(rclone 없음: $RCLONE_BIN)"
  elif "$RCLONE_BIN" "${RCLONE_ARGS[@]}" copy "$BACKUP_DIR/" "$NEXUS_BACKUP_R2_REMOTE/" \
         --immutable --retries 3 --low-level-retries 10 --stats-log-level NOTICE 2>&1 \
         | grep -v 'NOTICE: *$' | sed 's/^/[nexus-backup] rclone: /'; [ "${PIPESTATUS[0]}" -eq 0 ]; then
    # 업로드가 "성공"했다는 것과 R2 에 온전한 파일이 있다는 것은 다르다.
    # 이번 회차에 만든 파일만 골라 R2 쪽 체크섬과 대조한다.
    # (멀티파트 업로드는 ETag 가 MD5 가 아니지만, rclone 이 업로드 때 MD5 를 메타데이터로
    #  남겨 두므로 check 가 비교할 수 있다)
    CHECK_LIST=$(mktemp)
    for f in "$DUMP" "$FULLDUMP" "$UPLOADS"; do
      [ -n "$f" ] && [ -f "$f" ] && echo "${f#"$BACKUP_DIR"/}" >> "$CHECK_LIST"
    done
    if "$RCLONE_BIN" "${RCLONE_ARGS[@]}" check "$BACKUP_DIR/" "$NEXUS_BACKUP_R2_REMOTE/" \
         --one-way --files-from "$CHECK_LIST" >/dev/null 2>&1; then
      log "R2 업로드·체크섬 검증 완료 → $NEXUS_BACKUP_R2_REMOTE ($(wc -l < "$CHECK_LIST")개)"
    else
      fail "R2 체크섬 불일치"
    fi
    rm -f "$CHECK_LIST"
  else
    fail "R2 업로드 실패"
  fi
fi

if [ -z "${NEXUS_BACKUP_RSYNC_TARGET:-}" ] && [ -z "${NEXUS_BACKUP_R2_REMOTE:-}" ]; then
  log "오프사이트 사본 미설정 — 호스트 로컬 사본만 존재 (호스트 전손 시 함께 사라짐)"
fi

ELAPSED=$(($(date +%s) - START))
TOTAL=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
log "=== 완료 (${ELAPSED}s) — 보관 총량 $TOTAL ==="

if [ -n "${FAILED:-}" ]; then
  notify "🔴 **NEXUS 백업 실패** — ${FAILED}"$'\n'"보관 총량: \`${TOTAL}\`"
  exit 1
fi
# 성공은 조용히 넘어간다. 매일 오는 성공 알림은 곧 무시하게 되고, 그러면 실패도 놓친다.
exit 0
