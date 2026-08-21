-- 100판 캡 시절에 'done' 으로 끝난 스캔은 시즌 전체를 훑은 게 아니다.
-- 예전 스캔은 puuid 당 최근 100경기만 보고 끝냈으므로, 100판을 넘게 한 사람은
-- 나머지 시즌이 통째로 빠져 있다(실측: 계정당 평균 279판, 최대 1851판).
--
-- 배치 이어받기로 바뀐 지금은 커서를 0으로 되돌리면 시즌 끝까지 훑는다.
-- 우선순위는 배경 백필과 같은 -10 으로 낮춰, 사람이 기다리는 전적 조회가
-- 항상 먼저 처리되게 한다.
UPDATE "champion_scan_states"
SET "status" = 'queued',
    "scannedCount" = 0,
    "priority" = LEAST("priority", -10),
    "updatedAt" = NOW()
WHERE "status" = 'done'
  AND "scannedCount" >= 100;
