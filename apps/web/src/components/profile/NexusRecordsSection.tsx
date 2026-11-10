"use client";

/**
 * 프로필의 롤 내전 기록 영역 — 예전 "넥서스 유저 전적"(/lol/matches/user/:id) 화면의 본문.
 *
 * 2026-11 개인 프로필과 유저 검색 결과를 한 화면으로 합치면서 옮겨 왔다.
 * - 내전 지표(승률·칭찬·KDA… + 라인별 승률) + 내전 챔피언 — 한 줄, 같은 높이
 * - 넥서스 내전 기록 목록 — 행을 누르면 그 자리에서 상세가 펼쳐진다, 20개씩 더 보기
 */

import type React from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Target, Trophy } from "lucide-react";
import { matchApi, rankingApi, statsApi } from "@/lib/api-client";
import { Button, Skeleton } from "@/components/ui";
import { CustomGameStatsCard } from "@/components/matches/CustomGameStatsCard";
import {
  ChampionStatsCard,
  type ChampionStat,
} from "@/components/matches/ChampionStatsCard";
import { InternalMatchHistoryRow } from "@/components/matches/internal-match/InternalMatchHistoryRow";
import type { NexusMatchHistory } from "@/components/matches/match-utils";

/** 한 번에 보여줄 내전 수. 하나 더 받아 다음 쪽이 있는지 판단한다 */
const PAGE = 20;

export function NexusRecordsSection({
  userId,
  showChampions = true,
  between,
}: {
  userId: string;
  /** 내전 지표 줄과 내전 기록 목록 사이에 끼울 내용 (프로필의 선호 챔피언·Riot 계정) */
  between?: React.ReactNode;
  /** 공개 설정 "챔피언 통계 공개" — 끄면 내전 챔피언 카드를 숨긴다 */
  showChampions?: boolean;
}) {
  // 챔피언 통계 — 전체 내전 참가 기록 집계
  const { data: championStats = [] } = useQuery<ChampionStat[]>({
    queryKey: ["championStats", userId],
    queryFn: () => statsApi.getUserChampionStats(userId),
    staleTime: 5 * 60 * 1000,
    enabled: showChampions,
  });

  // 넥서스 랭킹(내전 승패·라인별) — 내전 지표 카드가 쓴다.
  // 프로필 머리의 랭킹 배지와 같은 키라 요청은 한 번만 나간다.
  const { data: nexusRanking } = useQuery({
    queryKey: ["userRanking", userId],
    queryFn: () => rankingApi.getUserRanking(userId),
    staleTime: 5 * 60 * 1000,
  });

  // 내전 기록 — 21개씩 받아 20개만 보여 주고, 21번째가 있으면 다음 쪽이 있다
  const history = useInfiniteQuery({
    queryKey: ["nexusMatchHistory", userId],
    queryFn: ({ pageParam }) =>
      matchApi.getUserMatchHistory(userId, PAGE + 1, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last: NexusMatchHistory[], pages) =>
      last.length > PAGE ? pages.length * PAGE : undefined,
    staleTime: 60 * 1000,
  });
  const matches = (history.data?.pages ?? []).flatMap((p) => p.slice(0, PAGE));

  return (
    <>
      {/* 내전 지표 + 내전 챔피언 — 챔피언 카드는 내전 지표 높이에 맞춰 안에서 스크롤 */}
      <div
        className={
          showChampions
            ? "mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]"
            : "mb-6"
        }
      >
        <div className="min-w-0">
          <CustomGameStatsCard userId={userId} ranking={nexusRanking} />
        </div>
        {showChampions && (
          <div className="relative">
            <div className="lg:absolute lg:inset-0">
              <ChampionStatsCard stats={championStats} fill />
            </div>
          </div>
        )}
      </div>

      {between}

      {/* 넥서스 내전 기록 */}
      <div className="rounded-xl border border-bg-tertiary bg-bg-secondary p-6">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-text-primary">
          <Trophy className="h-5 w-5 text-accent-primary" />
          넥서스 내전 기록
        </h2>

        {history.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : matches.length === 0 ? (
          <div className="py-16 text-center">
            <Target className="mx-auto mb-4 h-16 w-16 text-text-tertiary opacity-50" />
            <h3 className="mb-2 text-lg font-semibold text-text-primary">
              내전 기록이 없습니다
            </h3>
            <p className="text-text-secondary">
              내전에 참가하면 여기에 기록이 쌓입니다.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* 일반 전적과 같은 행 — 누르면 그 자리에서 내전 상세가 펼쳐진다 */}
            <div className="space-y-1.5">
              {matches.map((match) => (
                <InternalMatchHistoryRow key={match.matchId} match={match} />
              ))}
            </div>
            {history.hasNextPage && (
              <div className="pt-2 text-center">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => history.fetchNextPage()}
                  disabled={history.isFetchingNextPage}
                >
                  {history.isFetchingNextPage ? "불러오는 중..." : "더 보기"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
