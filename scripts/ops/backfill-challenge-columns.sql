-- 원본 RiotMatchCache → match_participants 지표 컬럼 백필 (순수 SQL)
--
-- TS 루프 버전(apps/api/scripts/backfill-challenge-metrics.ts)은 매치당 왕복이 많아
-- 55 매치/s 였다. 같은 일을 DB 안에서 집합 연산으로 처리한다.
-- 추출 규칙은 extractChallengeMetrics() 와 동일해야 한다.
--
-- 멱등: challengesExtractedAt IS NULL 인 행만 갱신한다.

\set ON_ERROR_STOP on
\timing on

DO $$
DECLARE
  done bigint := 0;
  batch bigint;
BEGIN
  LOOP
    WITH tgt AS (
      SELECT mp.id, p AS pj
      FROM match_participants mp
      JOIN matches m            ON m.id = mp."matchId"
      JOIN riot_match_cache rmc ON rmc."matchId" = m."riotMatchId"
      CROSS JOIN LATERAL jsonb_array_elements(rmc.data->'info'->'participants') p
      WHERE mp."challengesExtractedAt" IS NULL
        AND mp.puuid IS NOT NULL
        AND p->>'puuid' = mp.puuid
      LIMIT 20000
    )
    UPDATE match_participants mp SET
      -- 실수형 지표
      "kda"                          = (pj->'challenges'->>'kda')::double precision,
      "killParticipation"            = (pj->'challenges'->>'killParticipation')::double precision,
      "damagePerMinute"              = (pj->'challenges'->>'damagePerMinute')::double precision,
      "goldPerMinute"                = (pj->'challenges'->>'goldPerMinute')::double precision,
      "teamDamagePercentage"         = (pj->'challenges'->>'teamDamagePercentage')::double precision,
      "damageTakenOnTeamPercentage"  = (pj->'challenges'->>'damageTakenOnTeamPercentage')::double precision,
      "visionScorePerMinute"         = (pj->'challenges'->>'visionScorePerMinute')::double precision,
      "jungleCsBefore10Minutes"      = (pj->'challenges'->>'jungleCsBefore10Minutes')::double precision,
      "maxCsAdvantageOnLaneOpponent" = (pj->'challenges'->>'maxCsAdvantageOnLaneOpponent')::double precision,
      "effectiveHealAndShielding"    = (pj->'challenges'->>'effectiveHealAndShielding')::double precision,
      -- 정수형 지표. Riot 이 정수여야 할 값을 소수로 주는 경우가 있어 반올림한다.
      "laneMinionsFirst10Minutes"    = round((pj->'challenges'->>'laneMinionsFirst10Minutes')::numeric),
      "laningPhaseGoldExpAdvantage"  = round((pj->'challenges'->>'laningPhaseGoldExpAdvantage')::numeric),
      "maxLevelLeadLaneOpponent"     = round((pj->'challenges'->>'maxLevelLeadLaneOpponent')::numeric),
      "soloKills"                    = round((pj->'challenges'->>'soloKills')::numeric),
      "turretPlatesTaken"            = round((pj->'challenges'->>'turretPlatesTaken')::numeric),
      "controlWardsPlaced"           = round((pj->'challenges'->>'controlWardsPlaced')::numeric),
      "skillshotsHit"                = round((pj->'challenges'->>'skillshotsHit')::numeric),
      "skillshotsDodged"             = round((pj->'challenges'->>'skillshotsDodged')::numeric),
      "saveAllyFromDeath"            = round((pj->'challenges'->>'saveAllyFromDeath')::numeric),
      "abilityUses"                  = round((pj->'challenges'->>'abilityUses')::numeric),
      -- 참가자 루트에서 추가 추출
      "magicDamageToChampions"       = round((pj->>'magicDamageDealtToChampions')::numeric),
      "physicalDamageToChampions"    = round((pj->>'physicalDamageDealtToChampions')::numeric),
      "trueDamageToChampions"        = round((pj->>'trueDamageDealtToChampions')::numeric),
      "damageDealtToObjectives"      = round((pj->>'damageDealtToObjectives')::numeric),
      "damageDealtToTurrets"         = round((pj->>'damageDealtToTurrets')::numeric),
      "timePlayed"                   = round((pj->>'timePlayed')::numeric),
      "champExperience"              = round((pj->>'champExperience')::numeric),
      "challengesExtractedAt"        = now()
    FROM tgt WHERE mp.id = tgt.id;

    GET DIAGNOSTICS batch = ROW_COUNT;
    EXIT WHEN batch = 0;
    done := done + batch;
    RAISE NOTICE '컬럼 백필 누적 %', done;
  END LOOP;
  RAISE NOTICE '=== 총 % 행 갱신 ===', done;
END $$;

SELECT count(*) FILTER (WHERE "challengesExtractedAt" IS NOT NULL) AS 추출완료,
       count(*) AS 전체 FROM match_participants;
