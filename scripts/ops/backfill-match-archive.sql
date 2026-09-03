-- 원본 RiotMatchCache → RiotMatchArchive 이관 (순수 SQL, 배치)
--
-- 보존 대상: MatchParticipant 컬럼으로 안 뽑은 것 전부.
--   c = participants[].challenges 전체 (0/false 키만 제거 — 없으면 0으로 읽으면 되므로 무손실)
--   x = participants[] 루트 중 컬럼에 없는 키 (핑 통계, lane, killingSprees, PlayerScore* 등)
--   t = info.teams (밴, 오브젝트 집계)
-- 매치당 한 행으로 묶는다 — 참가자별로 쪼개면 TOAST 압축이 행 단위라 오히려 커진다.
--
-- 멱등: ON CONFLICT DO NOTHING. 중단 후 같은 명령으로 이어서 돌리면 된다.

\set ON_ERROR_STOP on
\timing on

CREATE TEMP TABLE IF NOT EXISTS colk(k text);
TRUNCATE colk;
INSERT INTO colk VALUES
 ('puuid'),('teamId'),('championId'),('championName'),('teamPosition'),
 ('summoner1Id'),('summoner2Id'),('kills'),('deaths'),('assists'),
 ('totalMinionsKilled'),('neutralMinionsKilled'),('goldEarned'),('goldSpent'),
 ('totalDamageDealt'),('totalDamageDealtToChampions'),('totalDamageTaken'),
 ('totalHeal'),('damageSelfMitigated'),('visionScore'),('wardsPlaced'),
 ('wardsKilled'),('detectorWardsPlaced'),('item0'),('item1'),('item2'),('item3'),
 ('item4'),('item5'),('item6'),('perks'),('champLevel'),('largestKillingSpree'),
 ('largestMultiKill'),('longestTimeSpentLiving'),('totalTimeSpentDead'),
 ('turretKills'),('inhibitorKills'),('dragonKills'),('baronKills'),
 ('doubleKills'),('tripleKills'),('quadraKills'),('pentaKills'),
 ('firstBloodKill'),('firstTowerKill'),('win'),('challenges'),
 ('magicDamageDealtToChampions'),('physicalDamageDealtToChampions'),
 ('trueDamageDealtToChampions'),('damageDealtToObjectives'),
 ('damageDealtToTurrets'),('timePlayed'),('champExperience'),('participantId');

DO $$
DECLARE
  moved bigint := 0;
  batch bigint;
BEGIN
  LOOP
    WITH src AS (
      SELECT rmc."matchId", rmc.data
      FROM riot_match_cache rmc
      LEFT JOIN riot_match_archives a ON a."matchId" = rmc."matchId"
      WHERE a."matchId" IS NULL
      LIMIT 2000
    ), built AS (
      SELECT src."matchId",
        jsonb_build_object(
          'p', (SELECT jsonb_agg(jsonb_build_object(
                  'id', p->>'puuid',
                  'c', (SELECT jsonb_object_agg(k,v) FROM jsonb_each(p->'challenges') e(k,v)
                         WHERE v NOT IN ('0'::jsonb,'0.0'::jsonb,'false'::jsonb,'""'::jsonb)),
                  'x', (SELECT jsonb_object_agg(k,v) FROM jsonb_each(p) e(k,v)
                         WHERE k NOT IN (SELECT k FROM colk)
                           AND v NOT IN ('0'::jsonb,'0.0'::jsonb,'false'::jsonb,'""'::jsonb))
                ))
              FROM jsonb_array_elements(src.data->'info'->'participants') p),
          't', src.data->'info'->'teams'
        ) AS payload
      FROM src
    )
    INSERT INTO riot_match_archives ("matchId", payload)
    SELECT "matchId", payload FROM built
    ON CONFLICT ("matchId") DO NOTHING;

    GET DIAGNOSTICS batch = ROW_COUNT;
    EXIT WHEN batch = 0;
    moved := moved + batch;
    RAISE NOTICE '아카이브 이관 누적 %', moved;
  END LOOP;
  RAISE NOTICE '=== 총 % 건 이관 ===', moved;
END $$;

SELECT
  (SELECT count(*) FROM riot_match_cache)    AS 원본,
  (SELECT count(*) FROM riot_match_archives) AS 아카이브,
  pg_size_pretty(pg_total_relation_size('riot_match_cache'))    AS 원본크기,
  pg_size_pretty(pg_total_relation_size('riot_match_archives')) AS 아카이브크기;
