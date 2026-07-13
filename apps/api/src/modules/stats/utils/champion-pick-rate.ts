const PLAYERS_PER_MATCH = 10;
const PLAYERS_PER_POSITION_PER_MATCH = 2;

/** Returns a champion's share of the available five-versus-five pick slots. */
export function calculateChampionPickRate(
  games: number,
  totalMatches: number,
  position: string | null,
): number {
  if (games <= 0 || totalMatches <= 0) return 0;

  const slotsPerMatch = position
    ? PLAYERS_PER_POSITION_PER_MATCH
    : PLAYERS_PER_MATCH;

  return games / (totalMatches * slotsPerMatch);
}
