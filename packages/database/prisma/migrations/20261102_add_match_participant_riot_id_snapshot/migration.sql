-- 내전 참가자 Riot ID 스냅샷.
-- Nexus 계정과 매칭되지 않은 참가자(부계정·대타)도 저장해서 이름으로 보여 주고,
-- 나중에 그 Riot 계정이 등록되면 userId 를 채운다.
ALTER TABLE "match_participants" ADD COLUMN "riotIdSnapshot" TEXT;
