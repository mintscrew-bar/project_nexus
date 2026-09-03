"use client";

import { usePathname } from "next/navigation";
import {
  DEFAULT_GAME,
  GAMES,
  gameFromSlug,
  type GameTitle,
} from "@nexus/types";

/**
 * 지금 보고 있는 화면의 게임.
 *
 * 경로 첫 칸이 게임 슬러그다(`/lol/tournaments`). 클랜·커뮤니티처럼 게임과
 * 무관한 화면에는 슬러그가 없으므로 기본 게임으로 떨어진다 — 그 화면에서
 * "내전"을 누르면 마지막으로 보던 게임이 아니라 기본 게임으로 가지만,
 * 헤더가 항상 유효한 링크를 갖는 쪽이 낫다.
 */
export function useCurrentGame(): GameTitle {
  const pathname = usePathname();
  const first = pathname.split("/")[1];
  return gameFromSlug(first) ?? DEFAULT_GAME;
}

/** 게임별 경로를 만든다. `gamePath("LOL", "/tournaments")` → `/lol/tournaments` */
export function gamePath(game: GameTitle, path: string): string {
  return `/${GAMES[game].slug}${path.startsWith("/") ? path : `/${path}`}`;
}
