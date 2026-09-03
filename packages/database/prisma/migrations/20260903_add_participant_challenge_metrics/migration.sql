-- Riot challenges 중 분석 가치가 있는 지표를 정형 컬럼으로 내린다.
-- 목적: RiotMatchCache(원본 JSON, 4.8GB)를 TTL 로 버려도 자산이 남게 하는 것.
-- 전부 nullable 이라 PG11+ 에서 ALTER 는 즉시 완료된다(테이블 재작성 없음).
ALTER TABLE "match_participants"
  ADD COLUMN "kda"                          DOUBLE PRECISION,
  ADD COLUMN "killParticipation"            DOUBLE PRECISION,
  ADD COLUMN "damagePerMinute"              DOUBLE PRECISION,
  ADD COLUMN "goldPerMinute"                DOUBLE PRECISION,
  ADD COLUMN "teamDamagePercentage"         DOUBLE PRECISION,
  ADD COLUMN "damageTakenOnTeamPercentage"  DOUBLE PRECISION,
  ADD COLUMN "visionScorePerMinute"         DOUBLE PRECISION,
  ADD COLUMN "laneMinionsFirst10Minutes"    INTEGER,
  ADD COLUMN "jungleCsBefore10Minutes"      DOUBLE PRECISION,
  ADD COLUMN "laningPhaseGoldExpAdvantage"  INTEGER,
  ADD COLUMN "maxCsAdvantageOnLaneOpponent" DOUBLE PRECISION,
  ADD COLUMN "maxLevelLeadLaneOpponent"     INTEGER,
  ADD COLUMN "soloKills"                    INTEGER,
  ADD COLUMN "turretPlatesTaken"            INTEGER,
  ADD COLUMN "effectiveHealAndShielding"    DOUBLE PRECISION,
  ADD COLUMN "controlWardsPlaced"           INTEGER,
  ADD COLUMN "skillshotsHit"                INTEGER,
  ADD COLUMN "skillshotsDodged"             INTEGER,
  ADD COLUMN "saveAllyFromDeath"            INTEGER,
  ADD COLUMN "abilityUses"                  INTEGER,
  ADD COLUMN "magicDamageToChampions"       INTEGER,
  ADD COLUMN "physicalDamageToChampions"    INTEGER,
  ADD COLUMN "trueDamageToChampions"        INTEGER,
  ADD COLUMN "damageDealtToObjectives"      INTEGER,
  ADD COLUMN "damageDealtToTurrets"         INTEGER,
  ADD COLUMN "timePlayed"                   INTEGER,
  ADD COLUMN "champExperience"              INTEGER,
  ADD COLUMN "challengesExtractedAt"        TIMESTAMP(3);

-- 백필 진행 상황과 미추출 행 조회용.
CREATE INDEX "match_participants_challengesExtractedAt_idx"
  ON "match_participants" ("challengesExtractedAt");
