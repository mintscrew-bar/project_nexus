/**
 * 랭킹 점수 — 보정(베이지안) 승률.
 *
 * 그냥 승률로 줄 세우면 1승 0패(100%)가 맨 위에 박히고, "판수 → 승률"로 세우면
 * 많이 지기만 한 사람이 위로 간다. 그래서 모든 사람 앞에 "5판 분량의 50%"를
 * 미리 깔아 두고 승률을 낸다. 판수가 적을수록 50 쪽으로 당겨지고, 많이 뛸수록
 * 실제 승률에 가까워진다.
 *
 *   1승 0패 → 58.3   /   6승 3패 → 60.7   /   5승 6패 → 46.9
 *
 * 마이그레이션(20261104_add_ranking_score)의 백필 식과 같아야 한다.
 */
export const SCORE_PRIOR_GAMES = 5;

export function rankingScore(wins: number, totalGames: number): number {
  const raw =
    ((wins + SCORE_PRIOR_GAMES * 0.5) / (totalGames + SCORE_PRIOR_GAMES)) * 100;
  return Math.round(raw * 10) / 10;
}
