-- 킬내기는 사망이 감점(-3)이라 라운드마다 팀 사망 수를 기록해야 한다.
-- 배틀로얄에는 없는 개념이라 기본값 0으로 두고 점수 계산에서만 쓴다.
ALTER TABLE "scrim_team_results" ADD COLUMN "deaths" INTEGER NOT NULL DEFAULT 0;
