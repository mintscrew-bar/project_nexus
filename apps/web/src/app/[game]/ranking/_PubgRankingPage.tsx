"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Crosshair, Crown, Trophy } from "lucide-react";
import { useGamePrefix } from "@/hooks/useCurrentGame";
import { rankingApi } from "@/lib/api-client";
import { Button, EmptyState, Skeleton } from "@/components/ui";

/**
 * 배그 랭킹.
 *
 * 롤 랭킹 화면을 그대로 쓸 수 없다. 배그에는 승패가 없어 승률 칸이 비고,
 * 라이엇 계정·티어 아이콘도 없다. 대신 이 게임에서 의미 있는 값
 * (누적 포인트, 평균 순위, 킬)을 보여준다.
 *
 * 줄 세우는 기준은 누적 포인트다 — 많이 참가해 많이 쌓은 사람이 위로 오는
 * 편이 내전 랭킹의 취지에 맞다. 평균만 보면 한 판 잘한 사람이 top 에 박힌다.
 */
export function PubgRankingPage() {
  const router = useRouter();
  const gamePrefix = useGamePrefix();
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data, isLoading } = useQuery({
    queryKey: ["pubgRanking", page],
    queryFn: () => rankingApi.getPubgRanking(page, limit),
    staleTime: 2 * 60 * 1000,
  });

  const rankBadge = (rank: number) => {
    if (rank === 1)
      return (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-gold/20">
          <Crown className="h-5 w-5 text-accent-gold" />
        </div>
      );
    return (
      <div className="flex h-8 w-8 items-center justify-center">
        <span className="text-sm font-medium text-text-secondary">{rank}</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen">
      <div className="border-b border-bg-tertiary bg-bg-secondary">
        <div className="container mx-auto px-4 py-6">
          <div className="mb-4 flex items-center gap-3">
            <Trophy className="h-8 w-8 text-accent-gold" />
            <h1 className="text-2xl font-bold text-text-primary md:text-3xl">
              랭킹
            </h1>
          </div>
          <p className="text-text-secondary">
            배그 내전 기록 기반 랭킹 — 누적 포인트 순
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            팀 성적이 팀원 전원에게 같이 쌓입니다. 순위는 스크림마다 총점 →
            킬 순으로 가립니다.
          </p>
        </div>
      </div>

      <div className="container mx-auto max-w-4xl px-4 py-8">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(10)].map((_, index) => (
              <div
                key={index}
                className="flex items-center gap-4 rounded-xl border border-bg-tertiary bg-bg-secondary p-4"
              >
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-grow space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        ) : !data || data.rankings.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="아직 랭킹에 오른 사람이 없습니다"
            description="배틀로얄 스크림이나 킬내기 결과가 들어가면 참가자 전원이 여기에 오릅니다. 첫 내전을 열어보세요."
            action={{
              label: "내전 방 둘러보기",
              onClick: () => router.push(`${gamePrefix}/tournaments`),
            }}
          />
        ) : (
          <>
            <div className="space-y-2">
              {data.rankings.map((entry) => {
                const account = entry.user?.pubgAccounts?.[0];
                return (
                  <Link
                    key={entry.userId}
                    href={`${gamePrefix}/matches/user/${entry.userId}`}
                    className="flex items-center gap-4 rounded-xl border border-bg-tertiary bg-bg-secondary p-4 transition-colors hover:bg-bg-tertiary/50"
                  >
                    {rankBadge(entry.rank)}

                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-bg-tertiary">
                      {entry.user?.avatar ? (
                        <Image
                          src={entry.user.avatar}
                          alt={entry.user.username}
                          width={40}
                          height={40}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-sm font-bold text-text-tertiary">
                          {entry.user?.username.charAt(0) ?? "?"}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-grow">
                      <p className="truncate font-semibold text-text-primary">
                        {entry.user?.username ?? "탈퇴한 사용자"}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-tertiary">
                        {account && <span>{account.playerName}</span>}
                        <span>{entry.scrims}회 참가</span>
                        <span className="flex items-center gap-1">
                          <Crosshair className="h-3 w-3" />
                          {entry.totalKills}킬
                        </span>
                        {entry.wins > 0 && <span>{entry.wins}회 우승</span>}
                      </div>
                    </div>

                    <div className="flex-shrink-0 text-right">
                      <p className="text-sm font-bold text-accent-primary">
                        {entry.totalPoints}점
                      </p>
                      <p className="text-xs text-text-tertiary">
                        평균 {entry.averagePlacement.toFixed(1)}위
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>

            {data.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-4">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-text-secondary">
                  {page} / {data.totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
