"use client";

import Image from "next/image";
import type { ElementType, ReactNode } from "react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  CalendarDays,
  Flag,
  Loader2,
  Medal,
  ShieldCheck,
  Swords,
  Star,
  Trophy,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { LoadingSpinner, Modal } from "@/components/ui";
import { matchApi, reputationApi, userApi } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { getChampionIcon } from "@/components/matches/match-utils";
import { ChampionIcon, PositionIcon, POSITION_LABELS } from "@/app/tournaments/[id]/lobby/_components/icons";

interface PlayerProfileModalProps {
  userId: string | null;
  onClose: () => void;
}

// 유저 신고 사유 (백엔드 ReportReason enum과 일치)
type ReportReason = "TOXICITY" | "AFK" | "GRIEFING" | "CHEATING" | "OTHER";
const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "TOXICITY", label: "욕설/비하/혐오 표현" },
  { value: "AFK", label: "잠수/고의 트롤" },
  { value: "GRIEFING", label: "스팸/방해 행위" },
  { value: "CHEATING", label: "치팅/핵 사용" },
  { value: "OTHER", label: "기타" },
];

const ACCENT = "#667EEA";

const TIER_COLOR: Record<string, string> = {
  CHALLENGER: "#F59E0B",
  GRANDMASTER: "#F43F5E",
  MASTER: "#A855F7",
  DIAMOND: "#22D3EE",
  PLATINUM: "#2DD4BF",
  EMERALD: "#10B981",
  GOLD: "#EAB308",
  SILVER: "#94A3B8",
  BRONZE: "#F97316",
  IRON: "#78716C",
};

const TIER_KO: Record<string, string> = {
  CHALLENGER: "챌린저",
  GRANDMASTER: "그랜드마스터",
  MASTER: "마스터",
  DIAMOND: "다이아몬드",
  PLATINUM: "플래티넘",
  EMERALD: "에메랄드",
  GOLD: "골드",
  SILVER: "실버",
  BRONZE: "브론즈",
  IRON: "아이언",
};


function formatPeakTier(riot: any) {
  if (!riot?.peakTier) return "기록 없음";
  const isApex = ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(riot.peakTier);
  const tier = TIER_KO[riot.peakTier] ?? riot.peakTier;
  return `${tier}${riot.peakRank && !isApex ? ` ${riot.peakRank}` : ""}`;
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

function formatLp(value?: number | null) {
  return typeof value === "number" ? `${value} LP` : "LP 없음";
}

function formatTier(riot: any) {
  if (!riot?.tier) return "UNRANKED";
  const isApex = ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(riot.tier);
  const tier = TIER_KO[riot.tier] ?? riot.tier;
  return `${tier}${riot.rank && !isApex ? ` ${riot.rank}` : ""}`;
}

function formatDamage(value?: number | null) {
  if (!value) return "-";
  if (value >= 1000) return `${Math.round(value / 100) / 10}k`;
  return `${value}`;
}

function formatOneDecimal(value: number) {
  return value.toFixed(1).replace(/\.0$/, "");
}

function getKdaRatio(kills = 0, deaths = 0, assists = 0) {
  return deaths === 0 ? kills + assists : (kills + assists) / deaths;
}

function getRecentMetrics(matches: any[]) {
  const games = matches.length;
  const wins = matches.filter((match) => match.participant?.win).length;
  const kills = matches.reduce((sum, match) => sum + (match.participant?.kills ?? 0), 0);
  const deaths = matches.reduce((sum, match) => sum + (match.participant?.deaths ?? 0), 0);
  const assists = matches.reduce((sum, match) => sum + (match.participant?.assists ?? 0), 0);
  const damage = matches.reduce((sum, match) => sum + (match.participant?.damage ?? 0), 0);

  return {
    games,
    wins,
    winRate: games > 0 ? Math.round((wins / games) * 100) : 0,
    avgKills: games > 0 ? kills / games : 0,
    avgDeaths: games > 0 ? deaths / games : 0,
    avgAssists: games > 0 ? assists / games : 0,
    avgKda: games > 0 ? getKdaRatio(kills, deaths, assists) : 0,
    avgDamage: games > 0 ? damage / games : 0,
  };
}

function getChampionGroups(champions: any[], mainRole?: string | null, subRole?: string | null) {
  const grouped = new Map<string, any[]>();
  for (const champion of champions) {
    const role = champion.role || "FLEX";
    grouped.set(role, [...(grouped.get(role) || []), champion]);
  }

  const roleOrder: string[] = [];
  const addRole = (role?: string | null) => {
    if (role && grouped.has(role) && !roleOrder.includes(role)) roleOrder.push(role);
  };

  addRole(mainRole);
  addRole(subRole);
  for (const champion of champions) addRole(champion.role || "FLEX");

  return roleOrder.map((role) => ({
    role,
    champions: grouped.get(role) || [],
  }));
}

function getRecentWinOutcomes(matches: any[]) {
  return matches
    .slice(0, 6)
    .reverse()
    .map((match) => Boolean(match.participant?.win));
}

function WinRateSparkline({ matches }: { matches: any[] }) {
  const outcomes = getRecentWinOutcomes(matches);

  if (outcomes.length === 0) {
    return <div className="h-7 w-14" />;
  }

  const width = 56;
  const height = 28;
  const innerWidth = 44;
  const xStart = 6;
  const points = outcomes.map((won, index) => {
    const x = outcomes.length === 1 ? width / 2 : xStart + (index * innerWidth) / (outcomes.length - 1);
    const y = won ? 8 : 21;
    return { x, y, won };
  });
  const pointPath = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="h-7 w-14" title="최근 경기 승패 흐름">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="최근 승패 그래프">
        <polyline
          points={pointPath}
          fill="none"
          stroke="rgb(125, 211, 252)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.4"
        />
      </svg>
    </div>
  );
}

function RepBar({ label, value }: { label: string; value: number }) {
  const safeValue = Math.max(0, Math.min(5, value || 0));
  return (
    <div className="flex items-center gap-3">
      <span className="w-10 text-xs font-semibold text-zinc-400">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full rounded-full bg-violet-500" style={{ width: `${(safeValue / 5) * 100}%` }} />
      </div>
      <span className="w-8 text-right text-xs font-bold text-white">{safeValue.toFixed(1)}</span>
    </div>
  );
}

function RatingStars({ value }: { value: number }) {
  const rounded = Math.max(0, Math.min(5, Math.round(value || 0)));
  return (
    <span className="text-sm text-yellow-400">
      {"★".repeat(rounded)}
      <span className="text-zinc-700">{"★".repeat(5 - rounded)}</span>
    </span>
  );
}

function DetailMetric({
  label,
  value,
  detail,
  icon: Icon,
  accentColor,
}: {
  label: string;
  value: string;
  detail?: string;
  icon?: ElementType;
  accentColor?: string;
}) {
  return (
    <div className="rounded-xl bg-[#101010] p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <p className="truncate text-base font-black leading-none text-white" style={accentColor ? { color: accentColor } : undefined}>
        {value}
      </p>
      {detail && <p className="mt-1 truncate text-xs text-zinc-500">{detail}</p>}
    </div>
  );
}

function SummaryChip({
  icon: Icon,
  label,
  value,
  detail,
  side,
  valueClassName = "text-white",
}: {
  icon: ElementType;
  label: string;
  value: string;
  detail?: string;
  side?: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl bg-[#181818] p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className={`min-w-0 text-lg font-black leading-none ${valueClassName}`}>{value}</p>
        {side && <div className="shrink-0">{side}</div>}
      </div>
      {detail && <p className="mt-1 truncate text-xs text-zinc-500">{detail}</p>}
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
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(userId),
  });

  const { data: stats } = useQuery({
    queryKey: ["userStats", userId],
    queryFn: () => userApi.getUserStats(userId!),
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(userId),
  });

  const { data: rep } = useQuery({
    queryKey: ["reputationStats", userId],
    queryFn: () => reputationApi.getUserStats(userId!),
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(userId),
  });

  const { data: history } = useQuery({
    queryKey: ["matchHistory", userId, 5],
    queryFn: () => matchApi.getUserMatchHistory(userId!, 5, 0),
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(userId),
  });

  // ─── 유저 신고 상태 ────────────────────────────────────────────
  const { user } = useAuthStore();
  // 본인 프로필이면 신고 버튼을 숨긴다
  const isMe = Boolean(user?.id && userId && user.id === userId);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>("TOXICITY");
  const [reportDescription, setReportDescription] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // 신고 모달 열기 (상태 초기화)
  const openReport = () => {
    setReportReason("TOXICITY");
    setReportDescription("");
    setReportSuccess(false);
    setReportError(null);
    setReportOpen(true);
  };

  // 신고 제출
  const handleSubmitReport = async () => {
    if (!userId || !reportDescription.trim()) return;
    setIsSubmittingReport(true);
    setReportError(null);
    try {
      await reputationApi.reportUser({
        targetUserId: userId,
        reason: reportReason,
        description: reportDescription.trim(),
      });
      setReportSuccess(true);
    } catch (err: any) {
      // 중복 신고 등은 메시지로 안내
      setReportError(
        err?.response?.data?.message ||
          "신고 접수에 실패했습니다. (이미 신고했을 수 있습니다.)",
      );
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const riot = getPrimaryRiot(profile);
  const mainRole = riot?.mainRole || null;
  const subRole = riot?.subRole || null;
  const champions = [...(riot?.championPreferences || [])].sort((a: any, b: any) => a.order - b.order);
  const championGroups = getChampionGroups(champions, mainRole, subRole);
  const recentMatches = Array.isArray(history) ? history : [];
  const recent = getRecentMetrics(recentMatches);
  const clan = profile?.clanMemberships?.[0]?.clan || null;
  const wins = stats?.wins ?? 0;
  const losses = stats?.losses ?? 0;
  const gamesPlayed = stats?.gamesPlayed ?? wins + losses;
  const participations = stats?.participations ?? 0;
  const winRate = Math.round(stats?.winRate ?? 0);
  const accent = TIER_COLOR[riot?.tier ?? ""] ?? ACCENT;

  return (
    <Modal
      isOpen={Boolean(userId)}
      onClose={onClose}
      size="full"
      showCloseButton={false}
      className="max-w-5xl overflow-hidden rounded-[18px] border-[#667EEA]/40 bg-[#101010] text-white shadow-[0_32px_70px_rgba(0,0,0,0.82)]"
    >
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
          <section
            className="rounded-[18px] bg-[#101010] p-4"
            style={{
              border: `1px solid ${ACCENT}66`,
              boxShadow: `0 0 0 1px ${ACCENT}18`,
            }}
          >
            <div className="flex justify-end gap-2">
                {!isMe && (
                  <button
                    type="button"
                    onClick={openReport}
                    title="이 유저 신고"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-xs font-semibold text-zinc-400 transition-colors hover:text-red-300"
                  >
                    <Flag className="h-3.5 w-3.5" />
                    신고
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="프로필 닫기"
                  className="rounded-lg bg-[#1a1a1a] p-1.5 text-zinc-400 transition-colors hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start">
                <div
                  className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-full bg-[#171717] sm:h-24 sm:w-24"
                  style={{ border: `2px solid ${riot?.tier && riot.tier !== "UNRANKED" ? ACCENT + "88" : "rgba(255,255,255,0.14)"}` }}
                >
                  {profile.avatar ? (
                    <Image src={profile.avatar} alt={profile.username} fill className="object-cover" unoptimized />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Users className="h-9 w-9 text-zinc-500" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-xl font-black leading-tight text-white sm:text-2xl">
                      {profile.username}
                    </h2>
                    {clan?.tag && (
                      <span
                        className="shrink-0 rounded-md px-2 py-1 text-xs font-black leading-none"
                        style={{ color: ACCENT, backgroundColor: `${ACCENT}22` }}
                      >
                        {clan.tag}
                      </span>
                    )}
                  </div>

                  {riot && (
                    <p className="mt-1 text-sm text-zinc-500">
                      {riot.gameName}<span className="text-zinc-600"> #{riot.tagLine}</span>
                    </p>
                  )}

                  {riot?.tier && riot.tier !== "UNRANKED" && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-lg font-black" style={{ color: TIER_COLOR[riot.tier] ?? ACCENT }}>
                        {formatTier(riot)}
                      </span>
                      {riot.lp != null && (
                        <span className="text-sm font-bold text-zinc-200">{riot.lp} LP</span>
                      )}
                    </div>
                  )}

                  {riot?.peakTier && riot.peakTier !== "UNRANKED" && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-zinc-600">최고</span>
                      <span className="text-xs font-semibold text-zinc-400">
                        {formatPeakTier(riot)}
                        {riot.peakLp != null && ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(riot.peakTier) ? ` ${riot.peakLp}LP` : ""}
                      </span>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {(mainRole || subRole) && (
                      <>
                        {mainRole && (
                          <div className="flex items-center gap-1.5 rounded-lg bg-[#1a1a1a] px-2.5 py-1.5">
                            <PositionIcon position={mainRole} className="!h-4 !w-4" />
                            <span className="text-xs font-bold text-white">{POSITION_LABELS[mainRole] || mainRole}</span>
                            <span className="rounded bg-[#262626] px-1 text-[9px] font-black text-zinc-600">주</span>
                          </div>
                        )}
                        {subRole && (
                          <div className="flex items-center gap-1.5 rounded-lg bg-[#1a1a1a] px-2.5 py-1.5">
                            <PositionIcon position={subRole} className="!h-4 !w-4" opacity={0.6} />
                            <span className="text-xs font-semibold text-zinc-400">{POSITION_LABELS[subRole] || subRole}</span>
                            <span className="rounded bg-[#262626] px-1 text-[9px] font-black text-zinc-600">부</span>
                          </div>
                        )}
                      </>
                    )}
                    <span className="inline-flex items-center gap-1 text-xs text-zinc-600">
                      <CalendarDays className="h-3 w-3" />
                      {formatJoinDate(profile.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
          </section>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <SummaryChip
              icon={Swords}
              label="전적"
              value={`${wins}승 ${losses}패`}
              detail={`${gamesPlayed}게임 · 참여 ${participations}회`}
            />
            <SummaryChip
              icon={TrendingUp}
              label="승률"
              value={`${winRate}%`}
              detail={gamesPlayed > 0 ? `${wins}승 ${losses}패` : "전적 없음"}
              side={<WinRateSparkline matches={recentMatches} />}
              valueClassName={winRate >= 50 ? "text-sky-300" : "text-rose-300"}
            />
            <SummaryChip
              icon={ShieldCheck}
              label="신뢰도"
              value={`${(rep?.overallAverage ?? 0).toFixed(1)} / 5`}
              detail={`${rep?.totalRatings ?? 0}개 평가`}
            />
            <SummaryChip
              icon={Trophy}
              label="피크 티어"
              value={formatPeakTier(riot)}
              detail={formatLp(riot?.peakLp)}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            <section className="rounded-xl bg-[#181818] p-4">
              <div className="mb-4 flex items-center gap-2">
                <Medal className="h-4 w-4" style={{ color: accent }} />
                <h3 className="text-sm font-black text-white">랭크 & 내전 요약</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <DetailMetric
                  icon={Trophy}
                  label="현재 티어"
                  value={formatTier(riot)}
                  detail={formatLp(riot?.lp)}
                  accentColor={accent}
                />
                <DetailMetric
                  icon={Swords}
                  label="내전 참여"
                  value={`${participations}회`}
                  detail={`${gamesPlayed}경기 집계`}
                />
                <DetailMetric
                  icon={TrendingUp}
                  label="최근 승률"
                  value={recent.games > 0 ? `${recent.winRate}%` : "-"}
                  detail={recent.games > 0 ? `최근 ${recent.games}경기 ${recent.wins}승` : "최근 기록 없음"}
                  accentColor={recent.winRate >= 50 ? "#7DD3FC" : "#FDA4AF"}
                />
                <DetailMetric
                  icon={Activity}
                  label="최근 KDA"
                  value={recent.games > 0 ? recent.avgKda.toFixed(2) : "-"}
                  detail={
                    recent.games > 0
                      ? `${formatOneDecimal(recent.avgKills)} / ${formatOneDecimal(recent.avgDeaths)} / ${formatOneDecimal(recent.avgAssists)}`
                      : "최근 기록 없음"
                  }
                />
              </div>
            </section>

            <section className="rounded-xl bg-[#181818] p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-yellow-400" />
                  <h3 className="text-sm font-black text-white">신뢰도 상세</h3>
                </div>
                <span className="text-xs text-zinc-600">{rep?.totalRatings ?? 0}개 평가</span>
              </div>
              <div className="mb-4 flex items-center justify-between rounded-xl bg-[#101010] p-3">
                <div>
                  <p className="text-xs font-semibold text-zinc-500">종합 평가</p>
                  <div className="mt-1">
                    <RatingStars value={rep?.overallAverage ?? 0} />
                  </div>
                </div>
                <p className="text-2xl font-black text-white">{(rep?.overallAverage ?? 0).toFixed(1)}</p>
              </div>
              <div className="space-y-3">
                <RepBar label="실력" value={rep?.averageSkill ?? 0} />
                <RepBar label="태도" value={rep?.averageAttitude ?? 0} />
                <RepBar label="소통" value={rep?.averageCommunication ?? 0} />
              </div>
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <section className="rounded-xl bg-[#181818] p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-black text-white">포지션 및 선호 챔피언</h3>
                {(mainRole || subRole) && (
                  <div className="flex items-center gap-2">
                    {mainRole && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#1a1a1a] px-2.5 py-1.5 text-xs font-bold text-white">
                        <PositionIcon position={mainRole} />
                        {POSITION_LABELS[mainRole] || mainRole} 주
                      </span>
                    )}
                    {subRole && (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#1a1a1a] px-2.5 py-1.5 text-xs font-semibold text-zinc-400">
                        <PositionIcon position={subRole} opacity={0.7} />
                        {POSITION_LABELS[subRole] || subRole} 부
                      </span>
                    )}
                  </div>
                )}
              </div>

              {!mainRole && !subRole && (
                <p className="text-sm text-zinc-500">등록된 포지션이 없습니다</p>
              )}
              {championGroups.length > 0 ? (
                <div className="space-y-2">
                  {championGroups.map((group) => (
                    <div key={group.role} className="rounded-xl bg-[#101010] p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white">
                          <PositionIcon position={group.role} />
                          {POSITION_LABELS[group.role] || group.role}
                          {group.role === mainRole && <span className="text-zinc-500">주</span>}
                          {group.role === subRole && <span className="text-zinc-500">부</span>}
                        </span>
                        <span className="text-[10px] font-semibold text-zinc-600">{group.champions.length}개</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {group.champions.map((champion: any, index: number) => (
                          <div key={`${group.role}-${champion.championId}-${index}`} className="relative">
                            <ChampionIcon championId={champion.championId} size={34} />
                            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-black px-1 text-[9px] font-black text-zinc-300 ring-1 ring-white/10">
                              {champion.order ?? index + 1}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-zinc-500">등록된 선호 챔피언이 없습니다</span>
              )}
            </section>

            <section className="rounded-xl bg-[#181818] p-4">
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-violet-400" />
                <h3 className="text-sm font-black text-white">최근 경기 지표</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <DetailMetric
                  label="최근 전적"
                  value={recent.games > 0 ? `${recent.wins}승 ${recent.games - recent.wins}패` : "-"}
                  detail={recent.games > 0 ? `${recent.games}경기 기준` : "기록 없음"}
                />
                <DetailMetric
                  label="평균 피해량"
                  value={recent.games > 0 ? formatDamage(Math.round(recent.avgDamage)) : "-"}
                  detail="챔피언 대상"
                />
                <DetailMetric
                  label="평균 킬"
                  value={recent.games > 0 ? formatOneDecimal(recent.avgKills) : "-"}
                  detail="최근 경기 평균"
                />
                <DetailMetric
                  label="평균 데스"
                  value={recent.games > 0 ? formatOneDecimal(recent.avgDeaths) : "-"}
                  detail="낮을수록 안정적"
                />
              </div>
            </section>
          </div>

          <section className="rounded-xl bg-[#181818] p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-black text-white">최근 5경기</h3>
              <span className="text-xs text-zinc-600">내전 기록</span>
            </div>
            {recentMatches.length > 0 ? (
              <div className="grid gap-2 md:grid-cols-2">
                {recentMatches.slice(0, 5).map((match: any) => {
                  const participant = match.participant || {};
                  return (
                  <div key={match.matchId} className="rounded-xl bg-[#101010] p-3">
                    <div className="flex items-center gap-3">
                    <Image
                      src={getChampionIcon(participant.championName)}
                      alt={participant.championName || "champion"}
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded-full"
                      unoptimized
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">
                        {participant.kills ?? 0}/{participant.deaths ?? 0}/{participant.assists ?? 0} · {participant.championNameKorean || participant.championName || "챔피언"}
                      </p>
                      <p className="text-xs text-zinc-600">
                        {POSITION_LABELS[participant.position] || participant.position || "포지션 미상"} · {match.team?.name || "팀 미상"} · {formatTimeAgo(match.match?.completedAt || match.match?.createdAt)}
                      </p>
                    </div>
                    <span className={`rounded-md px-2 py-1 text-xs font-black ${participant.win ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300"}`}>
                      {participant.win ? "승" : "패"}
                    </span>
                  </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-[#181818] px-2 py-1.5">
                        <p className="text-[10px] text-zinc-600">KDA</p>
                        <p className="text-xs font-black text-white">{getKdaRatio(participant.kills, participant.deaths, participant.assists).toFixed(2)}</p>
                      </div>
                      <div className="rounded-lg bg-[#181818] px-2 py-1.5">
                        <p className="text-[10px] text-zinc-600">피해량</p>
                        <p className="text-xs font-black text-white">{formatDamage(participant.damage)}</p>
                      </div>
                      <div className="rounded-lg bg-[#181818] px-2 py-1.5">
                        <p className="text-[10px] text-zinc-600">상대</p>
                        <p className="truncate text-xs font-black text-white">
                          {match.match?.teamA?.id === match.team?.id ? match.match?.teamB?.name : match.match?.teamA?.name}
                        </p>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-xl bg-[#101010] py-8 text-center text-sm text-zinc-500">최근 경기 없음</p>
            )}
          </section>

          {/* ─── 유저 신고 모달 ──────────────────────────────────── */}
          {reportOpen && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
              <div className="w-full max-w-sm rounded-xl border border-bg-elevated bg-bg-secondary shadow-xl">
                {/* 헤더 */}
                <div className="flex items-center justify-between border-b border-bg-tertiary px-4 py-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                    <Flag className="h-4 w-4 text-red-400" />
                    유저 신고
                  </h3>
                  <button
                    type="button"
                    onClick={() => setReportOpen(false)}
                    className="rounded p-1 text-text-tertiary hover:bg-bg-elevated"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {reportSuccess ? (
                  /* 신고 완료 */
                  <div className="p-6 text-center">
                    <p className="mb-1 text-sm font-medium text-text-primary">신고가 접수되었습니다</p>
                    <p className="mb-4 text-xs text-text-tertiary">운영팀이 검토 후 조치할 예정입니다.</p>
                    <button
                      type="button"
                      onClick={() => setReportOpen(false)}
                      className="rounded-lg bg-accent-primary px-4 py-2 text-sm text-white hover:bg-accent-hover"
                    >
                      확인
                    </button>
                  </div>
                ) : (
                  /* 신고 폼 */
                  <div className="space-y-4 p-4">
                    {/* 신고 대상 */}
                    <div className="rounded-lg bg-bg-tertiary p-3">
                      <p className="text-xs text-text-tertiary">신고 대상</p>
                      <p className="mt-0.5 truncate text-sm font-medium text-text-secondary">
                        {riot ? riot.gameName : profile.username}
                      </p>
                    </div>

                    {/* 사유 선택 */}
                    <div>
                      <label className="mb-1.5 block text-xs text-text-tertiary">신고 사유</label>
                      <div className="space-y-1.5">
                        {REPORT_REASONS.map((r) => (
                          <label key={r.value} className="group/r flex cursor-pointer items-center gap-2">
                            <input
                              type="radio"
                              name="userReportReason"
                              value={r.value}
                              checked={reportReason === r.value}
                              onChange={() => setReportReason(r.value)}
                              className="accent-accent-primary"
                            />
                            <span className="text-sm text-text-secondary group-hover/r:text-text-primary">{r.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* 상세 설명 */}
                    <div>
                      <label className="mb-1.5 block text-xs text-text-tertiary">
                        상세 설명 <span className="text-red-400">*</span>
                      </label>
                      <textarea
                        value={reportDescription}
                        onChange={(e) => setReportDescription(e.target.value)}
                        placeholder="신고 내용을 구체적으로 작성해주세요."
                        maxLength={1000}
                        rows={3}
                        className="w-full resize-none rounded-lg border border-bg-elevated bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary"
                      />
                      <p className="mt-1 text-right text-xs text-text-tertiary">{reportDescription.length}/1000</p>
                    </div>

                    {reportError && <p className="text-xs text-red-400">{reportError}</p>}

                    {/* 버튼 */}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setReportOpen(false)}
                        className="rounded-lg bg-bg-tertiary px-3 py-2 text-sm text-text-secondary hover:text-text-primary"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={handleSubmitReport}
                        disabled={isSubmittingReport || !reportDescription.trim()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-sm text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSubmittingReport && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {isSubmittingReport ? "신고 중..." : "신고하기"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
