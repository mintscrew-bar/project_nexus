/**
 * 배틀로얄 스크림 — 여러 팀이 한 매치에 들어가 라운드를 반복하고 포인트를 누적한다.
 *
 * 롤의 `Match`/`MatchSeries` 는 `teamAId`/`teamBId` 2팀 고정이라 쓸 수 없다.
 * 대신 라운드마다 전 팀의 순위·킬을 기록하고 규칙표로 포인트를 환산한다.
 */

/**
 * 포인트 규칙.
 *
 * 대회마다 표가 달라서 "표준"을 코드에 못 박으면 매번 안 맞는다.
 * 프리셋을 하나 주고 방마다 고칠 수 있게 둔다.
 */
export interface PubgPointRule {
  /**
   * 순위별 포인트. `[0]` 이 1위다.
   * 배열보다 순위가 낮으면 0점 — 표에 없는 등수까지 억지로 채우지 않는다.
   */
  placementPoints: number[];
  /** 킬 1개당 포인트 */
  killPoints: number;
  /**
   * 사망 1명당 포인트. 킬내기는 음수다(−3).
   *
   * 배틀로얄에는 없는 개념이라 선택값이다. 배틀로얄은 어차피 한 팀 빼고 다 죽어서
   * 사망을 세면 순위 점수와 같은 말을 두 번 하는 셈이 된다.
   */
  deathPoints?: number;
}

/**
 * 기본 프리셋. PUBG 대회에서 가장 흔한 형태를 그대로 옮겼다.
 * 1위 10점에서 시작해 8위까지 점수가 있고, 킬 1점.
 */
export const DEFAULT_PUBG_POINT_RULE: PubgPointRule = {
  placementPoints: [10, 6, 5, 4, 3, 2, 1, 1],
  killPoints: 1,
};

/** 순위 점수 없이 킬만 세는 규칙 */
export const KILL_ONLY_POINT_RULE: PubgPointRule = {
  placementPoints: [],
  killPoints: 1,
};

/**
 * 킬내기 표준 규칙.
 *
 * 두 팀이 같은 커스텀 매치에 들어가 대도시에 함께 낙하해 싸운다.
 * 치킨(1위)만 보너스가 있고 2위 이하는 순위 점수가 없다 —
 * 어차피 두 팀뿐이라 순위표를 길게 둘 이유가 없다.
 * 사녹은 맵이 좁아 치킨을 +5로 낮춰 잡는 관례가 있다(별도 프리셋).
 */
export const KILL_MATCH_POINT_RULE: PubgPointRule = {
  placementPoints: [8],
  killPoints: 1,
  deathPoints: -3,
};

export interface PubgPointRulePreset {
  key: string;
  label: string;
  description: string;
  rule: PubgPointRule;
}

export const PUBG_POINT_RULE_PRESETS: readonly PubgPointRulePreset[] = [
  {
    key: "standard",
    label: "표준 (1위 10점 · 킬 1점)",
    description: "대회에서 가장 흔한 표. 8위까지 순위 점수가 있습니다.",
    rule: DEFAULT_PUBG_POINT_RULE,
  },
  {
    key: "placement-heavy",
    label: "순위 중심 (1위 15점 · 킬 1점)",
    description: "생존을 더 크게 쳐주는 표입니다.",
    rule: {
      placementPoints: [15, 12, 10, 8, 6, 4, 2, 1],
      killPoints: 1,
    },
  },
  {
    key: "kill-only",
    label: "킬만 (순위 점수 없음)",
    description: "순위를 무시하고 킬 수만 누적합니다.",
    rule: KILL_ONLY_POINT_RULE,
  },
  {
    key: "kill-match",
    label: "킬내기 (킬 +1 · 사망 −3 · 치킨 +8)",
    description:
      "두 팀이 같은 판에 들어가 싸우는 킬내기 표준 규칙입니다. 사망이 감점이라 합계가 음수가 될 수 있습니다.",
    rule: KILL_MATCH_POINT_RULE,
  },
  {
    key: "kill-match-sanhok",
    label: "킬내기 · 사녹 (치킨 +5)",
    description:
      "사녹은 맵이 좁아 치킨 보너스를 낮춰 잡습니다. 나머지는 표준과 같습니다.",
    rule: { placementPoints: [5], killPoints: 1, deathPoints: -3 },
  },
] as const;

/**
 * 라운드 한 판에서 한 팀이 얻는 포인트.
 *
 * 킬내기는 사망이 감점이라 합계가 음수가 될 수 있다. 0으로 자르지 않는다 —
 * 자르면 "많이 죽어도 손해가 없다"가 돼서 규칙이 무의미해진다.
 */
export function calculateScrimPoints(
  placement: number,
  kills: number,
  rule: PubgPointRule,
  deaths = 0,
): number {
  // 순위는 1부터다. 표에 없는 등수는 0점.
  const placementPoint =
    placement >= 1 ? (rule.placementPoints[placement - 1] ?? 0) : 0;
  return (
    placementPoint + kills * rule.killPoints + deaths * (rule.deathPoints ?? 0)
  );
}

/** 규칙표가 쓸 만한 모양인지. 사용자가 직접 고칠 수 있어 서버에서 한 번 더 본다. */
export function isValidPointRule(rule: unknown): rule is PubgPointRule {
  if (!rule || typeof rule !== "object") return false;
  const candidate = rule as PubgPointRule;
  if (!Array.isArray(candidate.placementPoints)) return false;
  if (candidate.placementPoints.length > 100) return false;
  if (
    !candidate.placementPoints.every(
      (value) => Number.isFinite(value) && value >= 0 && value <= 1000,
    )
  ) {
    return false;
  }
  if (
    !Number.isFinite(candidate.killPoints) ||
    candidate.killPoints < 0 ||
    candidate.killPoints > 1000
  ) {
    return false;
  }
  // 사망 점수는 감점이라 음수를 허용한다. 없으면 0으로 본다.
  if (candidate.deathPoints === undefined) return true;
  return (
    Number.isFinite(candidate.deathPoints) &&
    candidate.deathPoints >= -1000 &&
    candidate.deathPoints <= 1000
  );
}

export interface ScrimLeaderboardRow {
  teamId: string | null;
  teamName: string;
  /** 라운드별 포인트 (라운드 번호 순). 결과가 없는 라운드는 null. */
  roundPoints: (number | null)[];
  totalPoints: number;
  totalKills: number;
  /** 총 사망 수. 사망 감점이 없는 규칙에서는 표시만 하고 점수에 안 들어간다. */
  totalDeaths: number;
  /** 라운드 순위의 합. 동점일 때 순위가 높았던 팀을 위로 올린다. */
  placementSum: number;
  /** 가장 좋았던 순위 (1이 우승). 결과가 없으면 null. */
  bestPlacement: number | null;
  /** 1위를 한 라운드 수 */
  wins: number;
}

/**
 * 누적 리더보드 정렬.
 *
 * 총점 → 총킬 → 최고 순위 순으로 가른다. 총점만 보면 동점이 자주 나오고,
 * 그때 "누가 더 잘했나"는 킬과 우승 경험으로 판단하는 게 통례다.
 */
export function sortScrimLeaderboard(
  rows: ScrimLeaderboardRow[],
): ScrimLeaderboardRow[] {
  return [...rows].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.totalKills !== a.totalKills) return b.totalKills - a.totalKills;
    const aBest = a.bestPlacement ?? Number.MAX_SAFE_INTEGER;
    const bBest = b.bestPlacement ?? Number.MAX_SAFE_INTEGER;
    if (aBest !== bBest) return aBest - bBest;
    return a.teamName.localeCompare(b.teamName, "ko");
  });
}
