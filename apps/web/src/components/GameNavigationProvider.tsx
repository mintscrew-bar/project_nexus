"use client";

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  DEFAULT_GAME,
  explicitGameFromLocation,
  type GameTitle,
} from "@nexus/types";
import { lastGameOrDefault, rememberGame } from "@/lib/last-game";

const GameNavigationContext = createContext<GameTitle>(DEFAULT_GAME);
/**
 * 주소에 명시된 게임(없으면 null). `GameNavigationContext` 는 없을 때 마지막으로 본 게임으로
 * 떨어지지만, 테마는 "지금 이 화면이 어느 게임인가"만 따라야 해서 따로 둔다.
 */
const ExplicitGameContext = createContext<GameTitle | null>(null);

/** 쿼리 관찰자만 Suspense에 둔다. 게임 전환이 앱 셸·소켓 제공자를 재마운트하지 않는다. */
function GameRouteObserver({
  onChange,
}: {
  onChange: (game: GameTitle, explicitGame: GameTitle | null) => void;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    const explicitGame = explicitGameFromLocation(pathname, search.get("game"));
    const game = explicitGame ?? lastGameOrDefault();
    if (explicitGame) rememberGame(game);
    onChange(game, explicitGame);
  }, [pathname, search, onChange]);
  return null;
}

export function GameNavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [game, setGame] = useState<GameTitle>(DEFAULT_GAME);
  const [explicitGame, setExplicitGame] = useState<GameTitle | null>(null);
  const handleChange = useCallback(
    (next: GameTitle, explicit: GameTitle | null) => {
      setGame(next);
      setExplicitGame(explicit);
    },
    [],
  );
  return (
    <GameNavigationContext.Provider value={game}>
      <ExplicitGameContext.Provider value={explicitGame}>
        <Suspense fallback={null}>
          <GameRouteObserver onChange={handleChange} />
        </Suspense>
        {children}
      </ExplicitGameContext.Provider>
    </GameNavigationContext.Provider>
  );
}

export function useNavigationGameContext() {
  return useContext(GameNavigationContext);
}

/** 주소에 명시된 게임. 없으면 null — 추정하지 않는다 */
export function useExplicitGameContext() {
  return useContext(ExplicitGameContext);
}
