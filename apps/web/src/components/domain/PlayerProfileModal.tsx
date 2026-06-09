"use client";

import Image from "next/image";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Users, Flag, X, Loader2 } from "lucide-react";
import { TierBadge } from "@/components/domain/TierBadge";
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

function RepBar({ label, value }: { label: string; value: number }) {
  const safeValue = Math.max(0, Math.min(5, value || 0));
  return (
    <div className="flex items-center gap-3">
      <span className="w-10 text-xs text-text-secondary">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-secondary">
        <div className="h-full rounded-full bg-accent-primary" style={{ width: `${(safeValue / 5) * 100}%` }} />
      </div>
      <span className="w-8 text-right text-xs font-semibold text-text-primary">{safeValue.toFixed(1)}</span>
    </div>
  );
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

            {/* 본인 프로필이 아닐 때만 신고 버튼 노출 */}
            {!isMe && (
              <button
                type="button"
                onClick={openReport}
                title="이 유저 신고"
                className="mb-2 inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-bg-tertiary bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-tertiary transition-colors hover:border-red-500/40 hover:text-red-400"
              >
                <Flag className="h-3.5 w-3.5" />
                신고
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <SummaryChip label="전적" value={`${stats?.wins ?? 0}승 ${stats?.losses ?? 0}패`} />
            <SummaryChip label="승률" value={`${Math.round(stats?.winRate ?? 0)}%`} />
            <SummaryChip label="신뢰도" value={`${(rep?.overallAverage ?? 0).toFixed(1)} / 5`} />
            <SummaryChip label="피크 티어" value={formatPeakTier(riot)} />
          </div>

          <section className="rounded-lg bg-bg-tertiary p-3">
            <h3 className="mb-3 text-sm font-bold text-text-primary">신뢰도 세부</h3>
            <div className="space-y-2">
              <RepBar label="실력" value={rep?.averageSkill ?? 0} />
              <RepBar label="태도" value={rep?.averageAttitude ?? 0} />
              <RepBar label="소통" value={rep?.averageCommunication ?? 0} />
            </div>
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
