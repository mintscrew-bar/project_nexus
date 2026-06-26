"use client";

import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Users } from "lucide-react";
import { TierBadge } from "@/components/domain/TierBadge";
import { ReputationSummary } from "@/components/domain/ProfileStats";
import { LoadingSpinner, Modal } from "@/components/ui";
import { matchApi, reputationApi, userApi } from "@/lib/api-client";
import { getChampionIcon } from "@/components/matches/match-utils";
import { ChampionIcon, PositionIcon, POSITION_LABELS } from "./icons";

interface PlayerProfileModalProps {
  userId: string | null;
  onClose: () => void;
}

function getTierGradient(tier?: string | null) {
  switch (tier) {
    case "CHALLENGER": return "from-amber-300 to-amber-500";
    case "GRANDMASTER": return "from-rose-400 to-rose-600";
    case "MASTER": return "from-purple-400 to-purple-600";
    case "DIAMOND": return "from-cyan-400 to-cyan-600";
    case "PLATINUM": return "from-teal-400 to-teal-600";
    case "EMERALD": return "from-emerald-400 to-emerald-600";
    case "GOLD": return "from-yellow-400 to-yellow-600";
    case "SILVER": return "from-slate-300 to-slate-500";
    case "BRONZE": return "from-orange-700 to-orange-900";
    case "IRON": return "from-stone-500 to-stone-700";
    default: return "from-bg-tertiary to-bg-elevated";
  }
}

function formatPeakTier(riot: any) {
  if (!riot?.peakTier) return "기록 없음";
  return `${riot.peakTier}${riot.peakRank ? ` ${riot.peakRank}` : ""}`;
}

function formatJoinDate(value?: string) {
  if (!value) return "가입일 미상";
  return `${new Date(value).toLocaleDateString("ko-KR")} 가입`;
}

function formatTimeAgo(value?: string) {
  if (!value) return "일시 미상";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60_000));
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-bg-tertiary p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">{label}</p>
      <p className="mt-1 text-sm font-bold text-text-primary">{value}</p>
    </div>
  );
}

function getPrimaryRiot(profile: any) {
  return profile?.riotAccounts?.find((account: any) => account.isPrimary) || profile?.riotAccounts?.[0] || null;
}

export function PlayerProfileModal({ userId, onClose }: PlayerProfileModalProps) {
  const { data: profile, isLoading: profileLoading, isError } = useQuery({
    queryKey: ["userProfile", userId],
    queryFn: () => userApi.getProfile(userId!),
    staleTime: 60_000,
    enabled: Boolean(userId),
  });

  const { data: stats } = useQuery({
    queryKey: ["userStats", userId],
    queryFn: () => userApi.getUserStats(userId!),
    staleTime: 60_000,
    enabled: Boolean(userId),
  });

  const { data: rep } = useQuery({
    queryKey: ["reputationStats", userId],
    queryFn: () => reputationApi.getUserStats(userId!),
    staleTime: 60_000,
    enabled: Boolean(userId),
  });

  const { data: history } = useQuery({
    queryKey: ["matchHistory", userId, 5],
    queryFn: () => matchApi.getUserMatchHistory(userId!, 5, 0),
    staleTime: 60_000,
    enabled: Boolean(userId),
  });

  const riot = getPrimaryRiot(profile);
  const mainRole = riot?.mainRole || null;
  const subRole = riot?.subRole || null;
  const champions = [...(riot?.championPreferences || [])].sort((a: any, b: any) => a.order - b.order);
  const clan = profile?.clanMemberships?.[0]?.clan || null;

  return (
    <Modal isOpen={Boolean(userId)} onClose={onClose} size="full" showCloseButton>
      {profileLoading && (
        <div className="flex min-h-[360px] items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {!profileLoading && isError && (
        <div className="space-y-4 py-12 text-center">
          <p className="text-sm text-text-secondary">프로필을 불러오지 못했습니다</p>
          <button type="button" onClick={onClose} className="rounded-lg bg-bg-tertiary px-4 py-2 text-sm text-text-primary hover:bg-bg-elevated">
            닫기
          </button>
        </div>
      )}

      {!profileLoading && !isError && profile && (
        <div className="space-y-4">
          <div className={`h-24 rounded-lg bg-gradient-to-r ${getTierGradient(riot?.tier)}`} />
          <div className="-mt-12 flex items-end gap-4 px-3">
            <div className="relative h-20 w-20 overflow-hidden rounded-full border-4 border-bg-secondary bg-bg-tertiary">
              {profile.avatar ? (
                <Image src={profile.avatar} alt={profile.username} fill className="object-cover" unoptimized />
              ) : (
                <div className="flex h-full w-full items-center justify-center"><Users className="h-8 w-8 text-text-tertiary" /></div>
              )}
            </div>
            <div className="min-w-0 flex-1 pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-xl font-bold text-text-primary">{riot ? riot.gameName : profile.username}</h2>
                {riot?.tagLine && <span className="text-sm text-text-tertiary">#{riot.tagLine}</span>}
                {riot?.tier && <TierBadge tier={riot.tier} rank={riot.rank || undefined} size="sm" showIcon />}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
                <span>@{profile.username}</span>
                {clan && <span className="rounded bg-accent-primary/10 px-2 py-0.5 text-accent-primary">[{clan.tag}] {clan.name}</span>}
                <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{formatJoinDate(profile.createdAt)}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <SummaryChip label="전적" value={`${stats?.wins ?? 0}승 ${stats?.losses ?? 0}패`} />
            <SummaryChip label="승률" value={`${Math.round(stats?.winRate ?? 0)}%`} />
            <SummaryChip label="참여" value={`${stats?.participations ?? 0}회`} />
            <SummaryChip label="피크 티어" value={formatPeakTier(riot)} />
          </div>

          <section className="rounded-lg bg-bg-tertiary p-3">
            <h3 className="mb-3 text-sm font-bold text-text-primary">신뢰도</h3>
            <ReputationSummary stats={rep} />
          </section>

          <section className="rounded-lg bg-bg-tertiary p-3">
            <h3 className="mb-3 text-sm font-bold text-text-primary">포지션 및 선호 챔피언</h3>
            <div className="flex flex-wrap items-center gap-3">
              {mainRole && <span className="inline-flex items-center gap-1.5 text-sm text-text-primary"><PositionIcon position={mainRole} />{POSITION_LABELS[mainRole] || mainRole} 주</span>}
              {subRole && <span className="inline-flex items-center gap-1.5 text-sm text-text-secondary"><PositionIcon position={subRole} opacity={0.7} />{POSITION_LABELS[subRole] || subRole} 부</span>}
              {!mainRole && !subRole && <span className="text-sm text-text-tertiary">등록된 포지션이 없습니다</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {champions.length > 0
                ? champions.slice(0, 10).map((champion: any, index: number) => <ChampionIcon key={`${champion.championId}-${index}`} championId={champion.championId} size={32} />)
                : <span className="text-sm text-text-tertiary">등록된 선호 챔피언이 없습니다</span>}
            </div>
          </section>

          <section className="rounded-lg bg-bg-tertiary p-3">
            <h3 className="mb-3 text-sm font-bold text-text-primary">최근 5경기</h3>
            {history?.length > 0 ? (
              <div className="space-y-2">
                {history.slice(0, 5).map((match: any) => (
                  <div key={match.matchId} className="flex items-center gap-3 rounded-lg bg-bg-secondary p-2">
                    <Image
                      src={getChampionIcon(match.participant?.championName)}
                      alt={match.participant?.championName || "champion"}
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-full"
                      unoptimized
                    />
                    <span className={`h-2 w-2 rounded-full ${match.participant?.win ? "bg-accent-success" : "bg-accent-danger"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {match.participant?.kills ?? 0}/{match.participant?.deaths ?? 0}/{match.participant?.assists ?? 0} · {match.participant?.championName || "챔피언"}
                      </p>
                      <p className="text-xs text-text-tertiary">{formatTimeAgo(match.match?.completedAt || match.match?.createdAt)}</p>
                    </div>
                    <span className={`text-xs font-bold ${match.participant?.win ? "text-accent-success" : "text-accent-danger"}`}>
                      {match.participant?.win ? "승" : "패"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-text-tertiary">최근 경기 없음</p>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
