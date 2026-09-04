-- 배그 경기 모드. 킬내기(2팀)와 배틀로얄(다팀)은 정원도 결과 처리도 다르다.
CREATE TYPE "PubgGameMode" AS ENUM ('KILL_MATCH', 'BATTLE_ROYALE', 'FREE_MATCH');

ALTER TABLE "rooms" ADD COLUMN "pubgGameMode" "PubgGameMode";

-- 모드가 생기기 전에 만들어진 배그 방은 전부 배틀로얄로 본다.
UPDATE "rooms" SET "pubgGameMode" = 'BATTLE_ROYALE'
WHERE "gameTitle" = 'PUBG' AND "pubgGameMode" IS NULL;

-- 방 제목의 플랫폼 접두사는 저장하지 않고 표시할 때 붙인다.
-- 저장해 두면 방장이 제목을 고칠 때마다 겹쳐 붙거나 사라진다.
UPDATE "rooms"
SET "name" = regexp_replace("name", '^\[(스배|카배)\]\s*', '')
WHERE "gameTitle" = 'PUBG';
