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
    <nav className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
      {ORACLE_TABS.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={`${tab.href}?period=${period}`}
            className={`shrink-0 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
              isActive
                ? "bg-accent-primary/20 text-accent-primary"
                : "bg-bg-primary/60 text-text-secondary hover:bg-bg-elevated"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
