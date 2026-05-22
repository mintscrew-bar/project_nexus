-- 동적 게시판(Board) 도입
-- 기존 PostCategory enum 기반 게시판을 관리자가 추가/수정/삭제 가능한 Board 테이블로 전환한다.
-- category 컬럼은 하위호환/스냅샷 용도로 nullable 보존한다.

-- CreateTable
CREATE TABLE "boards" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT,
    "description" TEXT,
    "iconName" TEXT,
    "color" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "writeRole" "UserRole",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "boards_slug_key" ON "boards"("slug");

-- CreateIndex
CREATE INDEX "boards_isDeleted_isHidden_isActive_order_idx" ON "boards"("isDeleted", "isHidden", "isActive", "order");

-- AlterTable: category 를 nullable 로 완화하고 boardId FK 추가
ALTER TABLE "posts" ALTER COLUMN "category" DROP NOT NULL;
ALTER TABLE "posts" ADD COLUMN "boardId" TEXT;

-- CreateIndex
CREATE INDEX "posts_boardId_isPinned_createdAt_idx" ON "posts"("boardId", "isPinned", "createdAt");

-- AddForeignKey: 게시판 삭제 시 글은 보존(SetNull)
ALTER TABLE "posts" ADD CONSTRAINT "posts_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "boards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 기본 게시판 4개 시드 (기존 enum 값과 1:1 대응, 고정 id 로 백필 단순화)
-- 공지는 MODERATOR 이상만 작성 가능하도록 writeRole 지정
INSERT INTO "boards" ("id", "slug", "name", "fullName", "description", "iconName", "color", "order", "writeRole", "createdAt", "updatedAt") VALUES
  ('board_notice', 'notice', '공지', '공지사항', '운영팀 공지사항', 'Megaphone', 'text-accent-danger', 0, 'MODERATOR', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('board_free',   'free',   '자유', '자유게시판', '자유롭게 이야기하는 공간', 'MessageCircle', 'text-text-secondary', 1, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('board_tip',    'tip',    '팁',   '팁 & 노하우', '게임 팁과 노하우 공유', 'Lightbulb', 'text-accent-gold', 2, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('board_qna',    'qna',    'Q&A',  'Q&A', '질문과 답변', 'HelpCircle', 'text-accent-primary', 3, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

-- 기존 게시글의 boardId 백필 (legacy category enum → board id)
UPDATE "posts" SET "boardId" = 'board_notice' WHERE "category" = 'NOTICE' AND "boardId" IS NULL;
UPDATE "posts" SET "boardId" = 'board_free'   WHERE "category" = 'FREE'   AND "boardId" IS NULL;
UPDATE "posts" SET "boardId" = 'board_tip'    WHERE "category" = 'TIP'    AND "boardId" IS NULL;
UPDATE "posts" SET "boardId" = 'board_qna'    WHERE "category" = 'QNA'    AND "boardId" IS NULL;
