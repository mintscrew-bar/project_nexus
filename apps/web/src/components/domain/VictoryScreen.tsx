"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useMemo } from "react";
import { Trophy, Crown, ArrowRight, LogOut, Swords, Medal } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui";
import { roomApi } from "@/lib/api-client";

interface TeamStanding {
  teamId: string;
  teamName: string;
  wins: number;
  losses: number;
}

interface TeamMember {
  id: string;
  username: string;
}

interface VictoryScreenProps {
  standings: TeamStanding[];
  roomId: string;
  onClose?: () => void;
  autoRedirectSeconds?: number;
}

function generateParticles(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 2.5,
    duration: 2.5 + Math.random() * 3,
    size: 5 + Math.random() * 7,
    color: ["#c89b3c", "#0bc4e2", "#00c853", "#ffa726", "#ffffff", "#a855f7"][
      Math.floor(Math.random() * 6)
    ],
    rotation: Math.random() * 360,
  }));
}

const RANK_STYLES = [
  {
    icon: Crown,
    iconClass: "w-4 h-4",
    badgeBg: "bg-accent-gold/20",
    textColor: "text-accent-gold",
    rankTextColor: "text-accent-gold",
    rowBg: "bg-gradient-to-r from-accent-gold/10 via-accent-gold/5 to-transparent border-accent-gold/35",
    memberChip: "bg-accent-gold/12 text-accent-gold/80 border border-accent-gold/20",
    label: "1등",
  },
  {
    icon: Medal,
    iconClass: "w-4 h-4",
    badgeBg: "bg-gray-400/15",
    textColor: "text-gray-300",
    rankTextColor: "text-gray-300",
    rowBg: "bg-gray-400/8 border-gray-500/25",
    memberChip: "bg-bg-elevated text-text-secondary",
    label: "2등",
  },
  {
    icon: Medal,
    iconClass: "w-4 h-4",
    badgeBg: "bg-orange-500/15",
    textColor: "text-orange-400",
    rankTextColor: "text-orange-400",
    rowBg: "bg-orange-500/8 border-orange-500/25",
    memberChip: "bg-bg-elevated text-text-secondary",
    label: "3등",
  },
];

const DEFAULT_RANK_STYLE = {
  icon: null,
  iconClass: "",
  badgeBg: "bg-bg-elevated",
  textColor: "text-text-tertiary",
  rankTextColor: "text-text-secondary",
  rowBg: "bg-bg-tertiary/30 border-bg-elevated/80",
  memberChip: "bg-bg-elevated text-text-tertiary",
  label: "",
};

export function VictoryScreen({
  standings,
  roomId,
  onClose,
  autoRedirectSeconds = 30,
}: VictoryScreenProps) {
  const router = useRouter();
  const [countdown, setCountdown] = useState(autoRedirectSeconds);
  const [isReturning, setIsReturning] = useState(false);
  const [teamMembers, setTeamMembers] = useState<Record<string, TeamMember[]>>({});
  const hasNavigated = useRef(false);
  const particles = useMemo(() => generateParticles(50), []);
  const lobbyUrl = `/tournaments/${roomId}/lobby`;

  // 방 데이터에서 팀 멤버 조회
  useEffect(() => {
    roomApi.getRoom(roomId)
      .then((room: any) => {
        const memberMap: Record<string, TeamMember[]> = {};

        // teams 배열에서 직접 멤버 추출
        if (room.teams?.length > 0) {
          for (const team of room.teams) {
            if (!team.id) continue;
            const members: TeamMember[] = (team.members ?? [])
              .map((m: any) => ({
                id: m.userId ?? m.user?.id ?? m.id,
                username: m.user?.username ?? m.username,
              }))
              .filter((m: TeamMember) => m.username);
            if (members.length > 0) {
              memberMap[team.id] = members;
            }
          }
        }

        // teams가 없으면 participants의 teamId로 그룹화
        if (Object.keys(memberMap).length === 0 && room.participants?.length > 0) {
          for (const p of room.participants) {
            if (!p.teamId || !p.username) continue;
            if (!memberMap[p.teamId]) memberMap[p.teamId] = [];
            memberMap[p.teamId].push({ id: p.userId, username: p.username });
          }
        }

        setTeamMembers(memberMap);
      })
      .catch(() => {});
  }, [roomId]);

  const navigateToLobby = async () => {
    if (hasNavigated.current || isReturning) return;
    hasNavigated.current = true;
    setIsReturning(true);
    try {
      await roomApi.returnToLobby(roomId);
    } catch {
      // 이미 리셋됐거나 WAITING 상태이면 무시
    }
    onClose?.();
    router.push(lobbyUrl);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigateToLobby();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const winner = standings[0];
  const progress = countdown / autoRedirectSeconds;
  const totalGamesInTournament = standings.reduce((acc, s) => acc + s.wins, 0);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4"
      >
        {/* 컨페티 */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{ y: -30, x: `${p.x}vw`, opacity: 1, rotate: 0 }}
              animate={{ y: "110vh", opacity: [1, 1, 0], rotate: p.rotation * 3 }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                repeat: Infinity,
                ease: "linear",
              }}
              className="absolute rounded-sm"
              style={{ width: p.size, height: p.size * 0.6, backgroundColor: p.color }}
            />
          ))}
        </div>

        {/* 메인 카드 */}
        <motion.div
          initial={{ scale: 0.88, opacity: 0, y: 24 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="relative bg-bg-secondary border border-bg-tertiary rounded-2xl w-full max-w-2xl shadow-[0_32px_80px_rgba(0,0,0,0.6)] overflow-hidden max-h-[92vh] flex flex-col"
        >
          {/* 상단 골드 라인 */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent-gold to-transparent" />

          {/* 스크롤 가능한 본문 */}
          <div className="overflow-y-auto flex-1 scrollbar-thin">

            {/* ── 헤더 ── */}
            <div className="px-8 pt-8 pb-4 text-center">
              <motion.div
                initial={{ scale: 0, rotate: -15 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 180, damping: 11 }}
                className="flex justify-center mb-4"
              >
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-accent-gold/15 border border-accent-gold/30 flex items-center justify-center">
                    <Trophy className="w-8 h-8 text-accent-gold" />
                  </div>
                  <div className="absolute inset-0 rounded-full bg-accent-gold/8 animate-ping" />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                <p className="text-xs font-bold text-accent-gold/70 uppercase tracking-[0.2em] mb-1">
                  Tournament Complete
                </p>
                <h1 className="text-2xl font-extrabold text-text-primary">
                  토너먼트 종료
                </h1>
                {totalGamesInTournament > 0 && (
                  <p className="text-sm text-text-secondary mt-1">
                    총 {totalGamesInTournament}경기 · {standings.length}팀 참가
                  </p>
                )}
              </motion.div>
            </div>

            {/* ── 우승팀 하이라이트 ── */}
            {winner && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="mx-6 mb-5"
              >
                <div className="relative rounded-xl overflow-hidden border border-accent-gold/30">
                  {/* 배경 그라디언트 */}
                  <div className="absolute inset-0 bg-gradient-to-br from-accent-gold/15 via-accent-gold/8 to-transparent" />
                  <div className="absolute inset-0 bg-gradient-to-t from-bg-secondary/50 to-transparent" />

                  <div className="relative px-6 py-5">
                    <div className="flex items-center justify-center gap-2 mb-3">
                      <Crown className="w-4 h-4 text-accent-gold" />
                      <span className="text-[10px] font-extrabold text-accent-gold/75 uppercase tracking-[0.25em]">
                        Champion
                      </span>
                      <Crown className="w-4 h-4 text-accent-gold" />
                    </div>
                    <div className="flex justify-center mb-1">
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-accent-gold/20 border border-accent-gold/35 text-accent-gold text-sm font-black tracking-wide">
                        🏆 1등
                      </span>
                    </div>

                    <h2 className="text-3xl font-black text-center bg-gradient-to-r from-yellow-300 via-accent-gold to-yellow-400 bg-clip-text text-transparent mb-2 tracking-tight">
                      {winner.teamName}
                    </h2>

                    <div className="flex items-center justify-center gap-3 mb-4 text-sm">
                      <span className="text-accent-success font-bold text-base">
                        {winner.wins}승
                      </span>
                      <span className="w-px h-4 bg-text-muted/30" />
                      <span className="text-accent-danger font-semibold">
                        {winner.losses}패
                      </span>
                      {winner.wins + winner.losses > 0 && (
                        <>
                          <span className="w-px h-4 bg-text-muted/30" />
                          <span className="text-text-secondary">
                            승률{" "}
                            <span className="text-accent-success font-semibold">
                              {Math.round((winner.wins / (winner.wins + winner.losses)) * 100)}%
                            </span>
                          </span>
                        </>
                      )}
                    </div>

                    {/* 우승팀 멤버 */}
                    {teamMembers[winner.teamId]?.length > 0 ? (
                      <div className="flex flex-wrap justify-center gap-1.5">
                        {teamMembers[winner.teamId].map((m) => (
                          <span
                            key={m.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent-gold/15 border border-accent-gold/25 text-accent-gold text-xs font-semibold"
                          >
                            {m.username}
                          </span>
                        ))}
                      </div>
                    ) : (
                      /* 멤버 로딩 중 스켈레톤 */
                      <div className="flex justify-center gap-1.5">
                        {[5, 4, 6, 5, 4].map((w, i) => (
                          <div
                            key={i}
                            className={`h-6 w-${w * 2} rounded-full bg-accent-gold/10 animate-pulse`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── 최종 순위 ── */}
            <div className="px-6 pb-6">
              <div className="flex items-center gap-2 mb-3">
                <Swords className="w-3.5 h-3.5 text-text-tertiary" />
                <h3 className="text-[10px] font-extrabold text-text-tertiary uppercase tracking-[0.2em]">
                  최종 순위
                </h3>
              </div>

              <div className="space-y-2">
                {standings.map((team, idx) => {
                  const style = RANK_STYLES[idx] ?? DEFAULT_RANK_STYLE;
                  const RankIcon = style.icon;
                  const members = teamMembers[team.teamId] ?? [];
                  const total = team.wins + team.losses;
                  const winRate = total > 0 ? (team.wins / total) * 100 : 0;

                  return (
                    <motion.div
                      key={team.teamId}
                      initial={{ opacity: 0, x: -14 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.45 + idx * 0.07 }}
                      className={`rounded-xl border overflow-hidden ${style.rowBg}`}
                    >
                      {/* 팀 헤더 행 */}
                      <div className="flex items-center gap-3 px-4 py-3">
                        {/* 순위 배지: 아이콘 + 등수 텍스트 */}
                        <div className="flex-shrink-0 flex items-center gap-1.5 min-w-[3.5rem]">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center ${style.badgeBg} ${style.textColor}`}
                          >
                            {RankIcon ? (
                              <RankIcon className={style.iconClass} />
                            ) : (
                              <span className="text-xs font-black">{idx + 1}</span>
                            )}
                          </div>
                          <span className={`text-sm font-black tabular-nums ${style.rankTextColor}`}>
                            {style.label || `${idx + 1}등`}
                          </span>
                        </div>

                        {/* 팀명 */}
                        <span className={`flex-1 font-bold text-sm truncate ${style.textColor}`}>
                          {team.teamName}
                        </span>

                        {/* 승률 바 + 전적 */}
                        <div className="flex items-center gap-3 flex-shrink-0">
                          {total > 0 && (
                            <div className="hidden sm:flex items-center w-20">
                              <div className="flex-1 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-accent-success transition-all duration-700"
                                  style={{ width: `${winRate}%` }}
                                />
                              </div>
                            </div>
                          )}
                          <div className="flex items-center gap-1 text-xs font-mono">
                            <span className="text-accent-success font-bold">{team.wins}W</span>
                            <span className="text-text-muted">·</span>
                            <span className="text-accent-danger">{team.losses}L</span>
                          </div>
                        </div>
                      </div>

                      {/* 멤버 행 */}
                      {members.length > 0 && (
                        <div className="px-4 pb-2.5 flex flex-wrap gap-1.5">
                          {members.map((m) => (
                            <span
                              key={m.id}
                              className={`text-[11px] px-2 py-0.5 rounded-full ${style.memberChip}`}
                            >
                              {m.username}
                            </span>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── 푸터 (고정) ── */}
          <div className="flex-shrink-0 border-t border-bg-tertiary bg-bg-secondary px-6 py-4">
            {/* 카운트다운 바 */}
            <div className="mb-3.5">
              <div className="flex items-center justify-between text-xs text-text-tertiary mb-1.5">
                <span>자동으로 로비로 이동</span>
                <span className="font-mono tabular-nums">{countdown}초</span>
              </div>
              <div className="w-full h-1 bg-bg-tertiary rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-accent-primary rounded-full"
                  initial={{ width: "100%" }}
                  animate={{ width: `${progress * 100}%` }}
                  transition={{ duration: 0.9, ease: "linear" }}
                />
              </div>
            </div>

            {/* 버튼 */}
            <div className="flex gap-3">
              <Button
                onClick={navigateToLobby}
                variant="primary"
                size="md"
                fullWidth
                isLoading={isReturning}
                className="gap-2"
              >
                로비로 돌아가기
                {!isReturning && <ArrowRight className="w-4 h-4" />}
              </Button>
              <Button
                onClick={() => router.push("/tournaments")}
                variant="ghost"
                size="md"
                className="shrink-0 gap-2"
              >
                <LogOut className="w-4 h-4" />
                나가기
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
