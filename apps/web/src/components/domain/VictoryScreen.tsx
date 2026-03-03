"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useMemo } from "react";
import { Trophy, Medal, Crown, ArrowRight, LogOut } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui";
import { roomApi } from "@/lib/api-client";

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
}

// 컨페티 파티클 데이터 생성
function generateParticles(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 2,
    duration: 2 + Math.random() * 3,
    size: 4 + Math.random() * 6,
    color: ["#0bc4e2", "#c89b3c", "#00c853", "#ffa726", "#f0f0f0"][
      Math.floor(Math.random() * 5)
    ],
  }));
}

export function VictoryScreen({
  standings,
  roomId,
  onClose,
  autoRedirectSeconds = 30,
}: VictoryScreenProps) {
  const router = useRouter();
  const [countdown, setCountdown] = useState(autoRedirectSeconds);
  const [isReturning, setIsReturning] = useState(false);
  const lobbyUrl = `/tournaments/${roomId}/lobby`;
  const hasNavigated = useRef(false);

  // 컨페티 파티클 (첫 렌더 시 한 번만 생성)
  const particles = useMemo(() => generateParticles(30), []);

  // 방 상태를 WAITING으로 리셋한 뒤 로비로 이동하는 공통 함수
  const navigateToLobby = async () => {
    if (hasNavigated.current || isReturning) return;
    hasNavigated.current = true;
    setIsReturning(true);
    try {
      await roomApi.returnToLobby(roomId);
    } catch (err) {
      // 다른 유저가 먼저 리셋했거나, 이미 WAITING인 경우 무시
      console.warn(
        "[VictoryScreen] returnToLobby failed (may already be reset):",
        err
      );
    }
    if (onClose) onClose();
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
  }, [router, lobbyUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const winner = standings[0];

  // 순위별 메달 스타일
  const getRankStyle = (index: number) => {
    switch (index) {
      case 0:
        return {
          icon: <Crown className="w-5 h-5" />,
          color: "text-accent-gold",
          bg: "bg-accent-gold/10 border-accent-gold/40",
          label: "1st",
        };
      case 1:
        return {
          icon: <Medal className="w-5 h-5" />,
          color: "text-gray-300",
          bg: "bg-gray-400/10 border-gray-400/30",
          label: "2nd",
        };
      case 2:
        return {
          icon: <Medal className="w-4 h-4" />,
          color: "text-orange-400",
          bg: "bg-orange-500/10 border-orange-500/30",
          label: "3rd",
        };
      default:
        return {
          icon: null,
          color: "text-text-tertiary",
          bg: "bg-bg-tertiary border-bg-elevated",
          label: `${index + 1}th`,
        };
    }
  };

  // 카운트다운 진행률
  const progress = countdown / autoRedirectSeconds;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50"
      >
        {/* 컨페티 파티클 배경 */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{ y: -20, x: `${p.x}vw`, opacity: 1 }}
              animate={{ y: "110vh", opacity: 0 }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                repeat: Infinity,
                ease: "linear",
              }}
              className="absolute rounded-full"
              style={{
                width: p.size,
                height: p.size,
                backgroundColor: p.color,
              }}
            />
          ))}
        </div>

        {/* 메인 카드 */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative bg-bg-secondary border border-bg-tertiary rounded-xl max-w-xl w-full mx-4 shadow-2xl overflow-hidden"
        >
          {/* 상단 골드 글로우 라인 */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-accent-gold to-transparent" />

          {/* 헤더 영역 */}
          <div className="relative px-6 pt-8 pb-6">
            {/* 트로피 아이콘 */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                delay: 0.2,
                type: "spring",
                stiffness: 200,
                damping: 12,
              }}
              className="flex justify-center mb-4"
            >
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-accent-gold/15 border border-accent-gold/30 flex items-center justify-center">
                  <Trophy className="w-8 h-8 text-accent-gold" />
                </div>
                {/* 글로우 이펙트 */}
                <div className="absolute inset-0 w-16 h-16 rounded-full bg-accent-gold/10 animate-ping" />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-center"
            >
              <h1 className="text-2xl font-bold text-text-primary mb-1">
                토너먼트 종료
              </h1>
              <p className="text-sm text-text-secondary">
                모든 경기가 완료되었습니다
              </p>
            </motion.div>
          </div>

          {/* 우승팀 하이라이트 */}
          {winner && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mx-6 mb-5"
            >
              <div className="relative bg-gradient-to-b from-accent-gold/10 to-transparent border border-accent-gold/25 rounded-lg p-5 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Crown className="w-5 h-5 text-accent-gold" />
                  <span className="text-xs font-semibold text-accent-gold/80 uppercase tracking-wider">
                    Champion
                  </span>
                  <Crown className="w-5 h-5 text-accent-gold" />
                </div>
                <h2 className="text-2xl font-bold bg-gradient-to-r from-accent-gold to-accent-primary bg-clip-text text-transparent">
                  {winner.teamName}
                </h2>
                <p className="text-sm text-text-secondary mt-1">
                  <span className="text-accent-success font-semibold">
                    {winner.wins}승
                  </span>
                  <span className="mx-1 text-text-muted">/</span>
                  <span className="text-accent-danger font-semibold">
                    {winner.losses}패
                  </span>
                </p>
              </div>
            </motion.div>
          )}

          {/* 최종 순위 */}
          <div className="px-6 mb-5">
            <h3 className="text-sm font-semibold text-text-tertiary uppercase tracking-wider mb-3">
              최종 순위
            </h3>
            <div className="space-y-2">
              {standings.map((team, index) => {
                const rank = getRankStyle(index);
                return (
                  <motion.div
                    key={team.teamId}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + index * 0.08 }}
                    className={`flex items-center justify-between px-4 py-3 rounded-lg border transition-all ${rank.bg}`}
                  >
                    <div className="flex items-center gap-3">
                      {/* 순위 뱃지 */}
                      <div
                        className={`flex items-center justify-center w-8 h-8 rounded-full ${
                          index === 0
                            ? "bg-accent-gold/20"
                            : "bg-bg-tertiary"
                        } ${rank.color}`}
                      >
                        {rank.icon || (
                          <span className="text-xs font-bold">
                            {rank.label}
                          </span>
                        )}
                      </div>
                      {/* 팀 정보 */}
                      <div>
                        <span
                          className={`font-semibold ${
                            index === 0
                              ? "text-accent-gold"
                              : "text-text-primary"
                          }`}
                        >
                          {team.teamName}
                        </span>
                      </div>
                    </div>
                    {/* 전적 */}
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-accent-success font-mono font-semibold">
                        {team.wins}W
                      </span>
                      <span className="text-text-muted">-</span>
                      <span className="text-accent-danger font-mono font-semibold">
                        {team.losses}L
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* 하단 액션 영역 */}
          <div className="border-t border-bg-tertiary px-6 py-5">
            {/* 카운트다운 프로그레스 */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-text-tertiary mb-2">
                <span>자동 로비 이동</span>
                <span className="font-mono">{countdown}초</span>
              </div>
              <div className="w-full h-1 bg-bg-tertiary rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-accent-primary rounded-full"
                  initial={{ width: "100%" }}
                  animate={{ width: `${progress * 100}%` }}
                  transition={{ duration: 0.8, ease: "linear" }}
                />
              </div>
            </div>

            {/* 버튼들 */}
            <div className="flex gap-3">
              <Button
                onClick={() => navigateToLobby()}
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
