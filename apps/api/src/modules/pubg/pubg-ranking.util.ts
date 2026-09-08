/**
 * 배그 랭킹 집계.
 *
 * 롤 랭킹은 승패가 있어 승률로 줄을 세우지만, 배그는 승패가 없다.
 * 라운드마다 순위·킬로 점수를 쌓고 스크림이 끝나면 그 합계로 팀 순위가
 * 정해질 뿐이다. 그래서 사람 기준 지표도 "이 사람이 속한 팀이 평균 몇 등을
 * 했는가"로 잡는다.
 *
 * 순수 함수로 떼어 둔 이유는 이 계산이 표본 없이 굴러가기 때문이다 —
 * 실제 내전이 쌓이기 전에는 테스트가 유일한 검증 수단이다.
 */

/** 한 스크림에서 한 팀이 낸 최종 성적 */
export interface ScrimTeamTotal {
  teamId: string;
  points: number;
  kills: number;
  deaths: number;
}

/** 집계에 넣을 스크림 한 건 */
export interface ScrimForRanking {
  scrimId: string;
  /** 팀별 합계. 이 안에서 순위를 매긴다. */
  teams: ScrimTeamTotal[];
  /** 팀에 속한 사람. 한 팀에 여러 명이다. */
  membersByTeam: Map<string, string[]>;
}

export interface PubgRankingRow {
  userId: string;
  /** 참가한 스크림 수 */
  scrims: number;
  /** 팀 최종 순위의 평균. 낮을수록 좋다. */
  averagePlacement: number;
  /** 1위로 끝낸 스크림 수 */
  wins: number;
  totalPoints: number;
  totalKills: number;
  totalDeaths: number;
  /** 스크림당 평균 킬 */
  averageKills: number;
}

/**
 * 한 스크림 안에서 팀 순위를 매긴다.
 *
 * 총점 → 총킬 순으로 가른다. 리더보드 화면과 같은 기준이라 사람이 본 순위와
 * 랭킹이 어긋나지 않는다. 동점이면 같은 등수를 준다 — 순위가 팀 이름
 * 가나다순으로 갈리면 "왜 우리가 뒤냐"는 말이 나온다.
 */
export function placeTeams(teams: ScrimTeamTotal[]): Map<string, number> {
  const sorted = [...teams].sort(
    (a, b) => b.points - a.points || b.kills - a.kills,
  );
  const placement = new Map<string, number>();
  sorted.forEach((team, index) => {
    const previous = index > 0 ? sorted[index - 1] : null;
    const tied =
      previous !== null &&
      previous.points === team.points &&
      previous.kills === team.kills;
    placement.set(
      team.teamId,
      tied ? (placement.get(previous.teamId) ?? index + 1) : index + 1,
    );
  });
  return placement;
}

/**
 * 사람별 누적.
 *
 * 결과가 하나도 없는 스크림은 건너뛴다. 라운드를 열어두고 결과를 안 넣은
 * 방까지 세면 참가 횟수만 늘고 순위는 비어 랭킹이 뒤틀린다.
 */
export function aggregatePubgRanking(
  scrims: ScrimForRanking[],
): PubgRankingRow[] {
  const rows = new Map<string, PubgRankingRow & { placementSum: number }>();

  for (const scrim of scrims) {
    if (scrim.teams.length === 0) continue;
    const placement = placeTeams(scrim.teams);

    for (const team of scrim.teams) {
      const members = scrim.membersByTeam.get(team.teamId) ?? [];
      const place = placement.get(team.teamId);
      if (place === undefined) continue;

      for (const userId of members) {
        const row = rows.get(userId) ?? {
          userId,
          scrims: 0,
          averagePlacement: 0,
          wins: 0,
          totalPoints: 0,
          totalKills: 0,
          totalDeaths: 0,
          averageKills: 0,
          placementSum: 0,
        };
        row.scrims += 1;
        row.placementSum += place;
        if (place === 1) row.wins += 1;
        row.totalPoints += team.points;
        row.totalKills += team.kills;
        row.totalDeaths += team.deaths;
        rows.set(userId, row);
      }
    }
  }

  return [...rows.values()].map((row) => ({
    userId: row.userId,
    scrims: row.scrims,
    averagePlacement: row.placementSum / row.scrims,
    wins: row.wins,
    totalPoints: row.totalPoints,
    totalKills: row.totalKills,
    totalDeaths: row.totalDeaths,
    averageKills: row.totalKills / row.scrims,
  }));
}

/**
 * 랭킹 정렬.
 *
 * 누적 포인트가 먼저다 — 많이 참가한 사람이 위로 오는 게 내전 랭킹의
 * 취지에 맞다. 그다음 평균 순위(낮을수록 좋다), 그다음 총킬.
 */
export function sortPubgRanking(rows: PubgRankingRow[]): PubgRankingRow[] {
  return [...rows].sort(
    (a, b) =>
      b.totalPoints - a.totalPoints ||
      a.averagePlacement - b.averagePlacement ||
      b.totalKills - a.totalKills,
  );
}
