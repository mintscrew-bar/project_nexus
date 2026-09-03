export {
  TIER_BASE,
  RANK_BONUS,
  calculateTierScore,
  tierScore,
  isTierAbove,
} from "@nexus/types";

import { BALANCE_SCORE_VERSION } from "./balance-score.util";
import { calculateTierScore } from "@nexus/types";

/**
 * 팀장 자동 선정에 사용하는 단일 점수.
 * 최신 라인별 밸런스 캐시가 있으면 가장 높은 라인 점수를 우선하고,
 * 캐시가 없거나 오래된 계정만 기존 티어 점수로 fallback한다.
 */
export function calculateCaptainScore(
  account?: {
    tier?: string | null;
    rank?: string | null;
    lp?: number | null;
    balanceScores?: unknown;
    balanceScoreVersion?: string | null;
  } | null,
): number {
  if (
    account?.balanceScoreVersion === BALANCE_SCORE_VERSION &&
    account.balanceScores &&
    typeof account.balanceScores === "object"
  ) {
    const scores = Object.values(
      account.balanceScores as Record<string, unknown>,
    ).filter(
      (score): score is number =>
        typeof score === "number" && Number.isFinite(score),
    );
    if (scores.length > 0) return Math.max(...scores);
  }

  return calculateTierScore(
    account?.tier || "UNRANKED",
    account?.rank || "",
    account?.lp || 0,
  );
}
