"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import Image from "next/image";
import { Trophy, Crown, ArrowRight, LogOut, Users } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui";
import { TierBadge } from "@/components/domain/TierBadge";
import { PlayerHoverCard } from "@/components/domain/PlayerHoverCard";
import { PositionIcon } from "@/app/tournaments/[id]/lobby/_components/icons";
import { roomApi } from "@/lib/api-client";

interface TeamMember {
  id: string;
  userId?: string | null;
  username: string;
  avatar?: string | null;
  assignedRole?: string | null;
  gameName?: string | null;
  tagLine?: string | null;
  tier?: string | null;
  rank?: string | null;
  peakTier?: string | null;
  peakRank?: string | null;
  mainRole?: string | null;
  subRole?: string | null;
  championPreferences?: Array<{
    role: string;
    championId: string;
    order: number;
  }>;
}

interface TeamStanding {
  teamId: string;
  teamName: string;
  wins: number;
  losses: number;
}

interface VictoryScreenProps {
  standings: TeamStanding[];
  roomId: string;
  onClose?: () => void;
  autoRedirectSeconds?: number;
  preloadedMembers?: Record<string, TeamMember[]>;
}

const ROLE_ORDER = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];

const RANK_COLORS = [
  "text-accent-gold",
  "text-gray-400",
  "text-orange-400",
];

function toHoverParticipant(member: TeamMember) {
  return {
    id: member.id,
    userId: member.userId ?? member.id,
    username: member.username,
    avatar: member.avatar ?? null,
    riotAccount: member.gameName ? {
      gameName: member.gameName,
      tagLine: member.tagLine,
      tier: member.tier,
      rank: member.rank,
      peakTier: member.peakTier,
      peakRank: member.peakRank,
      mainRole: member.mainRole ?? member.assignedRole,
      subRole: member.subRole,
      championPreferences: member.championPreferences ?? [],
    } : null,
  };
}

function MemberRow({
  member,
  onHover,
  onHoverEnd,
}: {
  member: TeamMember;
  onHover: (member: TeamMember, rect: DOMRect) => void;
  onHoverEnd: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const displayName = member.gameName ?? member.username;
  const tagLine = member.tagLine;

  const handleMouseEnter = () => {
    if (!rowRef.current) return;
    onHover(member, rowRef.current.getBoundingClientRect());
  };

  return (
    <div
      ref={rowRef}
      className="group flex items-center gap-3 rounded-lg bg-bg-tertiary p-3 transition-colors hover:bg-bg-elevated xl:gap-2 xl:p-2"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onHoverEnd}
    >
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-bg-elevated xl:h-8 xl:w-8">
        {member.avatar ? (
          <Image src={member.avatar} alt={member.username} fill className="object-cover" unoptimized />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Users className="h-5 w-5 text-text-tertiary xl:h-4 xl:w-4" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-text-primary xl:text-xs">{displayName}</span>
          {tagLine && <span className="shrink-0 text-xs text-text-tertiary xl:text-[10px]">#{tagLine}</span>}
          {member.tier && (
            <TierBadge
              tier={member.tier}
              rank={member.rank ?? undefined}
              size="sm"
              showIcon={false}
              className="shrink-0"
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          {member.gameName && (
            <span className="truncate text-[11px] text-text-tertiary xl:text-[10px]">{member.username}</span>
          )}
          {member.assignedRole && (
            <PositionIcon position={member.assignedRole} className="!h-4 !w-4 xl:!h-3.5 xl:!w-3.5" opacity={0.75} />
          )}
        </div>
      </div>
    </div>
  );
}

export function VictoryScreen({
  standings,
  roomId,
  onClose,
  autoRedirectSeconds = 30,
  preloadedMembers,
}: VictoryScreenProps) {
  const router = useRouter();
  const [countdown, setCountdown] = useState(autoRedirectSeconds);
  const [isReturning, setIsReturning] = useState(false);
  const [teamMembers, setTeamMembers] = useState<Record<string, TeamMember[]>>(preloadedMembers ?? {});
  const [hoveredPlayer, setHoveredPlayer] = useState<{ id: string; rect: DOMRect; participant: any } | null>(null);
  const hasNavigated = useRef(false);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHoverClose = useCallback(() => {
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = setTimeout(() => setHoveredPlayer(null), 80);
  }, []);

  const cancelHoverClose = useCallback(() => {
    if (!hoverCloseTimer.current) return;
    clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = null;
  }, []);

  const showMemberHover = useCallback((member: TeamMember, rect: DOMRect) => {
    cancelHoverClose();
    setHoveredPlayer({
      id: member.userId ?? member.id,
      rect,
      participant: toHoverParticipant(member),
    });
  }, [cancelHoverClose]);

  useEffect(() => {
    if (preloadedMembers) return;
    roomApi.getRoom(roomId)
      .then((room: any) => {
        const map: Record<string, TeamMember[]> = {};
        if (room.teams?.length > 0) {
          for (const team of room.teams) {
            if (!team.id) continue;
            const riot = (m: any) => m.user?.riotAccounts?.[0];
            const members: TeamMember[] = (team.members ?? [])
              .map((m: any) => ({
                id: m.userId ?? m.user?.id ?? m.id,
                userId: m.userId ?? m.user?.id ?? null,
                username: m.user?.username ?? m.username,
                avatar: m.user?.avatar ?? null,
                assignedRole: m.assignedRole ?? null,
                gameName: riot(m)?.gameName ?? null,
                tagLine: riot(m)?.tagLine ?? null,
                tier: riot(m)?.tier ?? null,
                rank: riot(m)?.rank ?? null,
                peakTier: riot(m)?.peakTier ?? null,
                peakRank: riot(m)?.peakRank ?? null,
                mainRole: riot(m)?.mainRole ?? null,
                subRole: riot(m)?.subRole ?? null,
                championPreferences: riot(m)?.championPreferences ?? [],
              }))
              .filter((m: TeamMember) => m.username)
              .sort((a: TeamMember, b: TeamMember) => {
                const ai = ROLE_ORDER.indexOf(a.assignedRole ?? "");
                const bi = ROLE_ORDER.indexOf(b.assignedRole ?? "");
                return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
              });
            if (members.length > 0) map[team.id] = members;
          }
        }
        setTeamMembers(map);
      })
      .catch(() => {});
  }, [roomId, preloadedMembers]);

  const navigateToLobby = async () => {
    if (hasNavigated.current || isReturning) return;
    hasNavigated.current = true;
    setIsReturning(true);
    try { await roomApi.returnToLobby(roomId); } catch { /* 무시 — 호스트만 가능, 비호스트는 그냥 이동 */ }
    onClose?.();
    router.push(`/tournaments/${roomId}/lobby`);
  };

  const handleExit = async () => {
    if (hasNavigated.current) return;
    hasNavigated.current = true;
    try { await roomApi.leaveRoom(roomId); } catch { /* 무시 */ }
    router.push("/tournaments");
  };

  useEffect(() => {
    const t = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(t); navigateToLobby(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    };
  }, []);

  const winner = standings[0];
  const winnerMembers = winner ? (teamMembers[winner.teamId] ?? []) : [];
  const totalGames = standings.reduce((a, s) => a + s.wins, 0);
  const winnerRate = winner && winner.wins + winner.losses > 0
    ? Math.round((winner.wins / (winner.wins + winner.losses)) * 100)
    : null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      >
        {hoveredPlayer && (
          <PlayerHoverCard
            participant={hoveredPlayer.participant}
            anchorRect={hoveredPlayer.rect}
            onOpenProfile={(userId) => {
              setHoveredPlayer(null);
              router.push(`/users/${userId}`);
            }}
            onMouseEnter={cancelHoverClose}
            onMouseLeave={scheduleHoverClose}
          />
        )}

        {/* 결과 발표 임팩트 */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <motion.div
            className="absolute left-1/2 top-[34%] h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent-gold/35"
            initial={{ scale: 0.55, opacity: 0 }}
            animate={{ scale: [0.55, 1.18, 1.04], opacity: [0, 0.55, 0] }}
            transition={{ duration: 1.35, ease: [0.16, 1, 0.3, 1] }}
          />
          <motion.div
            className="absolute left-1/2 top-[34%] h-[760px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent-gold/18"
            initial={{ scale: 0.45, opacity: 0 }}
            animate={{ scale: [0.45, 1.08], opacity: [0, 0.32, 0] }}
            transition={{ duration: 1.6, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          />
          <motion.div
            className="absolute left-1/2 top-[34%] h-[360px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-gold/12 blur-3xl"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: [0, 0.45, 0.18], scale: [0.7, 1.05, 1] }}
            transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
          />
          <motion.div
            className="absolute left-1/2 top-[34%] h-px w-[760px] -translate-x-1/2 bg-gradient-to-r from-transparent via-accent-gold/50 to-transparent"
            initial={{ opacity: 0, scaleX: 0.2 }}
            animate={{ opacity: [0, 0.75, 0.18], scaleX: [0.2, 1, 1] }}
            transition={{ duration: 1.1, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>

        {/* 메인 패널 */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex max-h-[94vh] w-full max-w-[96vw] flex-col overflow-hidden rounded-2xl bg-[#0f1117] shadow-[0_40px_120px_rgba(0,0,0,0.85)] 2xl:max-w-[1500px]"
        >
          {/* 스크롤 영역 */}
          <div className="victory-scroll flex-1 overflow-y-auto">

            {/* ── 헤더 ── */}
            <div className="flex flex-col items-center px-8 pb-3 pt-5 text-center xl:pb-2 xl:pt-4">
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 12 }}
                className="relative mb-4"
              >
                <div className="absolute inset-0 scale-[2.3] rounded-full bg-accent-gold/20 blur-2xl" />
                <Trophy className="relative h-10 w-10 text-accent-gold drop-shadow-[0_0_12px_rgba(200,155,60,0.6)] xl:h-9 xl:w-9" />
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
                <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.3em] text-accent-gold/50">
                  Tournament Complete
                </p>
                <h1 className="text-lg font-extrabold text-white xl:text-base">토너먼트 종료</h1>
                {totalGames > 0 && (
                  <p className="mt-1 text-xs text-white/30">총 {totalGames}경기 · {standings.length}팀 참가</p>
                )}
              </motion.div>
            </div>

            <div className="mx-8 h-px bg-bg-tertiary" />

            {/* ── 우승팀 ── */}
            {winner && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.26 }}
                className="px-8 py-10 text-center xl:py-8"
              >
                <div className="mx-auto max-w-6xl">
                  <div className="mb-3 flex items-center justify-center gap-2">
                    <Crown className="h-5 w-5 text-accent-gold" />
                    <span className="text-[11px] font-black uppercase tracking-[0.24em] text-accent-gold/55">
                      Champion
                    </span>
                  </div>

                  <h2 className="text-6xl font-black tracking-tight text-white xl:text-7xl">
                    {winner.teamName}
                  </h2>

                  <div className="mx-auto mt-5 h-px w-48 bg-gradient-to-r from-transparent via-accent-gold/55 to-transparent" />

                  <div className="mt-5 flex items-center justify-center gap-4 text-base">
                    <span className="font-semibold text-emerald-400">{winner.wins}승</span>
                    <span className="text-text-muted">·</span>
                    <span className="font-semibold text-red-400">{winner.losses}패</span>
                    {winnerRate !== null && (
                      <>
                        <span className="text-text-muted">·</span>
                        <span className="font-semibold text-text-secondary">승률 {winnerRate}%</span>
                      </>
                    )}
                  </div>

                  {winnerMembers.length > 0 && (
                    <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                      {winnerMembers.map((m) => (
                        <span key={m.id} className="text-base font-medium text-white/45">
                          {m.gameName ?? m.username}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            <div className="mx-8 h-px bg-bg-tertiary" />

            {/* ── 최종 순위 — 팀 카드 그리드 ── */}
            <div className="px-6 pb-6 pt-5 xl:px-5 xl:pt-4">
              <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-white/20 xl:mb-3">최종 순위</p>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4 xl:gap-3">
                {standings.map((team, idx) => {
                  const rankColor = RANK_COLORS[idx] ?? "text-white/25";
                  const members = teamMembers[team.teamId] ?? [];

                  return (
                    <motion.div
                      key={team.teamId}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.35 + idx * 0.07 }}
                      className="relative overflow-hidden rounded-xl bg-bg-secondary p-4 shadow-[0_14px_36px_rgba(0,0,0,0.18)] xl:p-3"
                    >
                      {/* 팀 헤더 */}
                      <div className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-bg-tertiary/70 px-3 py-2.5 xl:mb-2 xl:px-2.5 xl:py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          {idx === 0 && <Crown className="h-4 w-4 shrink-0 text-accent-gold" />}
                          <span className={`shrink-0 text-2xl font-black tabular-nums leading-none xl:text-xl ${rankColor}`}>
                            {idx + 1}위
                          </span>
                          <span className={`truncate text-sm font-bold xl:text-xs ${idx === 0 ? "text-text-primary" : "text-text-secondary"}`}>
                            {team.teamName}
                          </span>
                        </div>
                        <span className="shrink-0 font-mono text-[11px] text-text-tertiary xl:text-[10px]">
                          {team.wins}W · {team.losses}L
                        </span>
                      </div>

                      {/* 멤버 카드 목록 */}
                      <div className="space-y-2 xl:space-y-1.5">
                        {members.length > 0 ? members.map((m) => (
                          <MemberRow
                            key={m.id}
                            member={m}
                            onHover={showMemberHover}
                            onHoverEnd={scheduleHoverClose}
                          />
                        )) : (
                          Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3 rounded-lg bg-bg-tertiary p-3">
                              <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-bg-elevated" />
                              <div className="h-3 w-3/4 animate-pulse rounded bg-bg-elevated" />
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* ── 푸터 ── */}
          <div className="shrink-0 bg-[#0f1117] px-6 py-4 shadow-[0_-18px_35px_rgba(0,0,0,0.35)]">
            <div className="mb-3">
              <div className="mb-1.5 flex items-center justify-between text-[11px] text-white/25">
                <span>자동 로비 이동</span>
                <span className="font-mono tabular-nums">{countdown}초</span>
              </div>
              <div className="h-0.5 w-full overflow-hidden rounded-full bg-white/6">
                <motion.div
                  className="h-full rounded-full bg-accent-primary"
                  animate={{ width: `${(countdown / autoRedirectSeconds) * 100}%` }}
                  transition={{ duration: 0.9, ease: "linear" }}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={navigateToLobby} variant="primary" size="md" fullWidth isLoading={isReturning} className="gap-2">
                로비로 돌아가기
                {!isReturning && <ArrowRight className="h-4 w-4" />}
              </Button>
              <Button onClick={handleExit} variant="ghost" size="md" className="shrink-0 gap-1.5 text-white/40 hover:text-white/70">
                <LogOut className="h-4 w-4" />
                나가기
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
