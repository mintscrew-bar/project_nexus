-- 가위바위보 진영 결정: 매치별 블루 사이드 팀 저장
-- 이 팀이 블루 사이드, 나머지(teamA/teamB 중)가 레드. 관계 없는 nullable 팀 id(표시·안내용).

-- AlterTable
-- 멱등: 운영엔 핫픽스로 이미 수동 추가됨(2026-06-02). 다음 migrate deploy가 no-op으로 안전 실행·기록.
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "blueSideTeamId" TEXT;
