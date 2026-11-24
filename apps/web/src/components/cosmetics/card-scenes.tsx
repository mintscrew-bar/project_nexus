"use client";

/**
 * 카드 장식 배경 장면 (2026-11-24 「허접한 장식」 다시 그리기).
 *
 * 예전 카드 장식은 어두운 바탕 위에 작은 픽셀 그림(슬라임·박쥐…)만 떠 있어 허전했다.
 * 묵룡·기사처럼 카드 전체를 채우는 장면을 코드(SVG + CSS 애니메이션)로 그려 그 뒤에 깐다.
 * 움직이는 캐릭터(effects.tsx 의 기존 그림)는 그대로 장면 위에서 논다.
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

/** 반짝이는 별·반딧불 */
function Twinkles({
  seed,
  count,
  color,
  area = [0, 0, 220, 120],
  r = [0.6, 1.4],
}: {
  seed: number;
  count: number;
  color: string;
  area?: [number, number, number, number];
  r?: [number, number];
}) {
  const rnd = seeded(seed);
  return (
    <g>
      {Array.from({ length: count }, (_, i) => (
        <circle
          key={i}
          cx={area[0] + rnd() * (area[2] - area[0])}
          cy={area[1] + rnd() * (area[3] - area[1])}
          r={r[0] + rnd() * (r[1] - r[0])}
          fill={color}
          className="cfx-scene-twinkle"
          style={{
            animationDuration: `${2 + rnd() * 3}s`,
            animationDelay: `${-rnd() * 4}s`,
          }}
        />
      ))}
    </g>
  );
}

/* ───────── 슬라임 — 해 질 녘 풀밭, 거품이 보글보글 ───────── */
export function SlimeScene() {
  const u = useId().replace(/:/g, "");
  return (
    <Scene>
      <defs>
        <linearGradient id={`${u}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#173a2c" />
          <stop offset="0.55" stopColor="#2c6a45" />
          <stop offset="1" stopColor="#1b3f25" />
        </linearGradient>
        <radialGradient id={`${u}-sun`} cx="0.75" cy="0.22" r="0.5">
          <stop offset="0" stopColor="#e9ffb0" stopOpacity="0.55" />
          <stop offset="1" stopColor="#e9ffb0" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="220" height="216" fill={`url(#${u}-sky)`} />
      <rect width="220" height="216" fill={`url(#${u}-sun)`} />
      <Twinkles seed={3} count={10} color="#d9ff9a" area={[0, 20, 220, 140]} />
      {/* 겹친 언덕 */}
      <path d="M0 132 Q55 104 110 126 T220 118 V216 H0Z" fill="#245a37" />
      <path d="M0 150 Q70 128 140 148 T220 142 V216 H0Z" fill="#1d4a2d" />
      <path d="M0 172 Q60 158 120 170 T220 166 V216 H0Z" fill="#163a23" />
      {/* 풀포기 */}
      {[18, 46, 88, 132, 170, 204].map((x, i) => (
        <path
          key={x}
          d={`M${x} ${172 - (i % 2) * 4} l3 -10 l2 10 l3 -8 l2 8`}
          stroke="#4f9a5c"
          strokeWidth="1.4"
          fill="none"
          className="cfx-scene-sway"
          style={{ animationDelay: `${-i * 0.6}s`, transformBox: "fill-box" }}
        />
      ))}
      <Rising seed={11} count={12} color="#9dffb4" r={[1.4, 3.4]} y0={200} />
    </Scene>
  );
}

/* ───────── 유령 — 달밤의 묘지, 안개가 흐르고 혼불이 떠다닌다 ───────── */
export function GhostScene() {
  const u = useId().replace(/:/g, "");
  return (
    <Scene>
      <defs>
        <linearGradient id={`${u}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141a2a" />
          <stop offset="1" stopColor="#3a4560" />
        </linearGradient>
        <radialGradient id={`${u}-moon`} cx="0.8" cy="0.16" r="0.32">
          <stop offset="0" stopColor="#dfe8ff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#dfe8ff" stopOpacity="0" />
        </radialGradient>
        <filter id={`${u}-blur`}>
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <rect width="220" height="216" fill={`url(#${u}-sky)`} />
      <rect width="220" height="216" fill={`url(#${u}-moon)`} />
      <Twinkles seed={5} count={14} color="#c9d6ff" />
      {/* 초승달 */}
      <path
        d="M184 22a16 16 0 1 0 0 30a12 12 0 1 1 0-30z"
        fill="#eef3ff"
        opacity="0.9"
      />
      {/* 묘비·마른 나무 그림자 */}
      <g fill="#1a2134">
        <path d="M22 168 v-20 a10 10 0 0 1 20 0 v20z" />
        <path d="M168 170 v-16 a8 8 0 0 1 16 0 v16z" />
        <rect x="196" y="150" width="4" height="20" />
        <rect x="190" y="156" width="16" height="4" />
        <path
          d="M58 170 q-2 -40 6 -62 M64 120 l-14 -10 M62 132 l12 -8"
          stroke="#1a2134"
          strokeWidth="3"
          fill="none"
        />
      </g>
      <rect y="166" width="220" height="50" fill="#161c2c" />
      {/* 흐르는 안개 */}
      <g filter={`url(#${u}-blur)`} opacity="0.55">
        <ellipse
          cx="60"
          cy="160"
          rx="70"
          ry="10"
          fill="#9fb0d6"
          className="cfx-scene-drift"
        />
        <ellipse
          cx="170"
          cy="176"
          rx="80"
          ry="9"
          fill="#8a9cc4"
          className="cfx-scene-drift"
          style={{ animationDelay: "-6s", animationDuration: "16s" }}
        />
      </g>
      {/* 혼불 */}
      <Rising
        seed={21}
        count={6}
        color="#a8e6ff"
        r={[1.6, 2.6]}
        dur={[8, 13]}
        y0={190}
        className="cfx-scene-wisp"
      />
    </Scene>
  );
}

/* ───────── 벚꽃 — 노을 진 산, 꽃가지가 드리우고 꽃잎이 흩날린다 ───────── */
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
export function FireScene() {
  const u = useId().replace(/:/g, "");
  return (
    <Scene>
      <defs>
        <linearGradient id={`${u}-bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#140604" />
          <stop offset="0.6" stopColor="#4a1608" />
          <stop offset="1" stopColor="#8c2a0c" />
        </linearGradient>
        <radialGradient id={`${u}-glow`} cx="0.5" cy="1" r="0.75">
          <stop offset="0" stopColor="#ffb347" stopOpacity="0.85" />
          <stop offset="0.45" stopColor="#ff5a1f" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ff5a1f" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="220" height="216" fill={`url(#${u}-bg)`} />
      <rect
        width="220"
        height="216"
        fill={`url(#${u}-glow)`}
        className="cfx-scene-pulse"
      />
      {/* 타오르는 바위 능선 */}
      <path
        d="M0 176 L30 160 L52 172 L84 150 L118 168 L150 152 L184 170 L220 158 V216 H0Z"
        fill="#2a0c05"
      />
      <Rising
        seed={29}
        count={18}
        color="#ffb04a"
        r={[0.8, 1.8]}
        dur={[3, 6]}
        y0={210}
        className="cfx-scene-ember"
      />
      <Rising
        seed={31}
        count={8}
        color="#ffe08a"
        r={[0.6, 1.2]}
        dur={[2.5, 4.5]}
        y0={210}
        className="cfx-scene-ember"
      />
    </Scene>
  );
}

/* ───────── 박쥐 — 보랏빛 밤하늘의 큰 달과 고성 지붕 ───────── */
export function BatsScene() {
  const u = useId().replace(/:/g, "");
  return (
    <Scene>
      <defs>
        <linearGradient id={`${u}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0e0a1f" />
          <stop offset="1" stopColor="#3b2a57" />
        </linearGradient>
        <radialGradient id={`${u}-moon`} cx="0.18" cy="0.2" r="0.42">
          <stop offset="0" stopColor="#ffd9a8" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ffd9a8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="220" height="216" fill={`url(#${u}-sky)`} />
      <rect
        width="220"
        height="216"
        fill={`url(#${u}-moon)`}
        className="cfx-scene-pulse"
      />
      <Twinkles seed={13} count={16} color="#e6dcff" />
      {/* 큰 달 */}
      <circle cx="40" cy="42" r="28" fill="#f7d7a3" />
      <circle cx="32" cy="36" r="5" fill="#e6c18a" opacity="0.7" />
      <circle cx="50" cy="52" r="3.5" fill="#e6c18a" opacity="0.6" />
      {/* 고성 지붕 실루엣 */}
      <g fill="#140e24">
        <path d="M0 160 L22 160 L22 128 L30 112 L38 128 L38 160 L70 160 L70 140 L86 140 L86 160 L220 160 V216 H0Z" />
        <path d="M150 160 L150 120 L160 98 L170 120 L170 160z" />
        <path d="M180 160 L180 134 L192 120 L204 134 L204 160z" />
      </g>
    </Scene>
  );
}

/* ───────── 검 — 강철빛 하늘을 가르는 빛줄기와 거대한 검의 그림자 ───────── */
export function SwordScene() {
  const u = useId().replace(/:/g, "");
  return (
    <Scene>
      <defs>
        <linearGradient id={`${u}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#141b27" />
          <stop offset="1" stopColor="#3c4a60" />
        </linearGradient>
        <linearGradient id={`${u}-ray`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#dbe8ff" stopOpacity="0.32" />
          <stop offset="1" stopColor="#dbe8ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="220" height="216" fill={`url(#${u}-bg)`} />
      {/* 위에서 떨어지는 빛줄기(천천히 일렁) */}
      <g className="cfx-scene-rays" style={{ transformOrigin: "110px -20px" }}>
        {[-40, -18, 6, 28, 50].map((a) => (
          <path
            key={a}
            d="M110 -20 L100 216 L120 216Z"
            fill={`url(#${u}-ray)`}
            transform={`rotate(${a} 110 -20)`}
          />
        ))}
      </g>
      {/* 뒤에 선 거대한 검의 그림자 */}
      <g opacity="0.35" fill="#0b1018">
        <path d="M106 18 L114 18 L116 150 L110 166 L104 150Z" />
        <rect x="88" y="150" width="44" height="6" rx="2" />
        <rect x="107" y="156" width="6" height="24" />
      </g>
      {/* 땅에 꽂힌 검들 */}
      <g stroke="#55657e" strokeWidth="2.4" strokeLinecap="round">
        <path d="M30 172 L40 140 M26 152 l14 4" />
        <path d="M190 172 L182 142 M176 150 l14 -2" />
      </g>
      <rect y="170" width="220" height="46" fill="#10151f" />
      <Rising
        seed={37}
        count={10}
        color="#c9dbff"
        r={[0.6, 1.3]}
        dur={[6, 10]}
        y0={200}
      />
    </Scene>
  );
}

/* ───────── 번개 — 먹구름이 몰려오고 비가 긋는다 ───────── */
export function LightningScene() {
  const u = useId().replace(/:/g, "");
  const rnd = seeded(41);
  return (
    <Scene>
      <defs>
        <linearGradient id={`${u}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#070c1c" />
          <stop offset="1" stopColor="#1e2f5c" />
        </linearGradient>
        <filter id={`${u}-blur`}>
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <rect width="220" height="216" fill={`url(#${u}-sky)`} />
      {/* 번쩍 — 하늘 전체가 가끔 밝아진다 */}
      <rect
        width="220"
        height="216"
        fill="#cfe0ff"
        className="cfx-scene-flash"
      />
      {/* 먹구름 */}
      <g
        filter={`url(#${u}-blur)`}
        className="cfx-scene-drift"
        style={{ animationDuration: "22s" }}
      >
        <ellipse cx="40" cy="24" rx="60" ry="22" fill="#4a5680" />
        <ellipse cx="120" cy="16" rx="70" ry="24" fill="#56628c" />
        <ellipse cx="200" cy="28" rx="56" ry="20" fill="#465279" />
        <ellipse cx="80" cy="44" rx="70" ry="16" fill="#323d63" />
        <ellipse cx="170" cy="50" rx="60" ry="14" fill="#323d63" />
      </g>
      {/* 먼 번개 줄기 — 하늘이 번쩍일 때 같이 보인다(양옆, 가운데는 사진 자리) */}
      <g
        className="cfx-scene-flash-bolt"
        stroke="#e6efff"
        strokeWidth="2"
        fill="none"
        strokeLinejoin="round"
        style={{ filter: "drop-shadow(0 0 4px #9fc0ff)" }}
      >
        <path d="M30 50 L22 84 L34 86 L20 126 L40 92 L28 90 L38 50" />
        <path d="M192 56 L200 88 L188 90 L204 130" />
      </g>
      {/* 빗줄기 */}
      <g stroke="#8fb2ff" strokeWidth="0.8" opacity="0.5">
        {Array.from({ length: 28 }, (_, i) => {
          const x = rnd() * 240;
          const d = 0.7 + rnd() * 0.6;
          return (
            <line
              key={i}
              x1={x}
              y1={-20}
              x2={x - 6}
              y2={0}
              className="cfx-scene-rain"
              style={{
                animationDuration: `${d}s`,
                animationDelay: `${-rnd() * d}s`,
              }}
            />
          );
        })}
      </g>
      <rect y="176" width="220" height="40" fill="#0b1224" />
    </Scene>
  );
}

/** 효과 코드 → 배경 장면 (묵룡 dragon 은 영상이라 없음) */
export const CARD_SCENES: Partial<Record<string, () => ReactNode>> = {
  slime: SlimeScene,
  ghost: GhostScene,
  sakura: SakuraScene,
  fire: FireScene,
  bats: BatsScene,
  sword: SwordScene,
  lightning: LightningScene,
};
