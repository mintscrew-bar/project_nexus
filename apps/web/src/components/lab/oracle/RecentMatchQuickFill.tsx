"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { matchApi } from "@/lib/api-client";
import { Badge } from "@/components/ui";
import type { MatchQuickFillOption, UserSearchResult } from "./types";

type RawMatch = {
  id: string;
  createdAt?: string;
  completedAt?: string;
  teamA?: {
    members?: RawMember[];
  };
  teamB?: {
    members?: RawMember[];
  };
};

type RawMember = {
  user?: {
    id?: string;
    username?: string;
    avatar?: string | null;
  };
};

function mapMembers(rawMembers: RawMember[] | undefined): UserSearchResult[] {
  return (rawMembers ?? [])
    .map((m: RawMember) => m.user)
    .filter(
      (u): u is NonNullable<RawMember["user"]> => Boolean(u?.id && u.username),
    )
    .map((u: NonNullable<RawMember["user"]>) => ({
      userId: u.id!,
      username: u.username!,
      avatar: u.avatar ?? null,
    }));
}

export function RecentMatchQuickFill({
  onPick,
  title = "최근 경기에서 가져오기",
}: {
  onPick: (option: MatchQuickFillOption) => void;
  title?: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["lab", "oracle", "quick-fill", "recent-matches"],
    queryFn: () => matchApi.getUserMatches({ limit: 6 }) as Promise<RawMatch[]>,
    staleTime: 60 * 1000,
  });

  const options = useMemo<MatchQuickFillOption[]>(() => {
    return (data ?? [])
      .map((match, index) => {
        const teamA = mapMembers(match.teamA?.members);
        const teamB = mapMembers(match.teamB?.members);
        const createdAt = match.completedAt ?? match.createdAt;
        const dateText = createdAt
          ? new Date(createdAt).toLocaleDateString("ko-KR", {
              month: "short",
              day: "numeric",
            })
          : "최근";

        return {
          matchId: match.id,
          label: `${index + 1}. ${dateText} · ${teamA.length + teamB.length}명`,
          teamA,
          teamB,
        };
      })
      .filter((o) => o.teamA.length > 0 || o.teamB.length > 0);
  }, [data]);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-white/10 bg-bg-primary/40 px-3 py-2 text-xs text-text-tertiary">
        최근 경기 목록을 불러오는 중...
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-bg-primary/40 px-3 py-2 text-xs text-text-tertiary">
        최근 경기 데이터가 없어 자동 채우기를 사용할 수 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-bg-primary/40 p-3">
      <p className="text-xs font-semibold text-text-secondary">{title}</p>
      <div className="grid gap-2">
        {options.map((option) => (
          <button
            key={option.matchId}
            type="button"
            onClick={() => onPick(option)}
            className="flex items-center justify-between rounded-lg border border-white/10 bg-bg-secondary/60 px-3 py-2 text-left text-xs text-text-primary transition-colors hover:bg-bg-elevated"
          >
            <span>{option.label}</span>
            <span className="flex items-center gap-1">
              <Badge variant="default" size="sm">A {option.teamA.length}</Badge>
              <Badge variant="secondary" size="sm">B {option.teamB.length}</Badge>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
