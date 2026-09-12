"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { lastGameOrDefault } from "@/lib/last-game";
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
  return useGameFromPath() ?? DEFAULT_GAME;
}

/**
 * 경로에 게임이 **적혀 있는지**.
 *
 * `useCurrentGame()` 은 없을 때 기본 게임으로 떨어뜨려서 "롤 화면"과 "게임을
 * 알 수 없는 화면"을 구분하지 못한다. 종합 홈·클랜·커뮤니티·설정이 후자인데,
 * 거기서 링크를 기본 게임으로 만들면 사용자에게 묻지 않고 게임을 골라버린다 —
 * 헤더의 "프로필" 이 배그만 하는 사람에게도 롤 프로필로 가던 이유다.
 * 게임을 고르게 해야 하는 자리에서는 이 함수로 `null` 을 받아 갈라놓는다.
 */
export function useGameFromPath(): GameTitle | null {
  const pathname = usePathname();
  return gameFromSlug(pathname.split("/")[1]) ?? null;
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

/**
 * 게임을 특정할 수 없는 화면(홈 대시보드)에서 쓸 게임 프리픽스.
 *
 * 경로로는 게임을 알 수 없어 `useGamePrefix()` 가 기본 게임으로 떨어진다.
 * 그러면 배그만 하는 사람이 로그인 직후 홈에서 누르는 링크가 전부 롤로 간다.
 * 마지막으로 본 게임을 기억해 두었다가 그걸 쓴다.
 *
 * **첫 렌더는 기본 게임으로 시작한다.** localStorage 는 서버에 없어서, 처음부터
 * 읽은 값을 쓰면 SSR 결과와 어긋나 하이드레이션이 깨진다. 마운트 뒤에 바꾼다.
 */
export function useLastGamePrefix(): string {
  const [game, setGame] = useState<GameTitle>(DEFAULT_GAME);
  useEffect(() => {
    setGame(lastGameOrDefault());
  }, []);
  return `/${GAMES[game].slug}`;
}

// 순수 함수·상수는 서버 컴포넌트에서도 필요해 별도 모듈에 둔다.
export { gamePath, DEFAULT_GAME_PREFIX } from "@/lib/game-links";
