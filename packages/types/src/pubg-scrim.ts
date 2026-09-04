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
}

/**
 * 기본 프리셋. PUBG 대회에서 가장 흔한 형태를 그대로 옮겼다.
 * 1위 10점에서 시작해 8위까지 점수가 있고, 킬 1점.
 */
export const DEFAULT_PUBG_POINT_RULE: PubgPointRule = {
  placementPoints: [10, 6, 5, 4, 3, 2, 1, 1],
  killPoints: 1,
};

/** 순위 점수 없이 킬만 세는 규칙 — 킬내기 성격의 스크림에 쓴다. */
export const KILL_ONLY_POINT_RULE: PubgPointRule = {
  placementPoints: [],
  killPoints: 1,
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
] as const;

/** 라운드 한 판에서 한 팀이 얻는 포인트 */
export function calculateScrimPoints(
  placement: number,
  kills: number,
  rule: PubgPointRule,
): number {
  // 순위는 1부터다. 표에 없는 등수는 0점.
  const placementPoint =
    placement >= 1 ? (rule.placementPoints[placement - 1] ?? 0) : 0;
  return placementPoint + kills * rule.killPoints;
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
  return (
    Number.isFinite(candidate.killPoints) &&
    candidate.killPoints >= 0 &&
    candidate.killPoints <= 1000
  );
}

export interface ScrimLeaderboardRow {
  teamId: string | null;
  teamName: string;
  /** 라운드별 포인트 (라운드 번호 순). 결과가 없는 라운드는 null. */
  roundPoints: (number | null)[];
  totalPoints: number;
  totalKills: number;
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
