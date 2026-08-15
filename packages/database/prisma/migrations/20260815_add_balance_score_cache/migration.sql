-- 자동 밸런스 라인별 점수 캐시
--
-- 점수는 현재 티어·최고 티어·라인 티어·솔랭 승률·내전 전적을 합쳐 계산한다.
-- 방을 조회할 때마다 계산하면 내전 전적 테이블까지 매번 조인해야 하고,
-- 프로필·호버 같은 다른 화면에도 같은 조인을 붙여야 한다. 그래서 미리 계산해 둔다.
--
-- 갱신 시점: 라이엇 계정 등록·수정·동기화, 라인 티어 변경, 내전 종료(랭킹 갱신).
-- balanceScoreVersion 이 현재 산식 버전과 다르면 조회 시 재계산한다.

ALTER TABLE "riot_accounts"
  ADD COLUMN IF NOT EXISTS "balanceScores" JSONB,
  ADD COLUMN IF NOT EXISTS "balanceScoreVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "balanceScoresAt" TIMESTAMP(3);
