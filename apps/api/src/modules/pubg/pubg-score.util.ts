/**
 * NEXUS 편성 점수 — 공식 PUBG 랭크와 다른 내부 값이다.
 *
 * 배그에는 롤의 라인별 점수에 대응하는 개념이 없어서, 포지션별로 쪼개지 않고
 * 전체 편성 점수 하나를 둔다. 지금은 운영자·본인이 넣는 값이고,
 * 자동 산정(공식 랭크·평균 순위·평균 킬·내전 성적)은 Phase 7 에서 붙인다.
 */
export interface PubgScoreInput {
  combatScore?: number | null;
  iglScore?: number | null;
  teamplayScore?: number | null;
  consistencyScore?: number | null;
  experienceScore?: number | null;
}

/** 항목별 가중치. 합이 1이 되어야 0~100 범위가 유지된다. */
const WEIGHTS = {
  combatScore: 0.35,
  iglScore: 0.25,
  teamplayScore: 0.2,
  consistencyScore: 0.1,
  experienceScore: 0.1,
} as const;

/** 하나라도 비면 점수를 내지 않는다. 빈 항목을 0으로 치면 등급이 조용히 내려간다. */
export function calculateNexusScore(input: PubgScoreInput): number | null {
  const entries = Object.entries(WEIGHTS) as [keyof typeof WEIGHTS, number][];
  let total = 0;
  for (const [key, weight] of entries) {
    const value = input[key];
    if (value === undefined || value === null) return null;
    total += value * weight;
  }
  return Math.round(total);
}

/**
 * 편성 등급. 1티어가 가장 높다.
 * 점수가 없으면 등급도 없다 — "데이터 부족"과 "5티어"를 구분해야 한다.
 */
export function calculateNexusTier(score: number | null): string | null {
  if (score === null) return null;
  if (score >= 85) return "1";
  if (score >= 70) return "2";
  if (score >= 55) return "3";
  if (score >= 40) return "4";
  return "5";
}
