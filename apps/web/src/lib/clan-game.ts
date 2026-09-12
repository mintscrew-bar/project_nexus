import { lastGameOrDefault } from "@/lib/last-game";

export type ClanGameTitle = "LOL" | "PUBG";

/** Resolve the selected clan game on routes that are not game-prefixed. */
export function clanGameFromLocation(): ClanGameTitle {
  if (typeof window === "undefined") return "LOL";

  const pathGame = window.location.pathname.split("/")[1]?.toLowerCase();
  const queryGame = new URLSearchParams(window.location.search)
    .get("game")
    ?.toLowerCase();
  const selectedGame = queryGame || pathGame;

  if (selectedGame === "pubg") return "PUBG";
  if (selectedGame === "lol") return "LOL";
  return lastGameOrDefault();
}
