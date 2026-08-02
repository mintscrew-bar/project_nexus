"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const ORACLE_TABS = [
  { href: "/lab/oracle", label: "경매 효율" },
  { href: "/lab/oracle/balance", label: "팀 밸런스" },
  { href: "/lab/oracle/ban", label: "밴 추천" },
  { href: "/lab/oracle/h2h", label: "1:1 상성" },
];

export function OracleSubNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const period = searchParams.get("period") ?? "30d";

  return (
    <nav className="scrollbar-none -mx-1 flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-bg-elevated bg-bg-tertiary p-1.5" aria-label="오라클 분석 메뉴">
      {ORACLE_TABS.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={`${tab.href}?period=${period}`}
            aria-current={isActive ? "page" : undefined}
            className={`shrink-0 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-all duration-200 ${
              isActive
                ? "border-accent-primary/30 bg-bg-secondary text-accent-primary shadow-sm"
                : "border-transparent text-text-secondary hover:-translate-y-px hover:border-bg-elevated hover:bg-bg-elevated/60 hover:text-text-primary"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
