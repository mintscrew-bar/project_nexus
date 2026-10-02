"use client";

import Link from "next/link";
import { enabledGames, type GameTitle } from "@nexus/types";
import {
  scopedSectionPath,
  type GameScopedSection,
} from "@/lib/scoped-section-routes";
import { cn } from "@/lib/utils";

/** 공유 섹션에서 선택한 게임을 URL에 명시한다. */
export function GameSectionTabs({
  section,
  game,
}: {
  section: GameScopedSection;
  game: GameTitle;
}) {
  return (
    <nav aria-label="게임 선택" className="mb-5 flex gap-2">
      {enabledGames().map((item) => (
        <Link
          key={item.title}
          href={scopedSectionPath(section, item.title)}
          aria-current={game === item.title ? "page" : undefined}
          className={cn(
            "rounded-lg border px-4 py-2 text-sm font-semibold",
            game === item.title
              ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
              : "border-bg-elevated text-text-secondary hover:text-text-primary",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
