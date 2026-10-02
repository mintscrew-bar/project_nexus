ALTER TABLE "boards" ADD COLUMN "gameTitle" "GameTitle";
CREATE INDEX "boards_gameTitle_idx" ON "boards"("gameTitle");

-- 기존 롤 게시판은 그대로 보존하고, 사이트 공지 게시판은 두 게임에 공통 노출한다.
UPDATE "boards" SET "gameTitle" = 'LOL' WHERE "slug" <> 'notice';

-- slug의 기존 고유 제약과 옛 링크를 유지하며 배그 게시판을 별도로 만든다.
INSERT INTO "boards" ("id", "slug", "name", "fullName", "description", "iconName", "order", "gameTitle", "updatedAt")
VALUES
('board-pubg-free', 'pubg-free', '자유', '배그 자유게시판', '배그 이야기와 내전 후기를 나누세요.', 'MessageCircle', 10, 'PUBG', CURRENT_TIMESTAMP),
('board-pubg-tip', 'pubg-tip', '팁', '배그 팁 게시판', '배그 운영과 플레이 팁을 나누세요.', 'Lightbulb', 11, 'PUBG', CURRENT_TIMESTAMP),
('board-pubg-qna', 'pubg-qna', '질문', '배그 질문 게시판', '배그와 배그 내전 관련 질문을 남겨주세요.', 'HelpCircle', 12, 'PUBG', CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
