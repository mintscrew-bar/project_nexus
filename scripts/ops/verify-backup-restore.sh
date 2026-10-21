#!/usr/bin/env bash
#
# 백업 복구 리허설 — "백업이 있다"가 아니라 "백업으로 실제로 되살릴 수 있다"를 확인한다.
#
# 하는 일:
#   1) 백업 파일을 고른다 (기본: 로컬 최신 core 덤프 / --from-r2: R2 의 최신 core 덤프를 내려받음)
#   2) gzip 무결성 검사
#   3) 운영과 완전히 분리된 임시 postgres 컨테이너를 띄워 복원
#   4) 복원본과 운영 DB 의 테이블별 행 수를 비교
#   5) 임시 컨테이너·볼륨·내려받은 파일을 모두 지운다
#
# 운영과 섞이지 않게 하는 장치:
#   - docker compose 를 쓰지 않는다. dev/prod compose 가 프로젝트·네트워크·서비스명을
#     공유해서 compose 로 띄우면 운영 컨테이너를 건드릴 수 있다(2026-09 사고).
#   - 컨테이너 이름에 PID 를 붙이고 --network none 으로 띄운다. 운영 네트워크에 붙지 않는다.
#   - 메모리·CPU 상한을 건다. 이 호스트는 운영 상주 서버다.
#   - 운영 DB 에는 SELECT count(*) 만 보낸다.
#
# 합격 기준:
#   - 복원 중 psql 에러 0건
#   - 운영에서 행이 있는 테이블이 복원본에서 비어 있지 않을 것
#     (core 덤프가 일부러 데이터를 빼는 riot_match_cache 는 제외)
#   - 덤프 이후 운영에서 행이 늘거나 지워지는 건 정상이라 행 수가 정확히 같을 필요는 없다.
#     다만 복원본이 운영의 50% 미만이면 덤프가 덜 떠졌을 수 있어 경고로 표시한다.
#
# 사용:
#   scripts/ops/verify-backup-restore.sh                 # 로컬 최신 core 덤프
#   scripts/ops/verify-backup-restore.sh --from-r2       # R2 최신 core 덤프 (nexus-ops.env 필요)
#   scripts/ops/verify-backup-restore.sh <파일.sql.gz>   # 지정한 덤프
set -uo pipefail

# shellcheck source=/dev/null
[ -r "${NEXUS_OPS_ENV:-$HOME/.config/nexus-ops.env}" ] && . "${NEXUS_OPS_ENV:-$HOME/.config/nexus-ops.env}"

BACKUP_DIR="${NEXUS_BACKUP_DIR:-$HOME/nexus-backups}"
PG_CONTAINER="${NEXUS_PG_CONTAINER:-nexus-postgres}"
PG_USER="${POSTGRES_USER:-nexus}"
PG_DB="${POSTGRES_DB:-nexus}"
PG_IMAGE="${NEXUS_RESTORE_PG_IMAGE:-postgres:16-alpine}"  # 운영과 같은 메이저 버전
RCLONE_BIN="${NEXUS_RCLONE_BIN:-$HOME/.local/bin/rclone}"
# core 덤프가 데이터를 일부러 빼는 테이블 — 복원본에서 비어 있는 게 정상이다
EXPECTED_EMPTY="riot_match_cache"

TEST_NAME="nexus-restore-test-$$"
WORK=$(mktemp -d)

log() { echo "[restore-test] $*"; }
cleanup() {
  docker rm -f -v "$TEST_NAME" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

# 1) 백업 파일 고르기
SRC="${1:-}"
if [ "$SRC" = "--from-r2" ]; then
  [ -n "${NEXUS_BACKUP_R2_REMOTE:-}" ] || { log "NEXUS_BACKUP_R2_REMOTE 미설정"; exit 1; }
  LATEST=$("$RCLONE_BIN" --config /dev/null lsf "$NEXUS_BACKUP_R2_REMOTE/daily/" --include 'db-core-*.sql.gz' 2>/dev/null | sort | tail -1)
  [ -n "$LATEST" ] || { log "R2 에 core 덤프가 없다"; exit 1; }
  log "R2 에서 내려받는 중: daily/$LATEST"
  "$RCLONE_BIN" --config /dev/null copyto "$NEXUS_BACKUP_R2_REMOTE/daily/$LATEST" "$WORK/$LATEST" || { log "다운로드 실패"; exit 1; }
  DUMP="$WORK/$LATEST"
elif [ -n "$SRC" ]; then
  DUMP="$SRC"
else
  # shellcheck disable=SC2012
  DUMP=$(ls -1t "$BACKUP_DIR"/daily/db-core-*.sql.gz 2>/dev/null | head -1)
fi
[ -n "${DUMP:-}" ] && [ -f "$DUMP" ] || { log "덤프 파일을 찾지 못했다"; exit 1; }
log "대상: $DUMP ($(du -h "$DUMP" | cut -f1))"

# 2) gzip 무결성
if ! gzip -t "$DUMP" 2>/dev/null; then
  log "❌ gzip 무결성 검사 실패 — 파일이 깨져 있다"; exit 1
fi
log "gzip 무결성 OK"

# 3) 임시 postgres 기동 + 복원
#    POSTGRES_USER 를 운영과 같게 둬야 덤프의 OWNER TO 구문이 그대로 통한다.
docker run -d --name "$TEST_NAME" --network none --memory 2g --cpus 2 \
  -e POSTGRES_USER="$PG_USER" -e POSTGRES_DB="$PG_DB" -e POSTGRES_PASSWORD=restore-test \
  "$PG_IMAGE" >/dev/null || { log "임시 컨테이너 기동 실패"; exit 1; }
for _ in $(seq 1 60); do
  docker exec "$TEST_NAME" pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1 && break
  sleep 1
done
# 초기화 스크립트가 끝나며 한 번 재시작하므로 잠깐 더 기다린 뒤 다시 확인한다
sleep 3
docker exec "$TEST_NAME" pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1 \
  || { log "임시 postgres 가 준비되지 않았다"; exit 1; }

log "복원 중... (수 분 걸린다)"
START=$(date +%s)
gunzip -c "$DUMP" | docker exec -i "$TEST_NAME" psql -U "$PG_USER" -d "$PG_DB" -q -v ON_ERROR_STOP=0 \
  >/dev/null 2>"$WORK/restore.err"
# --clean --if-exists 덤프라 빈 DB 에서는 DROP 관련 NOTICE 가 나오지만 에러는 아니다
ERRORS=$(grep -c '^ERROR' "$WORK/restore.err" || true)
log "복원 완료 ($(($(date +%s) - START))s), psql 에러 ${ERRORS}건"
[ "$ERRORS" -gt 0 ] && grep '^ERROR' "$WORK/restore.err" | sort | uniq -c | sort -rn | head -5

# 4) 테이블별 행 수 비교
COUNT_SQL="select string_agg(format('select %L as t, count(*) as n from public.%I', tablename, tablename), ' union all ') from pg_tables where schemaname = 'public'"
count_rows() {
  local container="$1" q
  q=$(docker exec "$container" psql -U "$PG_USER" -d "$PG_DB" -Atc "$COUNT_SQL")
  docker exec "$container" psql -U "$PG_USER" -d "$PG_DB" -At -F ' ' -c "$q order by 1"
}
count_rows "$TEST_NAME" > "$WORK/restored.txt"
count_rows "$PG_CONTAINER" > "$WORK/prod.txt"

FAIL=0
WARN=0
printf '\n%-40s %12s %12s  %s\n' "테이블" "운영" "복원본" ""
while read -r t prod; do
  restored=$(awk -v t="$t" '$1 == t { print $2 }' "$WORK/restored.txt")
  mark=""
  if [ -z "$restored" ]; then
    mark="❌ 복원본에 테이블 없음"; FAIL=$((FAIL + 1)); restored="-"
  elif [ "$prod" -gt 0 ] && [ "$restored" -eq 0 ]; then
    if [[ " $EXPECTED_EMPTY " == *" $t "* ]]; then
      mark="(core 덤프 제외 대상 — 정상)"
    else
      mark="❌ 운영엔 있는데 비어 있음"; FAIL=$((FAIL + 1))
    fi
  elif [ "$prod" -gt 0 ] && [ $((restored * 2)) -lt "$prod" ]; then
    mark="⚠️ 운영의 절반 미만"; WARN=$((WARN + 1))
  fi
  # 행이 있는 테이블과 문제 있는 테이블만 출력한다 (빈 테이블까지 다 찍으면 결과가 묻힌다)
  if [ "$prod" -gt 0 ] || [ -n "$mark" ]; then
    printf '%-40s %12s %12s  %s\n' "$t" "$prod" "$restored" "$mark"
  fi
done < "$WORK/prod.txt"

TABLES=$(wc -l < "$WORK/prod.txt")
echo
if [ "$ERRORS" -eq 0 ] && [ "$FAIL" -eq 0 ]; then
  log "✅ 합격 — 테이블 ${TABLES}개, 경고 ${WARN}건. 이 백업으로 복구할 수 있다."
  exit 0
fi
log "❌ 불합격 — psql 에러 ${ERRORS}건, 실패 테이블 ${FAIL}개, 경고 ${WARN}건"
exit 1
