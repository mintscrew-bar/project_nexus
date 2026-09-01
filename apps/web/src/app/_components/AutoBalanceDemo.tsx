"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, Check, GripVertical, RotateCcw, Scale } from "lucide-react";

type Player = {
  id: string;
  name: string;
  role: string;
  score: number;
  scores: Record<string, number>;
};

const initialTeams: Player[][] = [
  [
    { id: "night", name: "밤하늘", role: "MID", score: 86.2, scores: { MID: 86.2, TOP: 79.4 } },
    { id: "mocha", name: "모카빵", role: "TOP", score: 83.1, scores: { TOP: 83.1, MID: 77.6 } },
    { id: "mint", name: "민트초코", role: "JGL", score: 81.4, scores: { JGL: 81.4, MID: 74.8 } },
    { id: "lime", name: "라임소다", role: "BOT", score: 80.8, scores: { BOT: 80.8, SUP: 76.2 } },
    { id: "cloud", name: "구름이", role: "SUP", score: 78.9, scores: { SUP: 78.9, BOT: 72.5 } },
  ],
  [
    { id: "salt", name: "소금빵", role: "MID", score: 74.9, scores: { MID: 74.9, TOP: 71.8 } },
    { id: "sunset", name: "노을빛", role: "TOP", score: 82.7, scores: { TOP: 82.7, MID: 75.9 } },
    { id: "choco", name: "초코우유", role: "JGL", score: 79.6, scores: { JGL: 79.6, TOP: 73.4 } },
    { id: "space", name: "우주먼지", role: "BOT", score: 81.7, scores: { BOT: 81.7, SUP: 75.2 } },
    { id: "dalgona", name: "달고나", role: "SUP", score: 80.1, scores: { SUP: 80.1, BOT: 74.3 } },
  ],
];

function teamTotal(team: Player[]) {
  return team.reduce((total, player) => total + player.score, 0);
}

export function AutoBalanceDemo() {
  const [teams, setTeams] = useState(initialTeams);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);

  const totals = useMemo(() => teams.map(teamTotal), [teams]);
  const spread = Math.abs(totals[0] - totals[1]);

  const locate = (id: string) => {
    const teamIndex = teams.findIndex((team) => team.some((player) => player.id === id));
    const playerIndex = teams[teamIndex]?.findIndex((player) => player.id === id) ?? -1;
    return { teamIndex, playerIndex };
  };

  const swap = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const from = locate(fromId);
    const to = locate(toId);
    if (from.teamIndex < 0 || to.teamIndex < 0) return;

    setTeams((current) => {
      const next = current.map((team) => team.map((player) => ({ ...player })));
      const fromPlayer = next[from.teamIndex][from.playerIndex];
      const toPlayer = next[to.teamIndex][to.playerIndex];
      const fromRole = fromPlayer.role;
      const toRole = toPlayer.role;
      fromPlayer.role = toRole;
      toPlayer.role = fromRole;
      fromPlayer.score = fromPlayer.scores[toRole] ?? fromPlayer.score;
      toPlayer.score = toPlayer.scores[fromRole] ?? toPlayer.score;
      [next[from.teamIndex][from.playerIndex], next[to.teamIndex][to.playerIndex]] = [toPlayer, fromPlayer];
      return next;
    });
    setSelected(null);
    setDragged(null);
  };

  const reset = () => {
    setTeams(initialTeams);
    setSelected(null);
    setDragged(null);
  };

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-white/[0.09] bg-[#17181c] p-3 shadow-[0_40px_120px_rgba(0,0,0,0.45)] sm:p-5">
      <div className="rounded-[22px] border border-white/[0.07] bg-[#0d0e11]">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-4 sm:px-5">
          <div>
            <p className="text-[9px] font-bold tracking-[0.18em] text-white/45">TEAM BUILDER · DEMO</p>
            <p className="mt-1 text-sm font-bold text-white">자동 밸런스 결과</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[9px] text-white/40">팀 점수 차</p>
              <p className="text-sm font-black tabular-nums text-emerald-200 transition-all duration-300">{spread.toFixed(1)}</p>
            </div>
            <button type="button" onClick={reset} className="rounded-lg border border-white/[0.08] p-2 text-white/45 transition hover:bg-white/[0.06] hover:text-white" aria-label="데모 초기화">
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="grid gap-3 p-3 sm:p-5 md:grid-cols-[1fr_auto_1fr] md:items-start">
          {teams.map((team, teamIndex) => (
            <div key={teamIndex} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5 sm:p-4">
              <div className="flex items-center justify-between">
                <p className={`text-[10px] font-black tracking-[0.16em] ${teamIndex === 0 ? "text-sky-200" : "text-rose-200"}`}>{teamIndex === 0 ? "BLUE" : "RED"}</p>
                <div className="text-right"><p className="text-[9px] text-white/40">팀 점수</p><p className="text-xs font-black tabular-nums text-white/80 transition-all duration-300">{totals[teamIndex].toFixed(1)}</p></div>
              </div>
              <div className="mt-2 flex items-center justify-between border-b border-white/[0.06] pb-2 text-[9px] text-white/40"><span>5명 편성</span><span>라인 점수 반영</span></div>
              <div className="mt-3 space-y-2">
                {team.map((player) => {
                  const active = selected === player.id || dragged === player.id;
                  return (
                    <button
                      key={player.id}
                      type="button"
                      draggable
                      onDragStart={() => setDragged(player.id)}
                      onDragEnd={() => setDragged(null)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => dragged && swap(dragged, player.id)}
                      onClick={() => selected ? swap(selected, player.id) : setSelected(player.id)}
                      className={`flex w-full cursor-grab items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-all duration-300 active:cursor-grabbing ${active ? "border-amber-200/60 bg-amber-200/10 shadow-[0_0_20px_rgba(253,230,138,0.12)]" : "border-transparent bg-black/20 hover:border-white/10 hover:bg-white/[0.05]"}`}
                      aria-label={`${player.name} 선택. 다른 선수 카드에 놓아 교체`}
                    >
                      <GripVertical className="h-3.5 w-3.5 flex-shrink-0 text-white/25" />
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-black ${teamIndex === 0 ? "bg-sky-300/10 text-sky-100" : "bg-rose-300/10 text-rose-100"}`}>{player.name.slice(0, 1)}</span>
                      <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-white/70">{player.name}</span>
                      <span className="text-right text-[9px] leading-4 text-white/45">{player.role}<br /><span className="text-white/70">{player.score.toFixed(1)}점</span></span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="hidden items-center justify-center md:flex"><span className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-200/15 bg-amber-200/[0.06] text-[10px] font-black text-amber-100">VS</span></div>
        </div>

        <div className="flex flex-col gap-2 border-t border-white/[0.07] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="flex items-center gap-2 text-[10px] text-white/50"><ArrowLeftRight className="h-3.5 w-3.5 text-amber-200/70" />{selected ? "교체할 선수 카드를 클릭하거나 다른 카드 위에 드롭하세요" : "카드를 드래그하거나 클릭한 뒤 다른 선수 카드를 선택하세요"}</p>
          <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-2.5 py-1 text-[10px] font-bold text-emerald-200 sm:self-auto"><Check className="h-3 w-3" />방장 검토 가능</span>
        </div>
      </div>
      <p className="mt-3 px-1 text-[10px] font-medium leading-5 text-white/45"><Scale className="mr-1 inline h-3 w-3" />예시 데이터로 만든 인터랙티브 미리보기입니다. 실제 방에서는 저장된 라인별 밸런스 점수와 포지션 선호를 기준으로 계산합니다.</p>
    </div>
  );
}
