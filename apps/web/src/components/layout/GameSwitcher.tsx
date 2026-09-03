"use client";

import { useRouter } from "next/navigation";
import { GAMES, GAME_TITLES, type GameTitle } from "@nexus/types";
import { cn } from "@/lib/utils";
import { useCurrentGame } from "@/hooks/useCurrentGame";

/**
 * 롤 ↔ 배그 전환.
 *
 * 라우팅이 `/lol/*` `/pubg/*` 로 갈렸는데 사용자가 게임을 오갈 수단이 없었다.
 * 게임을 바꾸면 그 게임의 첫 화면(내전 목록)으로 보낸다 — 현재 경로를 그대로
 * 갈아끼우면 `/lol/matches/match/xxx` 같은 롤 전용 상세가 배그에서 깨진다.
 */
export function GameSwitcher({ className }: { className?: string }) {
  const router = useRouter();
  const current = useCurrentGame();

  const go = (title: GameTitle) => {
    if (title === current) return;
    router.push(`/${GAMES[title].slug}/tournaments`);
  };

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 rounded-lg bg-bg-tertiary p-0.5",
        className,
      )}
      role="group"
      aria-label="게임 선택"
    >
      {GAME_TITLES.map((title) => {
        const game = GAMES[title];
        const active = title === current;
        return (
          <button
            key={title}
            type="button"
            onClick={() => go(title)}
            aria-current={active ? "true" : undefined}
            title={game.label}
            className={cn(
              "min-h-9 whitespace-nowrap rounded-md px-2.5 text-xs font-bold transition-colors duration-150",
              active
                ? "bg-bg-secondary text-accent-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {game.shortLabel}
          </button>
        );
      })}
    </div>
  );
}
