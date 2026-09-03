/**
 * 기존 RiotMatchCache 원본 JSON → match_participants 지표 백필.
 *
 * 왜 지금인가: 원본 캐시(4.8GB)를 TTL 로 버리기로 했는데, 그 안의
 * challenges(129키)는 Riot 이 서버에서 계산해 주는 값이라 우리 컬럼으로
 * 되계산할 수 없다. match-v5 는 오래된 매치를 영구히 주지도 않는다.
 * **원본이 아직 있는 지금이 유일한 백필 기회다.**
 *
 * 추출 규칙은 인제스트와 반드시 같아야 하므로 같은 함수를 쓴다
 * (riot-match-cache-ingest.service.ts 의 extractChallengeMetrics).
 *
 * 사용 (apps/api 에서):
 *   pnpm backfill:challenges            # 드라이런
 *   pnpm backfill:challenges --apply    # 실제 백필
 *
 * 운영 DB 는 컨테이너 내부 네트워크 전용이라 호스트에서 돌릴 때는
 * DATABASE_URL 의 호스트명을 postgres 컨테이너 IP 로 바꿔 준다:
 *   PG_IP=$(docker inspect nexus-postgres -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
 *
 * 옵션: BATCH=200 (매치 단위 배치 크기)
 */
import { PrismaClient } from "@nexus/database";
import { extractChallengeMetrics } from "../src/modules/match/riot-match-cache-ingest.service";
import type { ParticipantDto } from "../src/modules/riot/riot-match.service";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const BATCH = Number(process.env.BATCH ?? 200);

async function main() {
  const totalCache = await prisma.riotMatchCache.count();
  const pending = await prisma.matchParticipant.count({
    where: { challengesExtractedAt: null },
  });
  console.log(`원본 캐시 ${totalCache}건 / 미추출 참가자 행 ${pending}`);
  if (!APPLY) {
    console.log("드라이런이다. 실제로 쓰려면 --apply");
    return;
  }

  let cursor: string | undefined;
  let matches = 0;
  let updated = 0;
  const started = Date.now();

  for (;;) {
    // matchId 커서로 페이징한다. 중간에 끊겨도 같은 명령으로 이어서 돌릴 수 있게
    // "이미 추출된 행"은 update 대상에서 자연히 빠진다(멱등).
    const rows = await prisma.riotMatchCache.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { matchId: cursor } } : {}),
      orderBy: { matchId: "asc" },
      select: { matchId: true, data: true },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].matchId;

    for (const row of rows) {
      const data = row.data as any;
      const participants: ParticipantDto[] = data?.info?.participants ?? [];
      if (participants.length === 0) continue;

      const match = await prisma.match.findFirst({
        where: { riotMatchId: row.matchId },
        select: { id: true },
      });
      // 정형 인제스트가 아직 안 된 매치는 건드리지 않는다.
      // 인제스트가 돌 때 extractChallengeMetrics 가 함께 채운다.
      if (!match) continue;

      // puuid 로 짝을 맞춘다. 같은 매치 안에서 puuid 는 유일하다
      // (@@unique([matchId, puuid])). puuid 가 없는 행은 원본과 짝지을 수 없다.
      const ops = participants
        .filter((p) => p.puuid)
        .map((p) =>
          prisma.matchParticipant.updateMany({
            where: {
              matchId: match.id,
              puuid: p.puuid,
              challengesExtractedAt: null,
            },
            data: extractChallengeMetrics(p),
          }),
        );
      const results = await prisma.$transaction(ops);
      updated += results.reduce((sum, r) => sum + r.count, 0);
    }

    matches += rows.length;
    const rate = matches / ((Date.now() - started) / 1000);
    console.log(
      `진행 ${matches}/${totalCache} 매치 · 참가자 ${updated}행 갱신 · ${rate.toFixed(1)} 매치/s`,
    );
  }

  const remaining = await prisma.matchParticipant.count({
    where: { challengesExtractedAt: null },
  });
  console.log(`=== 완료: ${updated}행 갱신, 미추출 잔여 ${remaining} ===`);
  console.log(
    "잔여가 남는 건 정상이다 — 원본 캐시가 없는(TTL 이전에 이미 정리됐거나 " +
      "애초에 캐시를 안 거친) 참가자 행은 되살릴 소스가 없다.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
