"use client";

// 가위바위보 진영 결정 흐름 (프레젠테이셔널). 소켓은 부모(MatchDetailModal)가 소유하고,
// 이 컴포넌트는 서버 상태(rps) + 공개 이벤트(reveal)를 props로 받아 렌더한다.
// 규칙: 팀장 1:1 단판, 이긴 팀이 진영 선택권.

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";

export type RpsHand = "rock" | "paper" | "scissors";

export interface RpsStateData {
  phase: "throw" | "side" | "done";
  teamAId: string;
  teamBId: string;
  captainAId: string;
  captainBId: string;
  submitted: string[];
  winnerTeamId: string | null;
  blueSideTeamId: string | null;
}

export interface RpsRevealData {
  handA: RpsHand;
  handB: RpsHand;
  tie: boolean;
  winnerTeamId: string | null;
  seq: number; // 같은 reveal 재생 방지용 시퀀스
}

interface RpsTeam {
  id: string;
  name: string;
  color?: string | null;
}

interface Props {
  rps: RpsStateData;
  reveal: RpsRevealData | null;
  currentUserId?: string;
  teamA: RpsTeam;
  teamB: RpsTeam;
  onSubmit: (hand: RpsHand) => void;
  onChooseSide: (side: "blue" | "red") => void;
}

const HAND: Record<RpsHand, { emoji: string; label: string }> = {
  scissors: { emoji: "✌️", label: "가위" },
  rock: { emoji: "✊", label: "바위" },
  paper: { emoji: "✋", label: "보" },
};
const HANDS: RpsHand[] = ["scissors", "rock", "paper"];
const COUNT_EMOJI = ["✌️", "✊", "✋"];

export function MatchRpsFlow({
  rps,
  reveal,
  currentUserId,
  teamA,
  teamB,
  onSubmit,
  onChooseSide,
}: Props) {
  // 공개 애니메이션 단계: idle(대기) | countdown | revealed | tie
  const [anim, setAnim] = useState<"idle" | "countdown" | "revealed" | "tie">("idle");
  const [count, setCount] = useState(0);
  const lastSeq = useRef<number>(-1);

  // 새 reveal 도착 → 카운트다운 후 공개
  useEffect(() => {
    if (!reveal || reveal.seq === lastSeq.current) return;
    lastSeq.current = reveal.seq;
    setAnim("countdown");
    setCount(0);
    let i = 0;
    const id = setInterval(() => {
      i++;
      if (i >= 3) {
        clearInterval(id);
        setAnim("revealed");
        if (reveal.tie) {
          // 무승부 — 잠깐 표시 후 idle (서버가 throw로 리셋해 새 라운드)
          setTimeout(() => setAnim("tie"), 900);
          setTimeout(() => setAnim("idle"), 2100);
        }
      } else {
        setCount(i);
      }
    }, 550);
    return () => clearInterval(id);
  }, [reveal]);

  const amCaptainA = currentUserId === rps.captainAId;
  const amCaptainB = currentUserId === rps.captainBId;
  const amCaptain = amCaptainA || amCaptainB;
  const submittedA = rps.submitted.includes(rps.captainAId);
  const submittedB = rps.submitted.includes(rps.captainBId);
  const iSubmitted = (amCaptainA && submittedA) || (amCaptainB && submittedB);

  const winnerTeam =
    rps.winnerTeamId === rps.teamAId ? teamA : rps.winnerTeamId === rps.teamBId ? teamB : null;
  const amWinnerCaptain =
    !!rps.winnerTeamId &&
    currentUserId === (rps.winnerTeamId === rps.teamAId ? rps.captainAId : rps.captainBId);

  const showSide = rps.phase === "side" && anim !== "countdown";
  const showDone = rps.phase === "done";

  // 팀장 패널
  const Panel = ({ team, isA }: { team: RpsTeam; isA: boolean }) => {
    const submitted = isA ? submittedA : submittedB;
    const isMe = isA ? amCaptainA : amCaptainB;
    const won =
      (showSide || showDone) && rps.winnerTeamId === team.id;
    const lost =
      (showSide || showDone) && !!rps.winnerTeamId && rps.winnerTeamId !== team.id;
    const hand = anim === "revealed" || anim === "tie" || showSide || showDone
      ? (isA ? reveal?.handA : reveal?.handB)
      : null;
    return (
      <motion.div animate={won ? { scale: 1.04 } : { scale: 1 }}
        className={cn(
          "relative flex-1 rounded-2xl border-2 bg-bg-tertiary/30 p-4 text-center transition-colors",
          won ? "border-accent-gold shadow-[0_0_24px] shadow-accent-gold/25"
            : lost ? "border-bg-tertiary opacity-60" : "border-bg-tertiary",
        )}>
        <AnimatePresence>
          {won && (
            <div className="pointer-events-none absolute bottom-full left-0 right-0 mb-2 flex justify-center">
              <motion.span initial={{ scale: 0, y: 8, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 320, damping: 18 }}>
                <Crown className="h-6 w-6 text-accent-gold" fill="currentColor" fillOpacity={0.18} />
              </motion.span>
            </div>
          )}
        </AnimatePresence>
        <div className="flex items-center justify-center gap-2 mb-1">
          {team.color && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: team.color }} />}
          <span className="font-bold text-text-primary text-sm truncate">{team.name}</span>
          {isMe && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-primary/20 text-accent-primary">나</span>}
        </div>
        <div className="mx-auto mt-2 flex h-24 w-24 items-center justify-center rounded-full bg-bg-tertiary/60 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.span
              key={hand ?? (anim === "countdown" ? "shake" : submitted ? "ready" : "idle")}
              initial={hand ? { scale: 0.3, rotate: -20, opacity: 0 } : false}
              animate={anim === "countdown" ? { y: [0, -16, 0] } : { scale: 1, rotate: 0, opacity: 1 }}
              transition={anim === "countdown"
                ? { duration: 0.55, repeat: Infinity, ease: "easeInOut" }
                : { type: "spring", stiffness: 320, damping: 20 }}
              className="text-5xl">
              {hand ? HAND[hand].emoji : submitted ? "✊" : "❔"}
            </motion.span>
          </AnimatePresence>
        </div>
        <p className="mt-2 h-5 text-sm font-medium text-text-primary">
          {hand ? HAND[hand].label : submitted ? "제출 완료" : "대기 중..."}
        </p>
      </motion.div>
    );
  };

  // 진영 확정
  if (showDone && rps.blueSideTeamId) {
    const blue = rps.blueSideTeamId === teamA.id ? teamA : teamB;
    const red = rps.blueSideTeamId === teamA.id ? teamB : teamA;
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        className="space-y-3 text-center py-2">
        <h2 className="text-lg font-bold text-text-primary">진영 확정!</h2>
        <div className="flex items-center justify-center gap-5">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
            <span className="font-bold text-blue-400">{blue.name}</span>
          </span>
          <span className="text-text-tertiary text-sm">vs</span>
          <span className="flex items-center gap-2">
            <span className="font-bold text-red-400">{red.name}</span>
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
        </div>
        <p className="text-sm text-text-secondary">매치를 시작합니다...</p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-center">
        <h2 className="text-lg font-bold text-text-primary">진영 결정 — 가위바위보</h2>
        <p className="text-sm text-text-secondary mt-0.5">
          {anim === "countdown" && "준비!"}
          {anim === "tie" && "비겼습니다 — 다시!"}
          {anim !== "countdown" && anim !== "tie" && rps.phase === "throw" && (amCaptain ? "가위·바위·보를 내세요 (단판)" : "양 팀장이 진영을 가립니다")}
          {showSide && (amWinnerCaptain ? "승리! 진영을 선택하세요" : `${winnerTeam?.name ?? "승자"}가 진영을 고르는 중...`)}
        </p>
      </div>

      <div className="relative flex items-stretch gap-2">
        <Panel team={teamA} isA />
        <div className="flex items-center text-lg font-black text-text-tertiary">VS</div>
        <Panel team={teamB} isA={false} />
        {/* 카운트다운: 뒤 패널 dim(고정) + 숫자만 강조(박자마다 팝). 끝나면 dim 해제 */}
        <AnimatePresence>
          {anim === "countdown" && (
            <motion.div key="rps-dim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-none absolute -inset-2 z-10 rounded-2xl bg-bg-primary/75 backdrop-blur-[2px]" />
          )}
        </AnimatePresence>
        <AnimatePresence mode="popLayout">
          {anim === "countdown" && (
            <motion.div key={count}
              initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.6, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 16 }}
              className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
              <span className="text-7xl md:text-8xl drop-shadow-2xl">{COUNT_EMOJI[count]}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="rounded-xl border border-bg-tertiary bg-bg-tertiary/20 p-3 min-h-[84px] flex items-center justify-center">
        {/* 제출 단계 */}
        {anim !== "countdown" && anim !== "tie" && rps.phase === "throw" && (
          amCaptain && !iSubmitted ? (
            <div className="flex gap-3">
              {HANDS.map((h) => (
                <motion.button key={h} whileTap={{ scale: 0.9 }} whileHover={{ y: -3 }} onClick={() => onSubmit(h)}
                  className="flex flex-col items-center gap-1 px-5 py-2.5 rounded-xl bg-bg-tertiary hover:bg-bg-elevated transition-colors">
                  <span className="text-3xl">{HAND[h].emoji}</span>
                  <span className="text-sm font-medium text-text-primary">{HAND[h].label}</span>
                </motion.button>
              ))}
            </div>
          ) : (
            <p className="text-sm font-medium text-text-secondary">
              {amCaptain ? "상대 팀장을 기다리는 중..." : "양 팀장이 손을 내는 중..."}
            </p>
          )
        )}
        {anim === "countdown" && <p className="text-text-secondary font-medium">✊ ✊</p>}
        {anim === "tie" && (
          <motion.p initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="text-xl font-black text-text-primary">비겼습니다!</motion.p>
        )}
        {/* 진영 선택 단계 */}
        {showSide && (
          amWinnerCaptain ? (
            <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex gap-3">
              <motion.button whileTap={{ scale: 0.94 }} whileHover={{ y: -2 }} onClick={() => onChooseSide("blue")}
                className="px-7 py-2.5 rounded-xl font-bold text-white bg-blue-500 hover:bg-blue-600 transition-colors">블루 진영</motion.button>
              <motion.button whileTap={{ scale: 0.94 }} whileHover={{ y: -2 }} onClick={() => onChooseSide("red")}
                className="px-7 py-2.5 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 transition-colors">레드 진영</motion.button>
            </motion.div>
          ) : (
            <p className="text-sm font-bold text-text-secondary animate-pulse">{winnerTeam?.name ?? "승자"} 진영 선택 중...</p>
          )
        )}
      </div>
    </div>
  );
}
