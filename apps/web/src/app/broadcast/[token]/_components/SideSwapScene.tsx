"use client";

import { sideColor, teamDisplayName, useBroadcastLook } from "./look";
import type { CSSProperties } from "react";

const SWAP_CSS = `
@keyframes side-swap-blue {
  0%, 20% { transform: translateX(calc(100% + 184px)); color: var(--old-color); }
  55% { transform: translate(calc(50% + 92px), -58px); color: var(--old-color); }
  85%, 100% { transform: none; color: var(--new-color); }
}
@keyframes side-swap-red {
  0%, 20% { transform: translateX(calc(-100% - 184px)); color: var(--old-color); }
  55% { transform: translate(calc(-50% - 92px), 58px); color: var(--old-color); }
  85%, 100% { transform: none; color: var(--new-color); }
}
@keyframes side-swap-arrow { from { transform: rotate(0deg); } to { transform: rotate(180deg); } }
@keyframes side-swap-pending { 0%, 84% { opacity: 1; } 85%, 100% { opacity: 0; } }
@keyframes side-swap-complete { 0%, 84% { opacity: 0; } 85%, 100% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .side-swap-motion { animation: none !important; }
  .side-swap-pending { display: none; }
  .side-swap-complete { opacity: 1 !important; }
}
`;

/** 서버가 확정한 다음 세트 진영을 결과 화면 직후 짧게 공개한다. */
export function SideSwapScene({ snapshot }: { snapshot: any }) {
  const look = useBroadcastLook();
  const match = snapshot?.match;
  if (!match) return null;
  const title = look.settings.title ?? snapshot?.room?.name;
  const animate = look.settings.transition.style !== "none";
  return (
    <div className="flex h-full flex-col items-center justify-center px-32 pb-16 text-center text-white">
      <style>{SWAP_CSS}</style>
      {title && (
        <p className="max-w-full truncate text-[36px] font-black text-white/80">
          {title}
        </p>
      )}
      <p className="mt-4 text-[28px] font-black text-white/60">
        {match.currentGameNumber}세트
      </p>
      <h1 className="relative mt-8 text-[88px] font-black leading-none">
        <span
          className="side-swap-motion side-swap-complete"
          style={{
            animation: animate
              ? "side-swap-complete 1400ms linear both"
              : undefined,
          }}
        >
          진영 교대 완료
        </span>
        {animate && (
          <span
            aria-hidden
            className="side-swap-motion side-swap-pending absolute inset-0"
            style={{ animation: "side-swap-pending 1400ms linear both" }}
          >
            진영 교대
          </span>
        )}
      </h1>
      <div className="mt-16 grid w-full grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)] items-center gap-8">
        {(["blue", "red"] as const).map((side, index) => (
          <div
            key={side}
            className={
              index ? "col-start-3 row-start-1" : "col-start-1 row-start-1"
            }
          >
            <p
              className="text-2xl font-black tracking-widest"
              style={{ color: sideColor(look, side) }}
            >
              {side === "blue" ? "블루 진영" : "레드 진영"}
            </p>
            <p
              className="side-swap-motion relative z-10 mt-5 truncate text-[72px] font-black"
              style={
                {
                  color: sideColor(look, side),
                  "--old-color": sideColor(
                    look,
                    side === "blue" ? "red" : "blue",
                  ),
                  "--new-color": sideColor(look, side),
                  animation: animate
                    ? `side-swap-${side} 1400ms cubic-bezier(.4,0,.2,1) both`
                    : undefined,
                } as CSSProperties
              }
            >
              {teamDisplayName(match[side], look.settings.teamLabel)}
            </p>
          </div>
        ))}
        <span
          className="side-swap-motion col-start-2 row-start-1 text-[72px] text-white/35"
          style={{
            animation: animate
              ? "side-swap-arrow 1000ms ease-in-out 280ms both"
              : undefined,
          }}
          aria-hidden
        >
          ⇄
        </span>
      </div>
      <p className="mt-14 text-[28px] font-black text-white/60">
        {match.status === "IN_PROGRESS"
          ? "다음 세트가 시작됩니다"
          : "양 팀 준비 후 경기가 시작됩니다"}
      </p>
    </div>
  );
}
