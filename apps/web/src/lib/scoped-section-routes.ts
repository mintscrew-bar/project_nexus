import { GAMES, type GameTitle } from "@nexus/types";

export type GameScopedSection = "clans" | "streamers" | "community";

/** 공용 기능의 코드는 하나로 두고, 목록 문맥만 게임 쿼리로 명시한다. */
export function scopedSectionPath(
  section: GameScopedSection,
  game: GameTitle,
): string {
  return `/${section}?game=${GAMES[game].slug}`;
}
