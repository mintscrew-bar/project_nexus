import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const BATCH_SIZE = 1000;

/**
 * Riot `info.gameVersion` (ex: "14.8.616.1234")에서 패치 버전("14.8")만 추출.
 * 신규 저장 경로와 동일한 규칙을 사용해 일관성을 유지한다.
 */
function parsePatchVersion(data: Prisma.JsonValue): string | null {
  const match = data as { info?: { gameVersion?: unknown } };
  const gameVersion = match?.info?.gameVersion;

  if (typeof gameVersion !== "string") return null;

  const parts = gameVersion.split(".");
  if (parts.length < 2) return null;

  const major = parts[0]?.trim();
  const minor = parts[1]?.trim();
  if (!major || !minor) return null;

  return `${major}.${minor}`;
}

async function main() {
  console.log("🌱 RiotMatchCache.patchVersion 백필 시작...\n");

  let cursorMatchId: string | undefined;
  let processedMatches = 0;
  let updated = 0;
  let skipped = 0;

  while (true) {
    // patchVersion이 NULL인 행만 대상으로 순회
    const rows = await prisma.riotMatchCache.findMany({
      where: { patchVersion: null },
      select: {
        matchId: true,
        data: true,
      },
      orderBy: {
        matchId: "asc",
      },
      take: BATCH_SIZE,
      ...(cursorMatchId
        ? {
            skip: 1,
            cursor: { matchId: cursorMatchId },
          }
        : {}),
    });

    if (rows.length === 0) {
      break;
    }

    // 패치 버전별로 그룹핑해서 updateMany 1회씩 실행 (성능 최적화)
    const buckets = new Map<string, string[]>();
    const invalidMatchIds: string[] = [];

    for (const row of rows) {
      processedMatches++;
      const patchVersion = parsePatchVersion(row.data);
      if (!patchVersion) {
        invalidMatchIds.push(row.matchId);
        continue;
      }
      const bucket = buckets.get(patchVersion) ?? [];
      bucket.push(row.matchId);
      buckets.set(patchVersion, bucket);
    }

    for (const [patchVersion, matchIds] of buckets.entries()) {
      const result = await prisma.riotMatchCache.updateMany({
        where: { matchId: { in: matchIds } },
        data: { patchVersion },
      });
      updated += result.count;
    }

    skipped += invalidMatchIds.length;
    if (invalidMatchIds.length > 0) {
      console.warn(
        `⚠️  gameVersion 파싱 실패 ${invalidMatchIds.length}건 (샘플: ${invalidMatchIds.slice(0, 3).join(", ")})`,
      );
    }

    cursorMatchId = rows[rows.length - 1]?.matchId;

    console.log(
      `• ${processedMatches}경기 처리, 배치 ${rows.length}건 / 누적 업데이트 ${updated}건 / 스킵 ${skipped}건`,
    );
  }

  const remaining = await prisma.riotMatchCache.count({
    where: { patchVersion: null },
  });

  console.log("\n✅ RiotMatchCache.patchVersion 백필 완료");
  console.log(
    `총 처리 ${processedMatches}건, 업데이트 ${updated}건, 파싱 실패 ${skipped}건, 남은 NULL ${remaining}건`,
  );
}

main()
  .catch((error) => {
    console.error("❌ patchVersion 백필 실패:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
