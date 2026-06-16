-- RiotAccount에 peakLp 컬럼 추가 — 솔로랭크 최고 LP 기록용
-- 멱등: IF NOT EXISTS로 이미 수동 추가된 환경에서도 안전 실행
ALTER TABLE "riot_accounts" ADD COLUMN IF NOT EXISTS "peakLp" INTEGER;
