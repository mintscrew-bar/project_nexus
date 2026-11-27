"use client";

/**
 * 카드 장식 배경 장면 (2026-11-24 「허접한 장식」 다시 그리기).
 *
 * 예전 카드 장식은 어두운 바탕 위에 작은 픽셀 그림(슬라임·박쥐…)만 떠 있어 허전했다.
 * 묵룡·기사처럼 카드 전체를 채우는 장면을 코드(SVG + CSS 애니메이션)로 그려 그 뒤에 깐다.
 *
 * 2026-11-27: 슬라임·유령·화염·박쥐·검·번개는 배경까지 pixelfx 픽셀 그림으로 바꿔
 * (effects.tsx CardSheet, public/cosmetics/cards/bg-*.png) 여기 장면을 뺐다. 남은 건 벚꽃뿐.
 *
 * - 좌표는 실제 로비 카드 크기(220×216) 기준 viewBox, 칸에 맞춰 잘라 채운다(slice).
 * - 애니메이션은 globals.css 「카드 장면」의 cfx-scene-* — 「멈춘 그림」 설정이면 멈춘다.
 * - 아래쪽은 이름 띠가 덮으므로 큰 그림은 위·가운데에 둔다.
 */

import { useId, type CSSProperties, type ReactNode } from "react";

const VB = "0 0 220 216";

/** 결정적 의사 난수 — 서버·브라우저가 같은 배치를 그리게(하이드레이션 어긋남 방지) */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function Scene({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox={VB}
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {children}
    </svg>
  );
}

/** 위로 떠오르는 작은 점들(거품·불티·먼지) */
function Rising({
  seed,
  count,
  color,
  r = [1, 2.4],
  dur = [5, 9],
  y0 = 216,
  className = "cfx-scene-rise",
}: {
  seed: number;
  count: number;
  color: string;
  r?: [number, number];
  dur?: [number, number];
  y0?: number;
  className?: string;
}) {
  const rnd = seeded(seed);
  return (
    <g>
      {Array.from({ length: count }, (_, i) => {
        const x = 8 + rnd() * 204;
        const rad = r[0] + rnd() * (r[1] - r[0]);
        const d = dur[0] + rnd() * (dur[1] - dur[0]);
        const style: CSSProperties = {
          animationDuration: `${d}s`,
          animationDelay: `${-rnd() * d}s`,
          transformBox: "fill-box",
        };
        return (
          <circle
            key={i}
            cx={x}
            cy={y0}
            r={rad}
            fill={color}
            className={className}
            style={style}
          />
        );
      })}
    </g>
  );
}

export function SakuraScene() {
  const u = useId().replace(/:/g, "");
  const rnd = seeded(7);
  return (
    <Scene>
      <defs>
        <linearGradient id={`${u}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b2140" />
          <stop offset="0.5" stopColor="#a35a7e" />
          <stop offset="1" stopColor="#f0b9c9" />
        </linearGradient>
      </defs>
      <rect width="220" height="216" fill={`url(#${u}-sky)`} />
      <circle cx="150" cy="96" r="26" fill="#ffe3ea" opacity="0.55" />
      {/* 먼 산 */}
      <path
        d="M0 150 L40 118 L70 140 L112 100 L150 136 L186 112 L220 138 V216 H0Z"
        fill="#7a3f5f"
        opacity="0.8"
      />
      <path
        d="M0 170 L50 146 L96 164 L140 140 L190 162 L220 152 V216 H0Z"
        fill="#5e2f4b"
      />
      {/* 위에서 드리운 꽃가지 */}
      <path
        d="M-4 18 Q50 30 86 58 Q104 72 128 70 M54 34 Q60 52 52 70 M96 62 Q110 84 104 100"
        stroke="#3a1d2a"
        strokeWidth="3.2"
        fill="none"
        strokeLinecap="round"
      />
      {Array.from({ length: 26 }, (_, i) => {
        const t = i / 26;
        const x = 6 + t * 120 + (rnd() - 0.5) * 18;
        const y = 22 + Math.sin(t * 3) * 26 + t * 40 + (rnd() - 0.5) * 16;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={2.4 + rnd() * 2.6}
            fill={rnd() > 0.5 ? "#ffc4d6" : "#ff9fbe"}
            opacity={0.85}
          />
        );
      })}
      <Rising
        seed={17}
        count={9}
        color="#ffd6e3"
        r={[1.2, 2.2]}
        dur={[7, 12]}
        y0={0}
        className="cfx-scene-fall"
      />
    </Scene>
  );
}

/* ───────── 불꽃 — 어둠 속에서 아래로부터 달아오르고 불티가 날린다 ───────── */
/** 효과 코드 → 배경 장면 (묵룡 dragon 은 영상이라 없음) */
export const CARD_SCENES: Partial<Record<string, () => ReactNode>> = {
  sakura: SakuraScene,
};
