-- 자동 밸런스 재편성 횟수
--
-- 편성 확인 단계에서 방장은 마음에 드는 팀이 나올 때까지 다시 돌릴 수 있다.
-- 횟수를 제한하면 라인 사고 같은 정당한 재편성까지 막히므로, 대신 참가자
-- 전원에게 몇 번 돌렸는지 보여 투명하게 만든다.
ALTER TABLE "rooms"
  ADD COLUMN IF NOT EXISTS "autoBalanceRerollCount" INTEGER NOT NULL DEFAULT 0;
