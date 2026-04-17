import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const BATCH_SIZE = 1000;

function extractParticipantPuuids(data: Prisma.JsonValue): string[] {
  const match = data as { metadata?: { participants?: unknown } };
  const participants = match?.metadata?.participants;

  if (!Array.isArray(participants)) {
    return [];
  }

  return participants.filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
}

async function main() {
  console.log("🌱 RiotMatchCache 기반 KnownPuuid 백필 시작...\n");

  let cursorMatchId: string | undefined;
  let processedMatches = 0;
  let inserted = 0;
  let updated = 0;

  while (true) {
    const rows = await prisma.riotMatchCache.findMany({
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

    const puuids = new Set<string>();

    for (const row of rows) {
      processedMatches++;
      for (const puuid of extractParticipantPuuids(row.data)) {
        puuids.add(puuid);
      }
    }

    for (const puuid of puuids) {
      const existing = await prisma.knownPuuid.findUnique({
        where: { puuid },
        select: {
          puuid: true,
          priority: true,
        },
      });

      await prisma.knownPuuid.upsert({
        where: { puuid },
        create: {
          puuid,
          priority: existing?.priority ?? 0,
        },
        update: {
          priority: existing?.priority ?? 0,
        },
      });

      if (existing) {
        updated++;
      } else {
        inserted++;
      }
    }

    cursorMatchId = rows[rows.length - 1]?.matchId;

    console.log(
      `• ${processedMatches}경기 처리, 배치 PUUID ${puuids.size}개, 누적 신규 ${inserted}건 / 업데이트 ${updated}건`,
    );
  }

  console.log("\n✅ RiotMatchCache 기반 KnownPuuid 백필 완료");
  console.log(
    `총 경기 ${processedMatches}건, 신규 ${inserted}건, 업데이트 ${updated}건`,
  );
}

main()
  .catch((error) => {
    console.error("❌ KnownPuuid 백필 실패:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
