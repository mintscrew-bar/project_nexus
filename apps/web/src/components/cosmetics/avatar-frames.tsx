"use client";

import { useId, type CSSProperties, type ReactNode } from "react";

/**
 * 아바타 장식 그림 (벡터, 2026-11-19 다시 그림).
 *
 * 예전 그림은 아바타 지름의 1/48 칸으로 찍은 작은 픽셀이라 장식이 조그맣고 아바타와 따로
 * 떠 보였다(운영자: "엉성하다, 아바타와 안 어울린다, 값어치가 안 난다"). 이제는
 * **아바타를 감싸는 고리 + 그 고리에 붙은 장식** 으로 그려 테두리처럼 한 몸으로 보이게 한다.
 *
 * 좌표: 아바타 중심이 (0,0), 아바타 반지름이 50 인 viewBox(-100~100). 그림 상자는 아바타
 * 지름의 2배라서 장식이 둘레 여백(반지름 50~100)에 들어간다 — 규격 가이드(384×384,
 * 가운데 192 원)와 같은 비율이다.
 *
 * 층: 뒤(z 0) → 아바타(z 10) → 앞(z 20). 움직임은 globals.css 의 `.cfx-av-*`.
 * SVG 안 그룹에 CSS 움직임을 걸 때는 위치는 바깥 g 의 transform 속성으로, 움직임은 안쪽 g 로
 * 나눈다(CSS transform 이 transform 속성을 덮어쓰기 때문).
 */

const BACK: CSSProperties = { zIndex: 0 };
const FRONT: CSSProperties = { zIndex: 20 };

/** 아바타 지름(size)의 2배 상자에 viewBox(-100~100) SVG 를 깐다 */
function Layer({
  size,
  front,
  children,
  style,
  className,
}: {
  size: number;
  front?: boolean;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <svg
      viewBox="-100 -100 200 200"
      width={size * 2}
      height={size * 2}
      className={`absolute overflow-visible ${className ?? ""}`}
      style={{
        ...(front ? FRONT : BACK),
        left: -size / 2,
        top: -size / 2,
        ...style,
      }}
    >
      {children}
    </svg>
  );
}

/** 움직이는 그룹 — 자기 상자 기준으로 축을 잡는다 */
function Anim({
  className,
  origin = "50% 50%",
  delay,
  duration,
  children,
}: {
  className: string;
  origin?: string;
  delay?: string;
  duration?: string;
  children: ReactNode;
}) {
  return (
    <g
      className={className}
      style={{
        transformBox: "fill-box",
        transformOrigin: origin,
        animationDelay: delay,
        animationDuration: duration,
      }}
    >
      {children}
    </g>
  );
}

/** 네 갈래 반짝임 */
function Glint({
  x,
  y,
  r,
  color,
  delay,
}: {
  x: number;
  y: number;
  r: number;
  color: string;
  delay: string;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <Anim className="cfx-twinkle" delay={delay} duration="2.2s">
        <path
          d={`M0 ${-r} Q${r * 0.18} ${-r * 0.18} ${r} 0 Q${r * 0.18} ${r * 0.18} 0 ${r} Q${-r * 0.18} ${r * 0.18} ${-r} 0 Q${-r * 0.18} ${-r * 0.18} 0 ${-r}Z`}
          fill={color}
        />
      </Anim>
    </g>
  );
}

/* ───────── 고양이 귀 (입문) ───────── */

function Ear({ id }: { id: string }) {
  // 밑변 가운데가 (0,0), 위로 솟는 귀
  return (
    <>
      <path
        d="M-17 2 C-15 -14 -8 -30 -1 -36 C3 -33 13 -18 17 2 Z"
        fill={`url(#${id}-fur)`}
        stroke="#7a3d10"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M-9 -1 C-7 -12 -3 -22 0 -26 C3 -22 8 -12 9 -1 Z"
        fill="#ffb7c5"
      />
      <path
        d="M-3 -8 L-1 -22 M3 -8 L1 -20"
        stroke="#fff3e6"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.7"
      />
    </>
  );
}

/** 주황 고리 위로 귀 둘이 쫑긋, 아래로 꼬리가 살랑, 목에 작은 방울 */
export function CatEarsFrame({ size }: { size: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <>
      <Layer size={size}>
        <defs>
          <linearGradient id={`${id}-fur`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#e2731f" />
            <stop offset="1" stopColor="#ffb562" />
          </linearGradient>
          <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffc277" />
            <stop offset="1" stopColor="#d9661c" />
          </linearGradient>
        </defs>
        {/* 꼬리 — 오른쪽 아래 고리에서 말려 나온다 */}
        <g transform="translate(40 34)">
          <Anim className="cfx-av-sway" origin="0% 0%">
            <path
              d="M0 0 C18 10 30 4 32 -10 C34 -22 26 -26 22 -20"
              fill="none"
              stroke="#7a3d10"
              strokeWidth="10"
              strokeLinecap="round"
            />
            <path
              d="M0 0 C18 10 30 4 32 -10 C34 -22 26 -26 22 -20"
              fill="none"
              stroke={`url(#${id}-fur)`}
              strokeWidth="7"
              strokeLinecap="round"
            />
          </Anim>
        </g>
        {/* 귀 — 고리 위 양쪽(±38°) */}
        <g transform="rotate(-38) translate(0 -50)">
          <Anim className="cfx-av-twitch" origin="50% 100%">
            <Ear id={id} />
          </Anim>
        </g>
        <g transform="rotate(38) translate(0 -50)">
          <Anim className="cfx-av-twitch" origin="50% 100%" delay="-1.1s">
            <Ear id={id} />
          </Anim>
        </g>
      </Layer>
      <Layer size={size} front>
        <circle
          r="52.5"
          fill="none"
          stroke="#7a3d10"
          strokeWidth="6"
          opacity="0.55"
        />
        <circle
          r="52.5"
          fill="none"
          stroke={`url(#${id}-ring)`}
          strokeWidth="3.5"
        />
        {/* 방울 — 목(아래 가운데) */}
        <g transform="translate(0 55)">
          <path
            d="M-9 -4 Q0 2 9 -4"
            fill="none"
            stroke="#c0263b"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <circle
            r="6.5"
            cy="3"
            fill="#f6c443"
            stroke="#8a5a08"
            strokeWidth="1.3"
          />
          <path d="M-4 4 H4" stroke="#8a5a08" strokeWidth="1.2" />
          <circle r="1.6" cx="-2" cy="0.5" fill="#fff7d6" />
        </g>
      </Layer>
    </>
  );
}

/* ───────── 공전하는 달 (입문) ───────── */

/** 여덟 위상의 달이 고정된 자리에서 차례로 빛나는 아바타 장식. */
export function LunarPhasesFrame({ size }: { size: number }) {
  const id = useId().replace(/:/g, "");
  // 위쪽의 삭에서 시계 방향으로 차고, 아래 보름달을 지나 다시 기운다.
  const phases = [null, 0.72, 0, -0.72, -1, -0.72, 0, 0.72];
  const radius = 10;
  return (
    <Layer size={size} front className="pointer-events-none cfx-deco">
      <defs>
        <radialGradient id={`${id}-lunar-gold`} cx="35%" cy="25%" r="80%">
          <stop offset="0" stopColor="#fffdf0" />
          <stop offset="0.58" stopColor="#f4deb2" />
          <stop offset="1" stopColor="#bd946a" />
        </radialGradient>
        <radialGradient id={`${id}-lunar-full`} cx="50%" cy="45%" r="55%">
          <stop offset="0" stopColor="#fffdf0" />
          <stop offset="0.72" stopColor="#f6e5c4" />
          <stop offset="1" stopColor="#d8c29f" />
        </radialGradient>
        <radialGradient id={`${id}-lunar-shadow`} cx="35%" cy="28%" r="80%">
          <stop offset="0" stopColor="#56647b" />
          <stop offset="0.6" stopColor="#303b52" />
          <stop offset="1" stopColor="#151d30" />
        </radialGradient>
        <mask
          id={`${id}-moon-clearance`}
          maskUnits="userSpaceOnUse"
          x="-100"
          y="-100"
          width="200"
          height="200"
        >
          <rect x="-100" y="-100" width="200" height="200" fill="white" />
          {phases.map((_, index) => {
            const angle = (index * Math.PI) / 4 - Math.PI / 2;
            return (
              <circle
                key={index}
                cx={Math.cos(angle) * 70}
                cy={Math.sin(angle) * 70}
                r={radius + 1}
                fill="black"
              />
            );
          })}
        </mask>
      </defs>
      {/* 아바타 지름은 그대로 두고 장식만 축소해 카드 안쪽 여백을 확보한다. */}
      <g transform="scale(0.86)">
        {/* 달 뒤에 천구와 별자리를 깔아 타로 카드 같은 인장을 만든다. */}
        <g mask={`url(#${id}-moon-clearance)`}>
          <circle
            r="70"
            fill="none"
            stroke="#cda967"
            strokeWidth="0.65"
            opacity="0.48"
          />
          <circle
            r="65"
            fill="none"
            stroke="#a78f72"
            strokeWidth="0.4"
            strokeDasharray="1 4"
            opacity="0.55"
          />
          <circle
            r="54"
            fill="none"
            stroke="#e4c481"
            strokeWidth="1"
            opacity="0.72"
          />
          {/* 끊어진 바깥 테두리와 작은 눈금으로 천체 관측기 같은 질감을 더한다. */}
          <circle
            r="79"
            fill="none"
            stroke="#d7b77b"
            strokeWidth="0.55"
            strokeDasharray="11 51.05"
            strokeDashoffset="5.5"
            opacity="0.6"
          />
          {Array.from({ length: 16 }, (_, index) => (
            <path
              key={`tick-${index}`}
              d={index % 2 === 0 ? "M0 -58 L0 -61" : "M0 -59 L0 -60.5"}
              transform={`rotate(${index * 22.5})`}
              stroke="#e6c88f"
              strokeWidth="0.65"
              opacity="0.7"
            />
          ))}
          {/* 달 사이마다 작은 마름모와 바깥쪽으로 뻗는 인장 장식. */}
          {Array.from({ length: 8 }, (_, index) => {
            const angle = ((index + 0.5) * Math.PI) / 4 - Math.PI / 2;
            const x = Math.cos(angle) * 70;
            const y = Math.sin(angle) * 70;
            const major = index % 2 === 0;
            return (
              <g key={`star-${index}`} transform={`translate(${x} ${y})`}>
                <g transform={`rotate(${(index + 0.5) * 45})`}>
                  <path
                    d="M0 -5 L0 -9 M0 5 L0 10"
                    fill="none"
                    stroke="#d7b77b"
                    strokeWidth="0.75"
                    opacity="0.75"
                  />
                  <path
                    d="M0 -5 L2.4 0 L0 5 L-2.4 0 Z"
                    fill="#242439"
                    stroke="#d7b77b"
                    strokeWidth="0.7"
                  />
                </g>
                <path
                  d={
                    major
                      ? "M0 -4.8 Q0.65 -0.65 3.5 0 Q0.65 0.65 0 4.8 Q-0.65 0.65 -3.5 0 Q-0.65 -0.65 0 -4.8Z"
                      : "M0 -2.8 Q0.5 -0.5 2.2 0 Q0.5 0.5 0 2.8 Q-0.5 0.5 -2.2 0 Q-0.5 -0.5 0 -2.8Z"
                  }
                  fill="#fbe2a3"
                  className="cfx-scene-twinkle"
                  style={{ animationDelay: `${index * -0.4}s` }}
                />
              </g>
            );
          })}
        </g>
        {phases.map((phase, index) => {
          const angle = (index * Math.PI) / 4 - Math.PI / 2;
          const x = Math.cos(angle) * 70;
          const y = Math.sin(angle) * 70;
          const mirror = index > 4 ? -1 : 1;
          const litPath =
            phase === null
              ? ""
              : phase === -1
                ? `M 0 ${-radius} A ${radius} ${radius} 0 1 1 0 ${radius} A ${radius} ${radius} 0 1 1 0 ${-radius} Z`
                : phase === 0
                  ? `M 0 ${-radius} A ${radius} ${radius} 0 0 1 0 ${radius} L 0 ${-radius} Z`
                  : `M 0 ${-radius} A ${radius} ${radius} 0 0 1 0 ${radius} A ${Math.abs(phase) * radius} ${radius} 0 0 ${phase > 0 ? 0 : 1} 0 ${-radius} Z`;
          return (
            <g key={index} transform={`translate(${x} ${y})`}>
              <circle
                r={radius}
                fill={`url(#${id}-lunar-shadow)`}
                opacity={phase === null ? 0.7 : 0.3}
              />
              {phase === null && (
                <g className="cfx-lunar-eclipse">
                  <circle
                    r={radius + 1.1}
                    fill="none"
                    stroke="#e68d5a"
                    strokeWidth="2"
                    opacity="0.65"
                  />
                  <circle
                    r={radius + 0.2}
                    fill="none"
                    stroke="#ffe4a2"
                    strokeWidth="0.85"
                  />
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
                    <path
                      key={angle}
                      d="M0 -11.8 L0 -14.5"
                      transform={`rotate(${angle})`}
                      stroke="#ffce82"
                      strokeWidth="0.8"
                      strokeLinecap="round"
                    />
                  ))}
                </g>
              )}
              {phase !== null && (
                <g transform={`scale(${mirror} 1)`}>
                  <defs>
                    <clipPath id={`${id}-phase-${index}`}>
                      <path d={litPath} />
                    </clipPath>
                  </defs>
                  <path
                    d={litPath}
                    fill="#fff2bb"
                    className="cfx-lunar-phase-glow"
                    style={{ animationDelay: `${index}s` }}
                  />
                  <path
                    d={litPath}
                    fill={`url(#${id}-${phase === -1 ? "lunar-full" : "lunar-gold"})`}
                  />
                  <g
                    clipPath={`url(#${id}-phase-${index})`}
                    fill="#9b846e"
                    opacity={phase === -1 ? 0.17 : 0.26}
                  >
                    <path d="M-6-4 Q-5-7 -2-6 L0-5 Q2-4 1-2 L-1 0 Q-4 0 -5-1 Z" />
                    <path d="M3-5 Q6-5 7-2 L6 1 Q4 2 2 0 L2-2 Z" />
                    <path d="M-4 3 Q-2 1 0 2 L3 3 L2 5 Q0 7-3 6 Z" />
                    <circle cx="5" cy="4.5" r="1.1" />
                    <circle cx="-5.5" cy="1" r="0.7" />
                  </g>
                  <circle
                    cx="-2.8"
                    cy="3.8"
                    r="1.1"
                    fill="none"
                    stroke="#fff7de"
                    strokeOpacity="0.55"
                    strokeWidth="0.45"
                    clipPath={`url(#${id}-phase-${index})`}
                  />
                  {phase === -1 ? (
                    <circle
                      r={radius}
                      fill="none"
                      stroke="#fff9e7"
                      strokeOpacity="0.7"
                      strokeWidth="0.55"
                    />
                  ) : (
                    <path
                      d={`M 0 ${-radius} A ${radius} ${radius} 0 0 1 0 ${radius}`}
                      fill="none"
                      stroke="#fff9e7"
                      strokeOpacity="0.7"
                      strokeWidth="0.55"
                    />
                  )}
                </g>
              )}
            </g>
          );
        })}
      </g>
    </Layer>
  );
}

/** 은빛 고리 둘레 궤도를 초승달이 돌고, 별이 번갈아 반짝인다 */
export function MoonFrame({ size }: { size: number }) {
  const id = useId().replace(/:/g, "");
  // 궤도 회전 — 회전 중심을 그림 상자(fill-box)가 아니라 viewBox 가운데(0,0 = 아바타 중심)로.
  // 예전엔 fill-box 라 달이 붙은 쪽으로 상자가 기울어 궤도가 찌그러져 돌았다(2026-11-24)
  const orbit: CSSProperties = {
    transformBox: "view-box",
    // view-box 의 퍼센트는 viewBox 의 x·y 가 아니라 좌표 원점에서 잰다 — 가운데(0,0)를 그대로 준다
    transformOrigin: "0px 0px",
    animationDuration: "16s",
  };
  return (
    <>
      {/* 궤도 — 점선 원 */}
      <Layer size={size}>
        <circle
          r="70"
          fill="none"
          stroke="#9fb7e8"
          strokeWidth="1"
          strokeDasharray="1.5 5"
          opacity="0.55"
        />
      </Layer>
      <Layer size={size} front>
        <defs>
          <radialGradient id={`${id}-moon`} cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#fffdf0" />
            <stop offset="0.6" stopColor="#f6dc8a" />
            <stop offset="1" stopColor="#d9a93a" />
          </radialGradient>
          <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#eef4ff" />
            <stop offset="1" stopColor="#7d93c4" />
          </linearGradient>
          {/* 초승달 — 둥근 달에서 오른쪽 위로 비킨 원을 도려낸다(하늘의 🌙 모양) */}
          <mask id={`${id}-cut`}>
            <rect x="-30" y="-30" width="60" height="60" fill="#fff" />
            <circle cx="6.5" cy="-4" r="13" fill="#000" />
          </mask>
        </defs>
        {/* 은빛 고리 */}
        <circle
          r="52.5"
          fill="none"
          stroke="#1d2a4a"
          strokeWidth="5.5"
          opacity="0.6"
        />
        <circle
          r="52.5"
          fill="none"
          stroke={`url(#${id}-ring)`}
          strokeWidth="3"
        />
        {/* 궤도를 도는 달 — 늘 똑바로 선 초승달 */}
        <g className="cfx-spin" style={orbit}>
          {/* 빛은 도려낸 초승달 모양을 따라만 번지게 — 바깥 g 에 그림자를 건다
              (달 뒤에 원을 깔면 도려낸 안쪽에 회색 원판이 비쳤다) */}
          <g
            transform="translate(0 -70)"
            style={{ filter: "drop-shadow(0 0 4px rgba(255,236,160,0.85))" }}
          >
            {/* 궤도를 도는 만큼 거꾸로 돌려 달은 늘 똑바로 선다 */}
            <g
              className="cfx-spin-rev"
              style={{
                transformBox: "fill-box",
                transformOrigin: "50% 50%",
                animationDuration: "16s",
              }}
            >
              <circle
                r="15"
                fill={`url(#${id}-moon)`}
                mask={`url(#${id}-cut)`}
              />
            </g>
          </g>
          {/* 달을 따라오는 작은 별 둘 */}
          <Glint x={-24} y={-66} r={3} color="#ffffff" delay="-0.4s" />
          <Glint x={22} y={-67} r={2.4} color="#dbe8ff" delay="-1.2s" />
        </g>
        <Glint x={-46} y={-60} r={3.5} color="#ffffff" delay="-0.3s" />
        <Glint x={58} y={48} r={3} color="#cfe0ff" delay="-1.8s" />
      </Layer>
    </>
  );
}

/* ───────── 반짝 왕관 (일반) ───────── */

/** 금 고리에 박힌 장식 + 머리 위에 비스듬히 얹힌 보석 왕관 */
export function CrownFrame({ size }: { size: number }) {
  const id = useId().replace(/:/g, "");
  const studs = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <Layer size={size} front>
      <defs>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff4b8" />
          <stop offset="0.45" stopColor="#f2c14a" />
          <stop offset="1" stopColor="#a8701a" />
        </linearGradient>
        <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff0a8" />
          <stop offset="0.5" stopColor="#e2aa32" />
          <stop offset="1" stopColor="#8a5a10" />
        </linearGradient>
      </defs>
      <circle
        r="53"
        fill="none"
        stroke="#4a2f05"
        strokeWidth="7"
        opacity="0.6"
      />
      <circle
        r="53"
        fill="none"
        stroke={`url(#${id}-ring)`}
        strokeWidth="4.5"
      />
      {studs.map((a) => (
        <circle
          key={a}
          cx={Math.sin((a * Math.PI) / 180) * 53}
          cy={-Math.cos((a * Math.PI) / 180) * 53}
          r={a % 90 === 0 ? 3 : 1.8}
          fill={a % 90 === 0 ? "#d22e45" : "#fff6cf"}
          stroke="#6b4508"
          strokeWidth="0.8"
        />
      ))}
      {/* 왕관 — 고리 위 오른쪽으로 기울여 얹는다 */}
      <g transform="rotate(14) translate(0 -58)">
        <Anim className="cfx-av-bob" origin="50% 100%">
          <path
            d="M-30 0 L-33 -26 L-18 -12 L-9 -33 L0 -16 L9 -33 L18 -12 L33 -26 L30 0 Z"
            fill={`url(#${id}-gold)`}
            stroke="#6b4508"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <rect
            x="-30"
            y="-8"
            width="60"
            height="9"
            rx="2"
            fill="#c98a1e"
            stroke="#6b4508"
            strokeWidth="1.4"
          />
          {[-33, -9, 9, 33].map((x) => (
            <circle
              key={x}
              cx={x}
              cy={x === -33 || x === 33 ? -27 : -34}
              r="3"
              fill="#fff6d8"
              stroke="#6b4508"
              strokeWidth="1"
            />
          ))}
          <circle
            cx="0"
            cy="-4"
            r="4"
            fill="#d22e45"
            stroke="#6b0e1c"
            strokeWidth="1"
          />
          <circle
            cx="-17"
            cy="-4"
            r="3"
            fill="#2f7be0"
            stroke="#123a75"
            strokeWidth="1"
          />
          <circle
            cx="17"
            cy="-4"
            r="3"
            fill="#25b26b"
            stroke="#0c5230"
            strokeWidth="1"
          />
          <path
            d="M-24 -6 L-20 -20"
            stroke="#fffbe6"
            strokeWidth="1.4"
            strokeLinecap="round"
            opacity="0.8"
          />
          <Glint x={-9} y={-36} r={5} color="#ffffff" delay="0s" />
          <Glint x={33} y={-29} r={4} color="#fff3c4" delay="-1.1s" />
        </Anim>
      </g>
    </Layer>
  );
}

/* ───────── 천사 고리 (일반) ───────── */

function Wing({ id }: { id: string }) {
  // 오른쪽 날개. (0,0) 이 몸에 붙는 자리
  const feathers = [
    { d: "M0 0 C14 -22 34 -30 44 -26 C38 -16 22 -6 0 4 Z", o: 1 },
    { d: "M0 4 C16 -8 34 -12 46 -8 C38 2 22 8 0 10 Z", o: 0.95 },
    { d: "M0 10 C14 4 30 4 40 8 C32 16 18 18 0 16 Z", o: 0.9 },
  ];
  return (
    <>
      {feathers.map((f) => (
        <path
          key={f.d}
          d={f.d}
          fill={`url(#${id}-feather)`}
          stroke="#d9b866"
          strokeWidth="1"
          opacity={f.o}
        />
      ))}
    </>
  );
}

/** 흰금 이중 고리 + 양옆 작은 날개 + 머리 위에서 떠오르는 후광 */
export function HaloFrame({ size }: { size: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <>
      <Layer size={size}>
        <defs>
          <linearGradient id={`${id}-feather`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fffdf4" />
            <stop offset="1" stopColor="#f3e6c0" />
          </linearGradient>
        </defs>
        <g transform="translate(46 -6)">
          <Anim className="cfx-av-flap-r" origin="0% 50%">
            <Wing id={id} />
          </Anim>
        </g>
        <g transform="translate(-46 -6) scale(-1 1)">
          <Anim className="cfx-av-flap-r" origin="0% 50%">
            <Wing id={id} />
          </Anim>
        </g>
      </Layer>
      <Layer size={size} front>
        <defs>
          <linearGradient id={`${id}-halo`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ffe9a8" />
            <stop offset="0.5" stopColor="#fffbe8" />
            <stop offset="1" stopColor="#ffd77a" />
          </linearGradient>
        </defs>
        <circle
          r="57.5"
          fill="none"
          stroke="#fff3cf"
          strokeWidth="1"
          opacity="0.6"
        />
        <circle
          r="52.5"
          fill="none"
          stroke="#a8823a"
          strokeWidth="5"
          opacity="0.5"
        />
        <circle r="52.5" fill="none" stroke="#fff3cf" strokeWidth="3" />
        <g transform="translate(0 -76)">
          <Anim className="cfx-halo-float">
            <ellipse
              rx="32"
              ry="8"
              fill="none"
              stroke={`url(#${id}-halo)`}
              strokeWidth="5"
              style={{
                filter:
                  "drop-shadow(0 0 3px rgba(255,230,150,1)) drop-shadow(0 0 8px rgba(255,210,110,0.7))",
              }}
            />
          </Anim>
        </g>
        <Glint x={-62} y={-40} r={4} color="#fff7d6" delay="0s" />
        <Glint x={64} y={36} r={3.5} color="#ffffff" delay="-0.8s" />
        <Glint x={-40} y={62} r={3} color="#fff7d6" delay="-1.5s" />
      </Layer>
    </>
  );
}

/* ───────── 불꽃 고리 — 불길 아래 깔리는 달군 쇠 고리 ───────── */

export function EmberRing({ size }: { size: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <Layer size={size} front>
      <defs>
        <linearGradient id={`${id}-ember`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ffd36b" />
          <stop offset="0.5" stopColor="#ff7a1f" />
          <stop offset="1" stopColor="#a5200f" />
        </linearGradient>
      </defs>
      <circle
        r="52.5"
        fill="none"
        stroke="#3a0d05"
        strokeWidth="6.5"
        opacity="0.7"
      />
      <circle
        r="52.5"
        fill="none"
        stroke={`url(#${id}-ember)`}
        strokeWidth="4"
      />
    </Layer>
  );
}

/* ───────── 박쥐 날개 (고급) ───────── */

function BatWing({ id }: { id: string }) {
  // 오른쪽 날개. (0,0) 이 고리에 붙는 자리, 위팔뼈를 따라 바깥으로 펼쳐진다
  return (
    <>
      <path
        d="M0 0 L22 -30 L52 -40 L62 -18 C54 -16 50 -10 50 -2 C42 -6 36 -2 34 6 C26 2 20 6 18 14 C12 8 6 6 0 8 Z"
        fill={`url(#${id}-membrane)`}
        stroke="#1a0b2b"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M0 2 L22 -30 L52 -40 M22 -30 L50 -2 M22 -30 L34 6 M22 -30 L18 14"
        fill="none"
        stroke="#9b7ae6"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.9"
      />
      <path d="M52 -40 L56 -47 L58 -39 Z" fill="#cdb8ff" />
    </>
  );
}

/** 가시 박힌 보랏빛 고리 뒤로 박쥐 날개가 크게 펼쳐져 퍼덕인다 */
export function BatWingsFrame({ size }: { size: number }) {
  const id = useId().replace(/:/g, "");
  const spikes = [-150, -120, -60, -30, 30, 60, 120, 150, 180];
  return (
    <>
      <Layer
        size={size}
        style={{ filter: "drop-shadow(0 0 4px rgba(150,100,255,0.55))" }}
      >
        <defs>
          <linearGradient id={`${id}-membrane`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4a2478" />
            <stop offset="1" stopColor="#120820" />
          </linearGradient>
        </defs>
        <g transform="translate(44 -20)">
          <Anim className="cfx-av-flap-r" origin="0% 100%" duration="1.1s">
            <BatWing id={id} />
          </Anim>
        </g>
        <g transform="translate(-44 -20) scale(-1 1)">
          <Anim className="cfx-av-flap-r" origin="0% 100%" duration="1.1s">
            <BatWing id={id} />
          </Anim>
        </g>
      </Layer>
      <Layer size={size} front>
        <defs>
          <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#b48cff" />
            <stop offset="1" stopColor="#3a1966" />
          </linearGradient>
        </defs>
        {spikes.map((a) => (
          <path
            key={a}
            d="M-4 -54 L0 -64 L4 -54 Z"
            transform={`rotate(${a})`}
            fill="#2a1446"
            stroke="#9b7ae6"
            strokeWidth="0.9"
          />
        ))}
        <circle r="53" fill="none" stroke="#12081f" strokeWidth="7" />
        <circle
          r="53"
          fill="none"
          stroke={`url(#${id}-ring)`}
          strokeWidth="3.5"
        />
        <circle
          cx="0"
          cy="-53"
          r="3.4"
          fill="#e23a5a"
          stroke="#4a0716"
          strokeWidth="1"
        />
        <Glint x={0} y={-53} r={5} color="#ff9db0" delay="0s" />
      </Layer>
    </>
  );
}

/* ───────── 교차 검 (고급) ───────── */

function Sword({ id }: { id: string }) {
  // 세로로 선 검, 가운데(0,0)가 교차점. 칼끝이 위(-95)
  return (
    <>
      <path
        d="M-5 30 L-5 -82 L0 -95 L5 -82 L5 30 Z"
        fill={`url(#${id}-blade)`}
        stroke="#3c4656"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M0 26 L0 -86" stroke="#ffffff" strokeWidth="1.2" opacity="0.7" />
      <path
        d="M-18 30 C-10 26 10 26 18 30 L18 36 C10 33 -10 33 -18 36 Z"
        fill={`url(#${id}-gold)`}
        stroke="#6b4508"
        strokeWidth="1.2"
      />
      <rect
        x="-3.5"
        y="36"
        width="7"
        height="22"
        rx="2"
        fill="#5a2e14"
        stroke="#2e1608"
        strokeWidth="1"
      />
      <path
        d="M-3.5 41 H3.5 M-3.5 47 H3.5 M-3.5 53 H3.5"
        stroke="#8a5530"
        strokeWidth="1"
      />
      <circle
        cy="62"
        r="5"
        fill={`url(#${id}-gold)`}
        stroke="#6b4508"
        strokeWidth="1.2"
      />
      <circle cy="62" r="2.2" fill="#3a8cff" />
    </>
  );
}

/** 강철 고리 뒤로 두 검이 엇갈려 있다가, 몇 초마다 맞부딪치며 빛이 번진다 */
export function TwinSwordsFrame({ size }: { size: number }) {
  const id = useId().replace(/:/g, "");
  const rivets = Array.from({ length: 8 }, (_, i) => i * 45 + 22.5);
  return (
    <>
      {/* 검은 하나씩 따로 된 SVG 상자(아바타 중심에 맞춘 정사각형)를 HTML 수준에서 돌린다.
          SVG 안 그룹을 CSS 로 돌리면 브라우저마다 회전축 계산이 달라 X 자가 어긋났다. */}
      {(["cfx-sword-l", "cfx-sword-r"] as const).map((cls) => (
        <Layer
          key={cls}
          size={size}
          style={{
            filter: "drop-shadow(0 0 3px rgba(130,190,255,0.6))",
            transformOrigin: "50% 50%",
          }}
          className={cls}
        >
          <defs>
            <linearGradient
              id={`${id}-${cls}-blade`}
              x1="0"
              y1="0"
              x2="1"
              y2="0"
            >
              <stop offset="0" stopColor="#8d9bb0" />
              <stop offset="0.5" stopColor="#f4f8ff" />
              <stop offset="1" stopColor="#8d9bb0" />
            </linearGradient>
            <linearGradient
              id={`${id}-${cls}-gold`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0" stopColor="#ffe9a0" />
              <stop offset="1" stopColor="#b07a1a" />
            </linearGradient>
          </defs>
          {/* 검 길이(-95~67)의 가운데를 아바타 중심에 맞춰, 칼끝과 손잡이가 양쪽 여백으로 나오게 */}
          <g transform="scale(1.18) translate(0 14)">
            <Sword id={`${id}-${cls}`} />
          </g>
        </Layer>
      ))}
      <Layer size={size} front>
        <defs>
          <linearGradient id={`${id}-steel`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f2f6fb" />
            <stop offset="0.5" stopColor="#9aa8bb" />
            <stop offset="1" stopColor="#4b5668" />
          </linearGradient>
        </defs>
        <circle r="53" fill="none" stroke="#1d2430" strokeWidth="7" />
        <circle
          r="53"
          fill="none"
          stroke={`url(#${id}-steel)`}
          strokeWidth="4"
        />
        {rivets.map((a) => (
          <circle
            key={a}
            cx={Math.sin((a * Math.PI) / 180) * 53}
            cy={-Math.cos((a * Math.PI) / 180) * 53}
            r="1.9"
            fill="#e9eef5"
            stroke="#3a4352"
            strokeWidth="0.7"
          />
        ))}
      </Layer>
    </>
  );
}
