-- 원본 캐시를 TTL 로 버리기 전에 "컬럼으로 안 뽑은 것 전부"를 옮겨 담는 아카이브.
-- 매치당 한 행 + 0값 키 제거로 실측 4배 축소(44.5KB → 11KB).
CREATE TABLE "riot_match_archives" (
  "matchId"   TEXT NOT NULL,
  "payload"   JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "riot_match_archives_pkey" PRIMARY KEY ("matchId")
);
