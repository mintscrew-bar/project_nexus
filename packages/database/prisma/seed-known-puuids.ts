import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 KnownPuuid 시딩 시작...\n");

  const riotAccounts = await prisma.riotAccount.findMany({
    select: {
      puuid: true,
      gameName: true,
      tagLine: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (riotAccounts.length === 0) {
    console.log("ℹ️  시딩할 RiotAccount가 없습니다.");
    return;
  }

  let inserted = 0;
  let updated = 0;

  for (const account of riotAccounts) {
    const existing = await prisma.knownPuuid.findUnique({
      where: { puuid: account.puuid },
      select: {
        puuid: true,
        priority: true,
        isNexusUser: true,
        gameName: true,
        tagLine: true,
      },
    });

    const nextPriority = Math.max(existing?.priority ?? 0, 10);

    await prisma.knownPuuid.upsert({
      where: { puuid: account.puuid },
      create: {
        puuid: account.puuid,
        gameName: account.gameName,
        tagLine: account.tagLine,
        priority: nextPriority,
        isNexusUser: true,
      },
      update: {
        gameName: account.gameName ?? existing?.gameName ?? undefined,
        tagLine: account.tagLine ?? existing?.tagLine ?? undefined,
        priority: nextPriority,
        isNexusUser: true,
      },
    });

    if (existing) {
      updated++;
    } else {
      inserted++;
    }
  }

  console.log(`✅ KnownPuuid 시딩 완료: 신규 ${inserted}건, 업데이트 ${updated}건`);
}

main()
  .catch((error) => {
    console.error("❌ KnownPuuid 시딩 실패:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
