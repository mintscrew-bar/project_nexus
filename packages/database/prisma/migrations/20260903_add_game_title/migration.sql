-- 게임 축 도입. 기존 방은 전부 롤이다.
CREATE TYPE "GameTitle" AS ENUM ('LOL', 'PUBG');

ALTER TABLE "rooms" ADD COLUMN "gameTitle" "GameTitle" NOT NULL DEFAULT 'LOL';

-- 방 목록은 항상 게임별로 조회한다
CREATE INDEX "rooms_gameTitle_status_idx" ON "rooms"("gameTitle", "status");
