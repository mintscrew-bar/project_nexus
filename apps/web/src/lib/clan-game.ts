"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
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

/**
 * 클랜 화면이 볼 게임.
 *
 * 클랜은 게임별로 완전히 갈린다(롤 클랜 ≠ 배그 클랜). 그런데 `/clans` 는
 * 게임 프리픽스가 없는 경로라 쿼리가 없으면 알 수가 없다. 전에는 그 자리에서
 * `"LOL"` 로 못박아 두어, 배그만 하는 사람이 헤더의 "클랜" 을 눌러도 늘 롤
 * 클랜 목록이 떴다 — 헤더는 `/clans` 를 "게임과 무관한 화면" 으로 분류해
 * 프리픽스를 안 붙이고, 화면은 그걸 롤로 해석했다.
 *
 * 쿼리가 있으면 그걸 따르고, 없으면 **마지막으로 보던 게임**을 쓴다.
 *
 * **첫 렌더는 기본 게임으로 시작한다.** `localStorage` 는 서버에 없어서,
 * 처음부터 읽은 값을 쓰면 SSR 결과와 어긋나 하이드레이션이 깨진다.
 */
export function useClanGame(): ClanGameTitle {
  const searchParams = useSearchParams();
  const param = searchParams.get("game")?.toLowerCase();

  const [remembered, setRemembered] = useState<ClanGameTitle>("LOL");
  useEffect(() => {
    setRemembered(lastGameOrDefault() === "PUBG" ? "PUBG" : "LOL");
  }, []);

  if (param === "pubg") return "PUBG";
  if (param === "lol") return "LOL";
  return remembered;
}
