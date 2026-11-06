"use client";

import { sideColor, teamDisplayName, useBroadcastLook } from "./look";

const SWAP_CSS = `
@keyframes side-swap-out {
  from { transform: translateY(0); }
  to { transform: translateY(-115%); }
}
@keyframes side-swap-in {
  from { transform: translateY(115%); }
  to { transform: translateY(0); }
}
@keyframes side-swap-pending { from { opacity: 1; } to { opacity: 0; } }
@keyframes side-swap-complete { from { opacity: 0; } to { opacity: 1; } }
@keyframes side-swap-context {
  0%, 20% { opacity: 1; }
  25%, 58% { opacity: 0; }
  65%, 100% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .side-swap-motion { animation: none !important; }
  .side-swap-pending { display: none; }
  .side-swap-old { display: none; }
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
  const contextStyle = {
    animation: animate ? "side-swap-context 4000ms linear both" : undefined,
  };
  return (
    <div className="relative flex h-full flex-col items-center justify-center px-32 text-center text-white">
      <style>{SWAP_CSS}</style>
      {title && (
        <p
          className="side-swap-motion absolute left-20 top-16 max-w-[1000px] truncate text-[28px] font-black text-white/50"
          style={contextStyle}
        >
          {title}
        </p>
      )}
      <div className="flex items-center justify-center gap-6">
        <p
          className="side-swap-motion border-r border-white/25 pr-6 text-[32px] font-black text-white/60"
          style={contextStyle}
        >
          {match.currentGameNumber}세트
        </p>
        <h1 className="relative text-[64px] font-black leading-none">
          <span
            className="side-swap-motion side-swap-complete"
            style={{
              animation: animate
                ? "side-swap-complete 280ms ease-out 2400ms both"
                : undefined,
            }}
          >
            진영 교대 완료
          </span>
          {animate && (
            <span
              aria-hidden
              className="side-swap-motion side-swap-pending absolute inset-0"
              style={{
                animation: "side-swap-pending 200ms ease-in 800ms both",
              }}
            >
              진영 교대
            </span>
          )}
        </h1>
      </div>
      <p
        className="side-swap-motion mt-4 text-[26px] font-black text-white/50"
        style={contextStyle}
      >
        {match.status === "IN_PROGRESS"
          ? "다음 세트가 시작됩니다"
          : "양 팀 준비 후 경기가 시작됩니다"}
      </p>
      <div className="mt-16 grid w-full grid-cols-[minmax(0,1fr)_120px_minmax(0,1fr)] items-center gap-8">
        {(["blue", "red"] as const).map((side, index) => (
          <div
            key={side}
            className={
              index ? "col-start-3 row-start-1" : "col-start-1 row-start-1"
            }
          >
            <p
              className="side-swap-motion text-2xl font-black tracking-widest"
              style={{
                color: sideColor(look, side),
                animation: animate
                  ? "side-swap-complete 280ms ease-out 2400ms both"
                  : undefined,
              }}
            >
              {side === "blue" ? "블루 진영" : "레드 진영"}
            </p>
            <div className="relative mt-5 overflow-hidden text-[112px] font-black leading-tight">
              {animate && (
                <p
                  aria-hidden
                  className="side-swap-motion side-swap-old absolute inset-0 truncate"
                  style={{
                    color: sideColor(look, side),
                    animation:
                      "side-swap-out 800ms cubic-bezier(.65,0,.35,1) 1000ms both",
                  }}
                >
                  {teamDisplayName(
                    match[side === "blue" ? "red" : "blue"],
                    look.settings.teamLabel,
                  )}
                </p>
              )}
              <p
                className="side-swap-motion truncate"
                style={{
                  color: sideColor(look, side),
                  animation: animate
                    ? "side-swap-in 800ms cubic-bezier(.22,1,.36,1) 1200ms both"
                    : undefined,
                }}
              >
                {teamDisplayName(match[side], look.settings.teamLabel)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
