"use client";

import { useState } from "react";
import { BarChart3, Check, CircleDot, Coins, Radio, Trophy, Users } from "lucide-react";

type DemoKind = "readiness" | "balance" | "records";

export function LandingFeatureDemo({ kind }: { kind: DemoKind }) {
  if (kind === "readiness") return <ReadinessDemo />;
  if (kind === "balance") return <BalanceDemo />;
  return <RecordsDemo />;
}

function ReadinessDemo() {
  const [ready, setReady] = useState(false);
  const count = ready ? 9 : 8;
  return <div className="absolute inset-x-6 bottom-5 rounded-2xl border border-white/[0.08] bg-[#101116]/95 p-4 shadow-2xl shadow-black/30">
    <div className="flex items-center justify-between"><div><p className="text-[9px] font-bold tracking-[0.16em] text-white/60">PLAYER CHECK</p><p className="mt-1 text-xs font-semibold text-white/80">참가 준비</p></div><p className="text-lg font-bold tabular-nums text-white">{count} <span className="text-white/60">/ 10</span></p></div>
    <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-amber-300 transition-all duration-500" style={{ width: `${count * 10}%` }} /></div>
    <div className="mt-4 grid grid-cols-5 gap-2">{["TOP", "JGL", "MID", "BOT", "SUP"].map((position, index) => <div key={position} className="text-center"><div className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full border ${index < 4 || ready ? "border-emerald-300/25 bg-emerald-300/10" : "border-amber-300/15 bg-amber-300/[0.07]"}`}><Check className={`h-3 w-3 ${index < 4 || ready ? "text-emerald-200" : "text-white/35"}`} /></div><p className="mt-1.5 text-[8px] font-semibold text-white/60">{position}</p></div>)}</div>
    <button type="button" onClick={() => setReady((value) => !value)} className={`mt-4 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[10px] font-bold transition ${ready ? "border border-emerald-300/20 bg-emerald-300/10 text-emerald-200" : "bg-amber-200 text-[#17130b] hover:bg-amber-100"}`}><CircleDot className="h-3 w-3" />{ready ? "준비 완료 · 다시 누르면 취소" : "내 준비 상태 변경"}</button>
  </div>;
}

function BalanceDemo() {
  return <div className="absolute inset-x-6 bottom-5 rounded-2xl border border-white/[0.08] bg-[#101116]/95 p-4 shadow-2xl shadow-black/30"><div className="flex items-center justify-between"><div><p className="text-[9px] font-bold tracking-[0.16em] text-white/60">TEAM BALANCE</p><p className="mt-1 text-xs font-semibold text-white/80">자동 밸런스 결과</p></div><p className="text-xs font-bold tabular-nums text-violet-200">티어·포지션 반영</p></div><div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3"><div className="space-y-1.5">{["TOP · D4", "MID · E2", "BOT · P1"].map((player) => <div key={player} className="rounded-md border border-cyan-300/10 bg-cyan-300/[0.05] px-2 py-1.5 text-[9px] font-medium text-cyan-100/60">{player}</div>)}</div><div className="flex h-9 w-9 items-center justify-center rounded-full border border-violet-300/15 bg-violet-300/[0.07] text-[9px] font-black text-violet-200">VS</div><div className="space-y-1.5 text-right">{["TOP · D3", "MID · E1", "BOT · P2"].map((player) => <div key={player} className="rounded-md border border-rose-300/10 bg-rose-300/[0.05] px-2 py-1.5 text-[9px] font-medium text-rose-100/60">{player}</div>)}</div></div><p className="mt-3 flex items-center gap-1.5 text-[9px] text-white/45"><Users className="h-3 w-3" />방장이 결과를 검토한 뒤 확정합니다</p></div>;
}

function RecordsDemo() {
  const [tab, setTab] = useState<"result" | "broadcast">("result");
  return <div className="absolute inset-x-6 bottom-5 rounded-2xl border border-white/[0.08] bg-[#101116]/95 p-4 shadow-2xl shadow-black/30"><div className="flex items-center justify-between border-b border-white/[0.06] pb-3"><div><p className="text-[9px] font-bold tracking-[0.16em] text-white/60">{tab === "result" ? "MATCH RESULT" : "BROADCAST OVERLAY"}</p><p className="mt-1 text-xs font-semibold text-white/80">금요일 정기 내전 · 3세트</p></div><div className="flex items-center gap-2 text-sm font-black tabular-nums"><span className="text-cyan-200">BLUE 2</span><span className="text-white/60">:</span><span className="text-rose-200">1 RED</span></div></div>{tab === "result" ? <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-5"><div className="space-y-2">{[["KDA",72],["DMG",58],["GOLD",84]].map(([label, width]) => <div key={String(label)} className="flex items-center gap-2"><span className="w-7 text-[8px] font-medium text-white/60">{label}</span><div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-cyan-300/65" style={{ width: `${width}%` }} /></div></div>)}</div><div className="rounded-lg border border-cyan-300/10 bg-cyan-300/[0.05] px-3 py-2 text-center"><p className="text-[8px] text-white/60">MVP</p><p className="mt-1 text-[10px] font-bold text-cyan-100/75">MID · 4표</p></div></div> : <div className="mt-4 rounded-xl border border-violet-300/15 bg-violet-300/[0.05] p-3"><div className="flex items-center gap-2 text-[10px] font-bold text-violet-100"><Radio className="h-3.5 w-3.5" />OBS 브라우저 소스 미리보기</div><div className="mt-3 flex items-center justify-between text-[9px] text-white/55"><span>대기 → 경매 → 대진표 → 결과</span><span className="text-emerald-200">연결됨</span></div></div>}<div className="mt-3 flex gap-2"><button type="button" onClick={() => setTab("result")} className={`rounded-lg px-2.5 py-1.5 text-[9px] font-bold ${tab === "result" ? "bg-white/10 text-white" : "text-white/40"}`}><BarChart3 className="mr-1 inline h-3 w-3" />경기 결과</button><button type="button" onClick={() => setTab("broadcast")} className={`rounded-lg px-2.5 py-1.5 text-[9px] font-bold ${tab === "broadcast" ? "bg-white/10 text-white" : "text-white/40"}`}><Radio className="mr-1 inline h-3 w-3" />방송 화면</button></div></div>;
}
