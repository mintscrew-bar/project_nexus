"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Check, Dices, GripVertical, Lock, MousePointer2, RotateCcw, Scale, Undo2, Unlock } from "lucide-react";

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
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const dragOrigin = useRef<{ id: string; x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totals = useMemo(() => teams.map(teamTotal), [teams]);
  const spread = Math.abs(totals[0] - totals[1]);

  const locate = (id: string) => {
    const teamIndex = teams.findIndex((team) => team.some((player) => player.id === id));
    const playerIndex = teams[teamIndex]?.findIndex((player) => player.id === id) ?? -1;
    return { teamIndex, playerIndex };
  };

  const swap = (fromId: string, toId: string) => {
    if (fromId === toId) return cancelDrag();
    const from = locate(fromId);
    const to = locate(toId);
    if (from.teamIndex < 0 || to.teamIndex < 0) return cancelDrag();

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
    setDragged(null);
    setDropTarget(null);
    setDragPosition(null);
    dragOrigin.current = null;
    dragging.current = false;
  };

  const reset = () => {
    setTeams(initialTeams);
    setPinned(new Set());
    setDragged(null);
    setDropTarget(null);
    setDragPosition(null);
  };

  const resolveTarget = (x: number, y: number) =>
    document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-demo-player]")?.dataset.demoPlayer ?? null;

  const cancelDrag = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    dragOrigin.current = null;
    dragging.current = false;
    setDragged(null);
    setDropTarget(null);
    setDragPosition(null);
  };

  const beginDrag = (id: string, x: number, y: number) => {
    dragging.current = true;
    setDragged(id);
    setDragPosition({ x, y });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>, id: string) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragOrigin.current = { id, x: event.clientX, y: event.clientY };
    if (event.pointerType === "mouse") {
      event.preventDefault();
      beginDrag(id, event.clientX, event.clientY);
    } else {
      holdTimer.current = setTimeout(() => beginDrag(id, event.clientX, event.clientY), 140);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const origin = dragOrigin.current;
    if (!origin) return;
    if (!dragging.current) {
      if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 14) cancelDrag();
      return;
    }
    event.preventDefault();
    setDragPosition({ x: event.clientX, y: event.clientY });
    const target = resolveTarget(event.clientX, event.clientY);
    setDropTarget(target && target !== origin.id ? target : null);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return cancelDrag();
    const target = resolveTarget(event.clientX, event.clientY);
    swap(dragOrigin.current?.id ?? "", target ?? "");
  };

  const draggedPlayer = dragged
    ? teams.flatMap((team) => team).find((player) => player.id === dragged)
    : null;
  const targetPlayer = dropTarget
    ? teams.flatMap((team) => team).find((player) => player.id === dropTarget)
    : null;
  const previewScore = draggedPlayer && targetPlayer
    ? draggedPlayer.scores[targetPlayer.role] ?? draggedPlayer.score
    : draggedPlayer?.score;
  const projectedSpread = draggedPlayer && targetPlayer
    ? (() => {
        const source = locate(draggedPlayer.id);
        const target = locate(targetPlayer.id);
        const nextTotals = [...totals];
        const sourceScore = draggedPlayer.scores[targetPlayer.role] ?? draggedPlayer.score;
        const targetScore = targetPlayer.scores[draggedPlayer.role] ?? targetPlayer.score;
        nextTotals[source.team] += sourceScore - draggedPlayer.score;
        nextTotals[target.team] += targetScore - targetPlayer.score;
        return Math.abs(nextTotals[0] - nextTotals[1]);
      })()
    : null;

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

        <div className="relative grid gap-3 p-3 sm:p-5 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-start">
          {teams.map((team, teamIndex) => (
            <div key={teamIndex} className={teamIndex === 1 ? "contents" : undefined}>
            {teamIndex === 1 && <div className="hidden items-center justify-center pt-14 md:flex"><span className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-200/15 bg-amber-200/[0.06] text-[10px] font-black text-amber-100">VS</span></div>}
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5 sm:p-4">
              <div className="flex items-center justify-between">
                <p className={`text-[10px] font-black tracking-[0.16em] ${teamIndex === 0 ? "text-sky-200" : "text-rose-200"}`}>{teamIndex === 0 ? "BLUE" : "RED"}</p>
                <div className="text-right"><p className="text-[9px] text-white/40">팀 점수</p><p className="text-xs font-black tabular-nums text-white/80 transition-all duration-300">{totals[teamIndex].toFixed(1)}</p></div>
              </div>
              <div className="mt-2 flex items-center justify-between border-b border-white/[0.06] pb-2 text-[9px] text-white/40"><span>5명 편성</span><span>라인 점수 반영</span></div>
              <div className="mt-3 space-y-2">
                {team.map((player) => {
                  const active = dragged === player.id;
                  return (
                    <div
                      key={player.id}
                      data-demo-player={player.id}
                      onPointerDown={(event) => handlePointerDown(event, player.id)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={cancelDrag}
                      className={`flex w-full cursor-grab select-none touch-pan-y items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-[opacity,transform,box-shadow,background-color] duration-150 active:cursor-grabbing ${active ? "z-10 scale-[1.015] border-amber-200/60 bg-amber-200/10 opacity-45 shadow-lg" : dropTarget === player.id ? "scale-[0.985] border-amber-200 bg-amber-200/15 ring-2 ring-inset ring-amber-200" : "border-transparent bg-black/20 hover:border-white/10 hover:bg-white/[0.05]"}`}
                      aria-label={`${player.name} 카드를 끌어 다른 선수 위에 놓아 교체`}
                    >
                      <GripVertical className="h-3.5 w-3.5 flex-shrink-0 text-white/25" />
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-black ${teamIndex === 0 ? "bg-sky-300/10 text-sky-100" : "bg-rose-300/10 text-rose-100"}`}>{player.name.slice(0, 1)}</span>
                      <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-white/70">{player.name}</span>
                      <span className="text-right text-[9px] leading-4 text-white/45">{player.role}<br /><span className="text-white/70">{player.score.toFixed(1)}점</span></span>
                      <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setPinned((current) => { const next = new Set(current); next.has(player.id) ? next.delete(player.id) : next.add(player.id); return next; })} className={`rounded p-1 transition-colors ${pinned.has(player.id) ? "bg-violet-300/15 text-violet-200" : "text-white/25 hover:bg-white/[0.06] hover:text-white/60"}`} aria-label={pinned.has(player.id) ? `${player.name} 고정 해제` : `${player.name} 라인 고정`}>
                        {pinned.has(player.id) ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            </div>
          ))}
          {!dragged && <div className="pointer-events-none absolute left-[17%] top-[205px] z-20 hidden items-center gap-1.5 animate-[demo-drag-card_4s_ease-in-out_infinite] md:flex">
            <div className="flex items-center gap-2 rounded-lg border border-amber-200/55 bg-[#29251a]/95 px-2.5 py-2 text-[10px] shadow-xl"><GripVertical className="h-3 w-3 text-amber-100/70" /><span className="font-black text-amber-50">밤하늘</span><span className="text-amber-100/70">MID · 86.2</span></div>
            <MousePointer2 className="h-5 w-5 -translate-x-2 -translate-y-1 rotate-[-12deg] text-amber-100 drop-shadow-lg" />
          </div>}
        </div>

        <div className="relative flex flex-col gap-2 border-t border-white/[0.07] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="flex items-center gap-2 text-[10px] text-white/50"><ArrowLeftRight className="h-3.5 w-3.5 text-amber-200/70" />{dragged ? (dropTarget ? "여기에 놓으면 교체됩니다" : "바꿀 선수 위로 끌어다 놓으세요") : "선수 카드를 끌어 다른 선수 위에 놓으면 교체됩니다"}</p>
          <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-2.5 py-1 text-[10px] font-bold text-emerald-200 sm:self-auto"><Check className="h-3 w-3" />방장 검토 가능</span>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <div className="rounded-xl border border-amber-200/15 bg-amber-200/[0.04] px-3 py-2.5"><div className="flex items-center justify-between gap-3"><p className="text-[9px] font-bold tracking-[0.14em] text-amber-100/80">SWAP PREVIEW</p><span className="text-[10px] font-black tabular-nums text-amber-100">{dragged && dropTarget ? `예상 차 ${projectedSpread?.toFixed(1)}` : "드래그하면 미리보기"}</span></div><p className="mt-1 text-[10px] leading-5 text-white/50">현재 팀 점수 차 <span className="font-bold text-white/70">{spread.toFixed(1)}</span> · 대상 라인 예상 개인 점수 <span className="font-bold text-amber-100">{dragged && dropTarget ? `${previewScore?.toFixed(1)}점` : "–"}</span></p></div>
        <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.025] p-2"><button type="button" onClick={reset} className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-2 text-[10px] font-bold text-white/55 hover:bg-white/[0.06] hover:text-white"><Undo2 className="h-3 w-3" />되돌리기</button><button type="button" onClick={reset} className="flex items-center gap-1.5 rounded-lg bg-amber-200 px-2.5 py-2 text-[10px] font-black text-[#17130b] hover:bg-amber-100"><Dices className="h-3 w-3" />다시 뽑기</button></div>
      </div>
      <p className="mt-3 px-1 text-[10px] font-medium leading-5 text-white/45"><Scale className="mr-1 inline h-3 w-3" />예시 데이터로 만든 미리보기입니다. 실제 화면처럼 라인 위치는 고정되고, 드래그 중 대상 라인의 예상 점수를 표시합니다.</p>
      {dragPosition && draggedPlayer && <div className="pointer-events-none fixed z-[100] flex min-w-44 items-center gap-2 rounded-lg border border-amber-200/70 bg-[#202126]/95 px-3 py-2 text-[10px] shadow-2xl backdrop-blur-sm" style={{ left: dragPosition.x, top: dragPosition.y, transform: "translate(-50%, calc(-100% - 14px)) rotate(-1deg)" }}><ArrowLeftRight className="h-3.5 w-3.5 text-amber-200" /><span className="font-black text-white">{draggedPlayer.name}</span><span className="font-black tabular-nums text-amber-200">{previewScore?.toFixed(1)}점</span></div>}
    </div>
  );
}
