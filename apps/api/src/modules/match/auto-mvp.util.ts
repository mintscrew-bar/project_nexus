import type { Prisma } from "@nexus/database";

/**
 * 경기 기록으로 MVP·ACE 를 정한다.
 *
 * 예전에는 참가자 투표로 정했지만 거의 아무도 투표하지 않았고, 투표 결과가 기록과
 * 엇갈리면 "기록으론 쟤가 MVP인데?"라는 말만 나왔다. Riot 기록이 수집된 판은
 * 기록으로 정하고, 기록이 없는 판(코드 없는 사설방)은 MVP 없이 둔다.
 *
 * 기준은 내전 상세 화면(InternalMatchView getCarryScore)과 같다 —
 * 킬 ×3 + 어시스트 + 챔피언 피해량/1000. 이긴 팀 1위가 MVP, 진 팀 1위가 ACE.
 * 1위가 넥서스 계정이 없는 참가자면 그 자리는 비운다(다음 사람에게 넘기지 않는다).
 */
export interface CarryStatLine {
  userId: string | null;
  win: boolean;
  kills: number;
  assists: number;
  totalDamageDealtToChampions: number;
}

export function carryScore(p: CarryStatLine): number {
  return p.kills * 3 + p.assists + p.totalDamageDealtToChampions / 1000;
}

export function pickMvpAce(participants: CarryStatLine[]): {
  mvpUserId: string | null;
  aceUserId: string | null;
} {
  const best = (lines: CarryStatLine[]) =>
    [...lines].sort((a, b) => carryScore(b) - carryScore(a))[0];
  const mvp = best(participants.filter((p) => p.win));
  const ace = best(participants.filter((p) => !p.win));
  return { mvpUserId: mvp?.userId ?? null, aceUserId: ace?.userId ?? null };
}

type MvpClient = Pick<Prisma.TransactionClient, "matchParticipant" | "match">;

/**
 * 저장된 참가자 기록으로 그 경기의 MVP·ACE 를 다시 매긴다.
 * 기록 수집 직후, 그리고 미연동 참가자가 나중에 계정을 연결했을 때 부른다.
 * 참가자 기록이 없으면 아무것도 바꾸지 않는다.
 */
export async function applyAutoMvpAce(
  client: MvpClient,
  matchId: string,
): Promise<void> {
  const participants = await client.matchParticipant.findMany({
    where: { matchId },
    select: {
      userId: true,
      win: true,
      kills: true,
      assists: true,
      totalDamageDealtToChampions: true,
    },
  });
  if (participants.length === 0) return;

  const { mvpUserId, aceUserId } = pickMvpAce(participants);
  await client.match.update({
    where: { id: matchId },
    data: { mvpUserId, aceUserId },
  });
}
