"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { rankingApi } from "@/lib/api-client";
import { Skeleton, Button, EmptyState } from "@/components/ui";
import { Trophy, Crown, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { getTierImage } from "@/components/matches/match-utils";

export default function RankingPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<"global" | "clan">("global");
  const limit = 50;

  const { data, isLoading } = useQuery({
    queryKey: ["globalRanking", page],
    queryFn: () => rankingApi.getGlobalRanking(page, limit),
    staleTime: 2 * 60 * 1000,
    enabled: tab === "global",
  });

  const getRankBadge = (rank: number) => {
    if (rank === 1)
      return (
        <div className="w-8 h-8 rounded-full bg-accent-gold/20 flex items-center justify-center">
          <Crown className="h-5 w-5 text-accent-gold" />
        </div>
      );
    if (rank === 2)
      return (
        <div className="w-8 h-8 rounded-full bg-gray-300/20 flex items-center justify-center">
          <span className="text-sm font-bold text-gray-300">2</span>
        </div>
      );
    if (rank === 3)
      return (
        <div className="w-8 h-8 rounded-full bg-orange-400/20 flex items-center justify-center">
          <span className="text-sm font-bold text-orange-400">3</span>
        </div>
      );
    return (
      <div className="w-8 h-8 flex items-center justify-center">
        <span className="text-sm font-medium text-text-secondary">{rank}</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Header */}
      <div className="border-b border-bg-tertiary bg-bg-secondary">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-4">
            <Trophy className="h-8 w-8 text-accent-gold" />
            <h1 className="text-2xl md:text-3xl font-bold text-text-primary">랭킹</h1>
          </div>
          <p className="text-text-secondary">
            Nexus 내전 기록 기반 랭킹 (최소 10판 이상)
          </p>

          {/* Tabs */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => {
                setTab("global");
                setPage(1);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === "global"
                  ? "bg-accent-primary text-white"
                  : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
              }`}
            >
              <Trophy className="h-4 w-4 inline mr-1.5" />
              글로벌
            </button>
            <button
              onClick={() => {
                setTab("clan");
                setPage(1);
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === "clan"
                  ? "bg-accent-primary text-white"
                  : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
              }`}
            >
              <Users className="h-4 w-4 inline mr-1.5" />
              클랜
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {tab === "global" && (
          <>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(10)].map((_, i) => (
                  <div
                    key={i}
                    className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4 flex items-center gap-4"
                  >
                    <Skeleton className="w-8 h-8 rounded-full" />
                    <Skeleton className="w-10 h-10 rounded-lg" />
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
                title="아직 랭킹에 오른 플레이어가 없습니다"
                description="내전 기록이 10경기 쌓이면 승률과 전적을 기준으로 랭킹에 등록됩니다. 첫 기록을 만들어보세요."
                action={{
                  label: "내전 방 둘러보기",
                  onClick: () => router.push("/tournaments"),
                }}
              />
            ) : (
              <>
                <div className="space-y-2">
                  {data.rankings.map((entry: any) => {
                    const riotAccount = entry.user.riotAccounts?.[0];
                    const winRate = entry.winRate.toFixed(1);

                    return (
                      <Link
                        key={entry.id}
                        href={`/matches/user/${entry.userId}`}
                        className="bg-bg-secondary border border-bg-tertiary rounded-xl p-4 flex items-center gap-4 hover:bg-bg-tertiary/50 transition-colors"
                      >
                        {/* Rank */}
                        {getRankBadge(entry.globalRank)}

                        {/* Avatar */}
                        <div className="w-10 h-10 rounded-lg bg-bg-tertiary flex items-center justify-center overflow-hidden">
                          {entry.user.avatar ? (
                            <Image
                              src={entry.user.avatar}
                              alt={entry.user.username}
                              width={40}
                              height={40}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-sm font-bold text-text-tertiary">
                              {entry.user.username.charAt(0)}
                            </span>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-grow min-w-0">
                          <p className="font-semibold text-text-primary truncate">
                            {entry.user.username}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-text-tertiary">
                            {riotAccount && (
                              <span>
                                {riotAccount.gameName}#{riotAccount.tagLine}
                              </span>
                            )}
                            {riotAccount?.tier && (
                              <span className="flex items-center gap-1">
                                {getTierImage(riotAccount.tier) && (
                                  <Image
                                    src={getTierImage(riotAccount.tier)!}
                                    alt={riotAccount.tier}
                                    width={16}
                                    height={16}
                                    className="w-4 h-4"
                                  />
                                )}
                                {riotAccount.tier} {riotAccount.rank}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="text-right flex-shrink-0">
                          <p
                            className={`font-bold text-sm ${
                              parseFloat(winRate) >= 60
                                ? "text-accent-success"
                                : parseFloat(winRate) >= 50
                                ? "text-accent-primary"
                                : "text-accent-danger"
                            }`}
                          >
                            {winRate}%
                          </p>
                          <p className="text-xs text-text-tertiary">
                            {entry.totalGames}전 {entry.wins}승 {entry.losses}패
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {/* Pagination */}
                {data.totalPages > 1 && (
                  <div className="flex items-center justify-center gap-4 mt-6">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
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
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {tab === "clan" && (
          <EmptyState
            icon={Users}
            title="클랜별 랭킹은 클랜 페이지에서 확인할 수 있습니다"
            description="활동 중인 클랜을 찾아 가입하고 클랜원들과 내전 기록을 쌓아보세요."
            action={{
              label: "클랜 둘러보기",
              onClick: () => router.push("/clans"),
            }}
          />
        )}
      </div>
    </div>
  );
}
