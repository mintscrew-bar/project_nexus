/**
 * 밸런스 점수 캐시 백필.
 *
 * 점수는 계정 갱신·내전 종료 시점에만 다시 계산되므로, 캐시를 도입한 직후에는
 * 아무도 값이 없다. 그 상태로 두면 로비·프로필에 점수가 안 보이고, 자동 밸런스가
 * 방을 시작할 때 참가자 전원분을 한꺼번에 계산하게 된다.
 *
 * 산식 버전(BALANCE_SCORE_VERSION)이 올라갔을 때도 같은 스크립트로 다시 채운다.
 *
 * 실행: cd apps/api && npx ts-node --transpile-only src/scripts/backfill-balance-scores.ts
 */
import { PrismaClient, Role } from "@nexus/database";
import {
  BALANCE_ROLES,
  BALANCE_SCORE_VERSION,
  calculatePlayerBalanceScores,
} from "../modules/common/balance-score.util";

const prisma = new PrismaClient();
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

  for (let offset = 0; offset < total; offset += BATCH_SIZE) {
    const accounts = await prisma.riotAccount.findMany({
      skip: offset,
      take: BATCH_SIZE,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        tier: true,
        rank: true,
        lp: true,
        peakTier: true,
        peakRank: true,
        peakLp: true,
        soloWins: true,
        soloLosses: true,
        balanceScoreVersion: true,
        roleTiers: {
          select: { role: true, tier: true, rank: true, lp: true },
        },
        user: {
          select: {
            nexusRanking: { select: { wins: true, losses: true } },
            nexusRoleRecords: {
              select: { role: true, wins: true, losses: true },
            },
          },
        },
      },
    });

    for (const account of accounts) {
      processed++;
      if (!force && account.balanceScoreVersion === BALANCE_SCORE_VERSION) {
        skipped++;
        continue;
      }

      const details = calculatePlayerBalanceScores({
        currentTier: {
          tier: account.tier,
          rank: account.rank,
          lp: account.lp,
        },
        peakTier: account.peakTier
          ? {
              tier: account.peakTier,
              rank: account.peakRank,
              lp: account.peakLp,
            }
          : null,
        roleTiers: account.roleTiers,
        soloWins: account.soloWins,
        soloLosses: account.soloLosses,
        overallRecord: account.user?.nexusRanking ?? null,
        roleRecords: account.user?.nexusRoleRecords ?? [],
      });

      const scores = Object.fromEntries(
        BALANCE_ROLES.map((role: Role) => [role, details[role].score]),
      );

      await prisma.riotAccount.update({
        where: { id: account.id },
        data: {
          balanceScores: scores,
          balanceScoreVersion: BALANCE_SCORE_VERSION,
          balanceScoresAt: new Date(),
        },
      });
      updated++;
    }

    console.log(
      `  진행 ${processed}/${total} (갱신 ${updated}, 건너뜀 ${skipped})`,
    );
  }

  console.log(`완료 — 갱신 ${updated}건, 건너뜀 ${skipped}건`);
}

main()
  .catch((error) => {
    console.error("백필 실패:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
