-- 기존 스트리머는 현재 롤 중심 목록에 노출되고 있었으므로 LOL을 기본 범위로 보존한다.
ALTER TABLE "streamer_profiles"
ADD COLUMN "games" "GameTitle"[] NOT NULL DEFAULT ARRAY['LOL']::"GameTitle"[];
