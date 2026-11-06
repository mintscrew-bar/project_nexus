"use client";

import { sideColor, teamDisplayName, useBroadcastLook } from "./look";

/** 서버가 확정한 다음 세트 진영을 결과 화면 직후 짧게 공개한다. */
export function SideSwapScene({ snapshot }: { snapshot: any }) {
  const look = useBroadcastLook();
  const match = snapshot?.match;
  if (!match) return null;
  const title = look.settings.title ?? snapshot?.room?.name;
  return (
    <div className="flex h-full flex-col items-center justify-center px-32 pb-16 text-center text-white">
      {title && (
        <p className="max-w-full truncate text-[36px] font-black text-white/80">
          {title}
        </p>
      )}
      <p className="mt-4 text-[28px] font-black text-white/60">
        {match.currentGameNumber}세트
      </p>
      <h1 className="mt-8 text-[88px] font-black leading-none">진영 교대</h1>
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
              className="mt-5 truncate text-[72px] font-black"
              style={{ color: sideColor(look, side) }}
            >
              {teamDisplayName(match[side], look.settings.teamLabel)}
            </p>
          </div>
        ))}
        <span
          className="col-start-2 row-start-1 text-[72px] text-white/35"
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
