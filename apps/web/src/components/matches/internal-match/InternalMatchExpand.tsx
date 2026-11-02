"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { matchApi } from "@/lib/api-client";
import { useGamePrefix } from "@/hooks/useCurrentGame";
import { InternalMatchView, type MatchDetails } from "./InternalMatchView";

/**
 * 전적 목록에서 내전 판을 펼쳤을 때 보이는 내전 상세.
 *
 * 넥서스 유저의 "내전 기록"과 일반(Riot) 전적에 섞인 내전 판이 둘 다 이걸 쓴다.
 * 내전 상세 페이지와 같은 InternalMatchView 를 그대로 펼쳐서, 어디서 열든
 * 팀 이름·골드 그래프·스탯 표가 같은 모양으로 보이게 한다.
 */
export function InternalMatchExpand({ matchId }: { matchId: string }) {
  const gamePrefix = useGamePrefix();
  const { data, isLoading, isError } = useQuery<MatchDetails>({
    queryKey: ["internalMatch", matchId],
    queryFn: () => matchApi.getMatch(matchId),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-accent-primary" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <p className="py-8 text-center text-sm text-text-tertiary">
        내전 기록을 불러오지 못했습니다.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Link
          href={`${gamePrefix}/matches/match/${matchId}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-accent-primary"
        >
          상세 페이지로 열기
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <InternalMatchView match={data} />
    </div>
  );
}
