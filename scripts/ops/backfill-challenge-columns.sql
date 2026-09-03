-- 원본 RiotMatchCache → match_participants 지표 컬럼 백필 (순수 SQL)
--
-- TS 루프 버전(apps/api/scripts/backfill-challenge-metrics.ts)은 매치당 왕복이 많아
-- 55 매치/s 였다. 같은 일을 DB 안에서 집합 연산으로 처리한다.
-- 추출 규칙은 extractChallengeMetrics() 와 동일해야 한다.
--
-- 멱등: challengesExtractedAt IS NULL 인 행만 갱신한다.

\set ON_ERROR_STOP on
\timing on

-- 진행 커서. 캐시 행 기준으로 돌아 같은 원본을 10번 detoast 하지 않게 한다.
CREATE TABLE IF NOT EXISTS _backfill_cursor(name text PRIMARY KEY, pos text NOT NULL);
INSERT INTO _backfill_cursor VALUES ('challenge_columns','') ON CONFLICT DO NOTHING;

DO $$
DECLARE
  done bigint := 0;
  batch bigint;
  cur text;
  last text;
BEGIN
  LOOP
    SELECT pos INTO cur FROM _backfill_cursor WHERE name='challenge_columns';

    CREATE TEMP TABLE IF NOT EXISTS chunk(match_id text, riot_id text, pj jsonb) ON COMMIT DROP;

    WITH src AS (
      SELECT rmc."matchId", rmc.data
      FROM riot_match_cache rmc
      WHERE rmc."matchId" > cur
      ORDER BY rmc."matchId"
      LIMIT 500
    )
    INSERT INTO chunk
    SELECT m.id, src."matchId", p
    FROM src
    JOIN matches m ON m."riotMatchId" = src."matchId"
    CROSS JOIN LATERAL jsonb_array_elements(src.data->'info'->'participants') p;

    SELECT max(riot_id) INTO last FROM chunk;
    IF last IS NULL THEN
      -- 이 구간에 정형화된 매치가 없다. 커서만 밀고 계속한다.
      SELECT max("matchId") INTO last FROM (
        SELECT "matchId" FROM riot_match_cache WHERE "matchId" > cur ORDER BY "matchId" LIMIT 500
      ) t;
      EXIT WHEN last IS NULL;
      UPDATE _backfill_cursor SET pos = last WHERE name='challenge_columns';
      COMMIT;
      CONTINUE;
    END IF;

    UPDATE match_participants mp SET
      "kda"                          = (c.pj->'challenges'->>'kda')::double precision,
      "killParticipation"            = (c.pj->'challenges'->>'killParticipation')::double precision,
      "damagePerMinute"              = (c.pj->'challenges'->>'damagePerMinute')::double precision,
      "goldPerMinute"                = (c.pj->'challenges'->>'goldPerMinute')::double precision,
      "teamDamagePercentage"         = (c.pj->'challenges'->>'teamDamagePercentage')::double precision,
      "damageTakenOnTeamPercentage"  = (c.pj->'challenges'->>'damageTakenOnTeamPercentage')::double precision,
      "visionScorePerMinute"         = (c.pj->'challenges'->>'visionScorePerMinute')::double precision,
      "jungleCsBefore10Minutes"      = (c.pj->'challenges'->>'jungleCsBefore10Minutes')::double precision,
      "maxCsAdvantageOnLaneOpponent" = (c.pj->'challenges'->>'maxCsAdvantageOnLaneOpponent')::double precision,
      "effectiveHealAndShielding"    = (c.pj->'challenges'->>'effectiveHealAndShielding')::double precision,
      "laneMinionsFirst10Minutes"    = round((c.pj->'challenges'->>'laneMinionsFirst10Minutes')::numeric),
      "laningPhaseGoldExpAdvantage"  = round((c.pj->'challenges'->>'laningPhaseGoldExpAdvantage')::numeric),
      "maxLevelLeadLaneOpponent"     = round((c.pj->'challenges'->>'maxLevelLeadLaneOpponent')::numeric),
      "soloKills"                    = round((c.pj->'challenges'->>'soloKills')::numeric),
      "turretPlatesTaken"            = round((c.pj->'challenges'->>'turretPlatesTaken')::numeric),
      "controlWardsPlaced"           = round((c.pj->'challenges'->>'controlWardsPlaced')::numeric),
      "skillshotsHit"                = round((c.pj->'challenges'->>'skillshotsHit')::numeric),
      "skillshotsDodged"             = round((c.pj->'challenges'->>'skillshotsDodged')::numeric),
      "saveAllyFromDeath"            = round((c.pj->'challenges'->>'saveAllyFromDeath')::numeric),
      "abilityUses"                  = round((c.pj->'challenges'->>'abilityUses')::numeric),
      "magicDamageToChampions"       = round((c.pj->>'magicDamageDealtToChampions')::numeric),
      "physicalDamageToChampions"    = round((c.pj->>'physicalDamageDealtToChampions')::numeric),
      "trueDamageToChampions"        = round((c.pj->>'trueDamageDealtToChampions')::numeric),
      "damageDealtToObjectives"      = round((c.pj->>'damageDealtToObjectives')::numeric),
      "damageDealtToTurrets"         = round((c.pj->>'damageDealtToTurrets')::numeric),
      "timePlayed"                   = round((c.pj->>'timePlayed')::numeric),
      "champExperience"              = round((c.pj->>'champExperience')::numeric),
      "challengesExtractedAt"        = now()
    FROM chunk c
    WHERE mp."matchId" = c.match_id
      AND mp.puuid = c.pj->>'puuid'
      AND mp."challengesExtractedAt" IS NULL;

    GET DIAGNOSTICS batch = ROW_COUNT;
    done := done + batch;

    UPDATE _backfill_cursor SET pos = last WHERE name='challenge_columns';
    COMMIT;  -- 배치마다 커밋해야 락과 팽창이 쌓이지 않는다
    RAISE NOTICE '컬럼 백필 누적 % (커서 %)', done, last;
  END LOOP;
  RAISE NOTICE '=== 총 % 행 갱신 ===', done;
END $$;

SELECT count(*) FILTER (WHERE "challengesExtractedAt" IS NOT NULL) AS 추출완료,
       count(*) AS 전체 FROM match_participants;
