#!/usr/bin/env bash
#
# riot_match_cache 중복분 일괄 정리 (1회성 따라잡기)
#
# 무엇을 지우나: 앱 코드의 TasksService.runRiotMatchCacheCleanup() 과 **완전히 같은 조건**이다.
#   1) gameEnd 가 TTL(기본 14일) 보다 오래됐고
#   2) matches 테이블에 대응 행이 있다 (= 정형 인제스트가 끝나 원본 JSON 이 중복인 것)
# 두 조건 중 하나라도 안 맞으면 남는다. 최근 매치와 아직 인제스트 안 된 매치는 보호된다.
#
# 왜 따로 필요한가: 그 크론은 RIOT_MATCH_CACHE_CLEANUP_ENABLED=true 일 때만 도는데
# 운영은 false 라서 한 번도 돌지 않았고, 폐기된 Lab 인제스트가 남긴 10만 건이 쌓였다.
# 앞으로도 자동으로 돌게 하려면 GitHub Secret 을 true 로 바꿔야 한다(이 스크립트와 별개).
#
# 지우지 않는 것 (지우면 기능이 깨진다):
#   - match_participants  : 전적·랭킹·챔피언 통계가 직접 읽는다 (ranking/user/stats/match 서비스)
#   - known_puuids        : stats 가 "부분 통계" 판정에 읽는다
#   - matches             : 위 둘의 부모
#
# 실행 전에 백업을 뜬다: scripts/ops/nexus-backup.sh (full 이 riot_match_cache 를 포함한다)
#
# 사용:
#   scripts/ops/purge-riot-match-cache.sh --dry-run   # 몇 건이 지워질지만 본다 (기본값)
#   scripts/ops/purge-riot-match-cache.sh --apply     # 실제 삭제
#   TTL_DAYS=30 scripts/ops/purge-riot-match-cache.sh --apply
set -euo pipefail

CONTAINER="${NEXUS_PG_CONTAINER:-nexus-postgres}"
PG_USER="${POSTGRES_USER:-nexus}"
PG_DB="${POSTGRES_DB:-nexus}"
TTL_DAYS="${TTL_DAYS:-14}"
BATCH="${BATCH:-10000}"
MODE="${1:---dry-run}"

psql_run() { docker exec -i "$CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 "$@"; }

echo "=== 대상 집계 (TTL ${TTL_DAYS}일) ==="
psql_run <<SQL
SELECT
  (SELECT count(*) FROM riot_match_cache) AS "전체",
  (SELECT count(*) FROM riot_match_cache rmc
     WHERE rmc."gameEnd" < now() - interval '${TTL_DAYS} days'
       AND EXISTS (SELECT 1 FROM matches m WHERE m."riotMatchId" = rmc."matchId")) AS "삭제대상",
  (SELECT count(*) FROM riot_match_cache rmc
     WHERE NOT EXISTS (SELECT 1 FROM matches m WHERE m."riotMatchId" = rmc."matchId")) AS "미인제스트_보호",
  (SELECT count(*) FROM riot_match_cache
     WHERE "gameEnd" >= now() - interval '${TTL_DAYS} days') AS "최근_보호",
  pg_size_pretty(pg_total_relation_size('riot_match_cache')) AS "현재크기";
SQL

if [ "$MODE" != "--apply" ]; then
  echo
  echo "드라이런이다. 실제로 지우려면: $0 --apply"
  exit 0
fi

echo
echo "=== 삭제 시작 (배치 ${BATCH}건) ==="
psql_run <<SQL
DO \$\$
DECLARE
  deleted_total bigint := 0;
  batch bigint;
  cutoff timestamptz := now() - interval '${TTL_DAYS} days';
BEGIN
  LOOP
    -- 배치로 끊어 긴 잠금을 피한다. 운영 중에 돌려도 되게.
    WITH victims AS (
      SELECT rmc."matchId"
      FROM riot_match_cache rmc
      WHERE rmc."gameEnd" < cutoff
        AND EXISTS (SELECT 1 FROM matches m WHERE m."riotMatchId" = rmc."matchId")
      LIMIT ${BATCH}
    )
    DELETE FROM riot_match_cache r USING victims v WHERE r."matchId" = v."matchId";
    GET DIAGNOSTICS batch = ROW_COUNT;
    EXIT WHEN batch = 0;
    deleted_total := deleted_total + batch;
    RAISE NOTICE '누적 삭제 %', deleted_total;
  END LOOP;
  RAISE NOTICE '=== 총 % 건 삭제 ===', deleted_total;
END \$\$;
SQL

echo
echo "=== 삭제 후 ==="
psql_run -c "SELECT count(*) AS 남은행, pg_size_pretty(pg_total_relation_size('riot_match_cache')) AS 크기 FROM riot_match_cache;"
cat <<'NOTE'

참고: 일반 DELETE 는 죽은 튜플을 남기므로 테이블 크기가 바로 줄지 않는다.
      pg_dump 크기와 백업 시간은 즉시 줄어든다(살아 있는 행만 읽으므로).
      디스크를 OS 로 돌려받으려면 VACUUM FULL 이 필요한데 배타 잠금이 걸린다.
      디스크에 여유가 있으면 굳이 하지 않아도 되고, 하려면 트래픽 없는 시간에:
        docker exec nexus-postgres psql -U nexus -d nexus -c 'VACUUM FULL riot_match_cache;'
NOTE
