"use client";

/** 새 배경의 느린 장식 모션. 미리보기와 실제 송출 화면에서 같이 사용한다. */
export function BackgroundMotion({ type }: { type: "studio" | "technical" }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      <style>{`
      @keyframes bc-frame-trace { to { stroke-dashoffset: -2000; } }
      @keyframes bc-edge-drift { 0%, 100% { transform: translateX(-1.5%); opacity: .35; } 50% { transform: translateX(1.5%); opacity: .65; } }
      @media (prefers-reduced-motion: reduce) { .bc-background-motion { animation: none !important; } }
    `}</style>
      {type === "studio" ? (
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 1920 1080"
          preserveAspectRatio="none"
        >
          <rect
            x="77"
            y="43"
            width="1766"
            height="994"
            fill="none"
            stroke="white"
            strokeOpacity=".25"
            strokeWidth="1.5"
            pathLength="2000"
            strokeDasharray="110 890"
            className="bc-background-motion"
            style={{ animation: "bc-frame-trace 22s linear infinite" }}
          />
        </svg>
      ) : (
        <div
          className="bc-background-motion absolute -inset-x-[5%] inset-y-0"
          style={{
            animation: "bc-edge-drift 14s ease-in-out infinite",
            background:
              "linear-gradient(115deg, transparent 17%, rgba(150,186,215,.08) 17.1%, rgba(150,186,215,.025) 23%, transparent 23.1%, transparent 77%, rgba(150,186,215,.04) 77.1%, rgba(150,186,215,.08) 83%, transparent 83.1%)",
          }}
        />
      )}
    </div>
  );
}
