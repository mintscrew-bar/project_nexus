"use client";

import {
  createContext,
  Suspense,
  useContext,
  useEffect,
  useState,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { DEFAULT_GAME, gameFromSlug, type GameTitle } from "@nexus/types";
import { lastGameOrDefault, rememberGame } from "@/lib/last-game";

const GameNavigationContext = createContext<GameTitle>(DEFAULT_GAME);

/** 쿼리 관찰자만 Suspense에 둔다. 게임 전환이 앱 셸·소켓 제공자를 재마운트하지 않는다. */
function GameRouteObserver({
  onChange,
}: {
  onChange: (game: GameTitle) => void;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    const explicitGame =
      gameFromSlug(pathname.split("/")[1]) ??
      (pathname.startsWith("/settings/game-accounts/")
        ? gameFromSlug(pathname.split("/")[3])
        : null) ??
      gameFromSlug(search.get("game"));
    const game = explicitGame ?? lastGameOrDefault();
    if (explicitGame) rememberGame(game);
    onChange(game);
  }, [pathname, search, onChange]);
  return null;
}

export function GameNavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [game, setGame] = useState<GameTitle>(DEFAULT_GAME);
  return (
    <GameNavigationContext.Provider value={game}>
      <Suspense fallback={null}>
        <GameRouteObserver onChange={setGame} />
      </Suspense>
      {children}
    </GameNavigationContext.Provider>
  );
}

export function useNavigationGameContext() {
  return useContext(GameNavigationContext);
}
