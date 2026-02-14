/**
 * 롤 티어 기반 점수 계산 유틸리티
 * 점수 = 티어_베이스 + 랭크_보너스(IV=0, III=100, II=200, I=300) + LP
 *
 * 범위:
 *   UNRANKED     = 0
 *   IRON IV  0LP = 0   → IRON I  99LP = 399
 *   BRONZE IV 0LP= 400 → BRONZE I 99LP= 799
 *   SILVER  ...  = 800 ~ 1199
 *   GOLD    ...  = 1200 ~ 1599
 *   PLATINUM...  = 1600 ~ 1999
 *   EMERALD ...  = 2000 ~ 2399
 *   DIAMOND ...  = 2400 ~ 2799
 *   MASTER  (LP) = 2800+
 *   GRANDMASTER  = 3200+
 *   CHALLENGER   = 3600+
 */

export const TIER_BASE: Record<string, number> = {
  UNRANKED: 0,
  IRON: 0,
  BRONZE: 400,
  SILVER: 800,
  GOLD: 1200,
  PLATINUM: 1600,
  EMERALD: 2000,
  DIAMOND: 2400,
  MASTER: 2800,
  GRANDMASTER: 3200,
  CHALLENGER: 3600,
};

/** IV=낮음, I=높음 (승급전 상의 순서와 일치) */
export const RANK_BONUS: Record<string, number> = {
  IV: 0,
  III: 100,
  II: 200,
  I: 300,
  "": 0, // Master 이상은 랭크 없음
};

const MASTER_PLUS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);

/**
 * 티어 + 랭크 + LP 를 통합 점수로 변환
 * @param tier  "IRON" | "BRONZE" | ... | "CHALLENGER" | "UNRANKED"
 * @param rank  "I" | "II" | "III" | "IV" | "" (Master 이상)
 * @param lp    0-100 (Master 이상은 더 높을 수 있음)
 */
export function calculateTierScore(
  tier: string,
  rank: string,
  lp: number,
): number {
  const tierBase = TIER_BASE[tier] ?? 0;
  // Master/Grandmaster/Challenger 는 division 없이 LP만 가산
  const rankBonus = MASTER_PLUS.has(tier) ? 0 : (RANK_BONUS[rank] ?? 0);
  return tierBase + rankBonus + lp;
}
