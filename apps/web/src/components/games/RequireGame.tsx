"use client";

import { notFound } from "next/navigation";
import { useCurrentGame } from "@/hooks/useCurrentGame";
import type { GameTitle } from "@nexus/types";

/**
 * 특정 게임 전용 화면을 다른 게임 경로에서 열지 못하게 막는다.
 *
 * 소환사 검색·챔피언 기록처럼 롤에만 있는 개념의 화면은 `/pubg/...` 아래에서
 * 렌더되면 안 된다. URL 과 내용이 어긋나고 검색엔진이 중복 문서를 색인한다.
 */
export function useRequireGame(expected: GameTitle) {
  const current = useCurrentGame();
  if (current !== expected) notFound();
}
