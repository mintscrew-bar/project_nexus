/**
 * 밸런스 점수 캐시 백필.
 *
 * 점수는 계정 갱신·내전 종료 시점에만 다시 계산되므로, 캐시를 도입한 직후에는
 * 아무도 값이 없다. 그 상태로 두면 로비·프로필에 점수가 안 보이고, 자동 밸런스가
 * 방을 시작할 때 참가자 전원분을 한꺼번에 계산하게 된다.
 *
 * 산식 버전(BALANCE_SCORE_VERSION)이 올라갔을 때도 같은 스크립트로 다시 채운다.
 *
 * 계산은 BalanceScoreService.refreshAccount 에 그대로 맡긴다 — 예전에는 입력을
 * 모으는 코드를 스크립트가 따로 갖고 있어서, 산식에 입력이 하나 늘 때마다 서비스와
 * 스크립트가 다른 점수를 내놓을 수 있었다.
 *
 * 실행: cd apps/api && npx ts-node --transpile-only src/scripts/backfill-balance-scores.ts
 */
import { PrismaClient } from "@nexus/database";
import { BalanceScoreService } from "../modules/common/balance-score.service";
import { BALANCE_SCORE_VERSION } from "../modules/common/balance-score.util";
import type { PrismaService } from "../modules/prisma/prisma.service";

const prisma = new PrismaClient();
// 서비스는 PrismaClient 의 메서드만 쓰므로 그대로 넘긴다.
const balanceScores = new BalanceScoreService(
  prisma as unknown as PrismaService,
);
const BATCH_SIZE = 200;

async function main() {
  const force = process.argv.includes("--force");
  const total = await prisma.riotAccount.count();
  console.log(
    `대상 라이엇 계정 ${total}건 (현재 산식 ${BALANCE_SCORE_VERSION}${force ? ", --force: 전체 재계산" : ""})`,
  );

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let offset = 0; offset < total; offset += BATCH_SIZE) {
    const accounts = await prisma.riotAccount.findMany({
      skip: offset,
      take: BATCH_SIZE,
      orderBy: { createdAt: "asc" },
      select: { id: true, balanceScoreVersion: true },
    });

    for (const account of accounts) {
      processed++;
      if (!force && account.balanceScoreVersion === BALANCE_SCORE_VERSION) {
        skipped++;
        continue;
      }

      try {
        const scores = await balanceScores.refreshAccount(account.id);
        if (scores) updated++;
      } catch (error) {
        failed++;
        console.warn(`  계정 ${account.id} 실패:`, error);
      }
    }

    console.log(
      `  진행 ${processed}/${total} (갱신 ${updated}, 건너뜀 ${skipped}, 실패 ${failed})`,
    );
  }

  console.log(
    `완료 — 갱신 ${updated}건, 건너뜀 ${skipped}건, 실패 ${failed}건`,
  );
}

main()
  .catch((error) => {
    console.error("백필 실패:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
