-- 출석 체크 메달 사유 — 하루 출석·7일 연속 보너스
ALTER TYPE "MedalReason" ADD VALUE 'ATTENDANCE';
ALTER TYPE "MedalReason" ADD VALUE 'ATTENDANCE_STREAK';
