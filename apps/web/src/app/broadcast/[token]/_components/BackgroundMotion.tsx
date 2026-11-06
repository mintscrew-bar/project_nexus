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
      @keyframes bc-edge-drift { 0%, 100% { transform: translateX(-4%); opacity: .75; } 50% { transform: translateX(4%); opacity: 1; } }
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
            strokeOpacity=".42"
            strokeWidth="2.5"
            pathLength="2000"
            strokeDasharray="150 850"
            className="bc-background-motion"
            style={{ animation: "bc-frame-trace 22s linear infinite" }}
          />
        </svg>
      ) : (
        <div
          className="bc-background-motion absolute -inset-x-[5%] inset-y-0"
          style={{
            animation: "bc-edge-drift 8s ease-in-out infinite",
            background:
              "linear-gradient(115deg, transparent 17%, rgba(175,210,240,.34) 17.1%, rgba(175,210,240,.34) 17.2%, rgba(150,186,215,.11) 17.3%, rgba(150,186,215,.025) 23%, transparent 23.1%, transparent 77%, rgba(150,186,215,.025) 77.1%, rgba(150,186,215,.11) 82.7%, rgba(175,210,240,.34) 82.8%, rgba(175,210,240,.34) 82.9%, transparent 83%)",
          }}
        />
      )}
    </div>
  );
}
