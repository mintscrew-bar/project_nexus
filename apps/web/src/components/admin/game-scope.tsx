"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GAMES, enabledGames, type GameTitle } from "@nexus/types";

/**
 * 관리자 화면의 게임 범위.
 *
 * 롤·배그는 방도 클랜도 완전히 다른 집단이라 한 목록에 섞어 보면 운영 판단이
 * 틀린다. 그렇다고 화면마다 드롭다운을 두면 탭을 옮길 때마다 다시 고르게 된다.
 * 관리자는 보통 "지금은 배그를 본다" 상태로 여러 탭을 오가므로 범위를 위에서
 * 한 번 정하고 아래가 따라간다.
 *
 * **`null` 은 전체**다. 유저 신고나 전체 방 수처럼 둘 다 봐야 하는 일이 있다.
 *
 * URL 에 싣는다(`?game=pubg`). 새로고침해도 유지되고, 운영자끼리 링크를
 * 주고받을 때 같은 화면을 본다.
 */
type AdminGameScope = {
  /** 선택된 게임. `null` 이면 전체 */
  game: GameTitle | null;
  setGame: (game: GameTitle | null) => void;
  /** API 쿼리에 그대로 넘길 값 */
  gameParam: GameTitle | undefined;
};

const Ctx = createContext<AdminGameScope | null>(null);

function parseGame(raw: string | null): GameTitle | null {
  if (!raw) return null;
  const slug = raw.toLowerCase();
  const found = enabledGames().find((g) => g.slug === slug);
  return found?.title ?? null;
}

export function AdminGameScopeProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const game = parseGame(searchParams.get("game"));

  const setGame = useCallback(
    (next: GameTitle | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set("game", GAMES[next].slug);
      else params.delete("game");
      const query = params.toString();
      router.replace(query ? `/admin?${query}` : "/admin", { scroll: false });
    },
    [router, searchParams],
  );

  const value = useMemo<AdminGameScope>(
    () => ({ game, setGame, gameParam: game ?? undefined }),
    [game, setGame],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminGameScope(): AdminGameScope {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useAdminGameScope 는 AdminGameScopeProvider 안에서만 쓸 수 있습니다.",
    );
  }
  return ctx;
}

/** 상단 전역 스위치. 전체 / 롤 / 배그 */
export function AdminGameSwitch() {
  const { game, setGame } = useAdminGameScope();
  const options: Array<{ value: GameTitle | null; label: string }> = [
    { value: null, label: "전체" },
    ...enabledGames().map((g) => ({
      value: g.title as GameTitle | null,
      label: g.shortLabel,
    })),
  ];

  return (
    <div
      className="flex items-center gap-0.5 rounded-lg bg-bg-tertiary p-1"
      role="group"
      aria-label="관리할 게임"
    >
      {options.map((opt) => {
        const active = game === opt.value;
        return (
          <button
            key={opt.label}
            type="button"
            onClick={() => setGame(opt.value)}
            aria-pressed={active}
            className={`rounded-md px-3 py-1 text-xs font-bold transition-colors ${
              active
                ? "bg-bg-secondary text-text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
