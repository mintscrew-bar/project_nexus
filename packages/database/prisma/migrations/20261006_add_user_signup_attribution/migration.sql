-- 가입 유입 경로 (첫 방문 쿠키 기준)
ALTER TABLE "users" ADD COLUMN "signupSource" TEXT;
ALTER TABLE "users" ADD COLUMN "signupMedium" TEXT;
ALTER TABLE "users" ADD COLUMN "signupReferrer" TEXT;
