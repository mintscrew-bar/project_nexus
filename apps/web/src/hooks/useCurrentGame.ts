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

/**
 * 현재 게임의 URL 프리픽스(`/lol` · `/pubg`).
 *
 * 게임별 화면 안에서 만드는 링크는 거의 전부 "현재 게임 + 나머지 경로"라
 * `` `${prefix}/tournaments/${id}/lobby` `` 처럼 그냥 이어붙이는 편이
 * `gamePath()` 를 매번 부르는 것보다 읽기 쉽다.
 */
export function useGamePrefix(): string {
  return `/${GAMES[useCurrentGame()].slug}`;
}

// 순수 함수·상수는 서버 컴포넌트에서도 필요해 별도 모듈에 둔다.
export { gamePath, DEFAULT_GAME_PREFIX } from "@/lib/game-links";
