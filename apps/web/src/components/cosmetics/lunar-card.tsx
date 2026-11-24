"use client";

import { useId } from "react";

/** 달 위상 아바타와 어울리는 밤하늘 카드 장면. */
export function LunarCard() {
  const id = useId().replace(/:/g, "");
  const stars = [
    [12, 16, 1.2],
    [37, 24, 0.8],
    [65, 9, 0.9],
    [155, 15, 1],
    [185, 24, 1.3],
    [208, 10, 0.8],
    [18, 75, 1],
    [203, 76, 1],
    [34, 111, 0.7],
    [189, 113, 0.8],
    [11, 150, 0.8],
    [207, 149, 0.9],
  ];
  return (
    <svg
      aria-hidden
      viewBox="0 0 220 216"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <defs>
        <linearGradient id={`${id}-night`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#10182e" />
          <stop offset="0.52" stopColor="#242643" />
          <stop offset="1" stopColor="#0b1022" />
        </linearGradient>
        <radialGradient id={`${id}-halo`}>
          <stop stopColor="#aab6e8" stopOpacity="0.25" />
          <stop offset="1" stopColor="#8c83c4" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-nebula`}>
          <stop stopColor="#9c9dd5" stopOpacity="0.35" />
          <stop offset="0.48" stopColor="#726aab" stopOpacity="0.16" />
          <stop offset="1" stopColor="#6a78ad" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-moon`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fff9df" />
          <stop offset="1" stopColor="#c4a174" />
        </linearGradient>
        <linearGradient
          id={`${id}-meteor-tail`}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2="36"
          y2="-30"
        >
          <stop stopColor="#fff8df" stopOpacity="0.9" />
          <stop offset="0.3" stopColor="#f8dca6" stopOpacity="0.45" />
          <stop offset="1" stopColor="#b4c6ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="220" height="216" fill={`url(#${id}-night)`} />
      <circle cx="110" cy="78" r="100" fill={`url(#${id}-halo)`} />
      {/* 멀리 퍼지는 은하 빛. 중심의 아바타 문양은 또렷하게 남긴다. */}
      <ellipse cx="34" cy="58" rx="74" ry="100" fill={`url(#${id}-nebula)`} />
      <ellipse cx="199" cy="100" rx="68" ry="105" fill={`url(#${id}-nebula)`} />
      <path
        d="M-10 170 Q35 151 65 163 T140 164 T235 145 L235 216 H-10 Z"
        fill="#10182f"
        opacity="0.7"
      />
      {stars.map(([x, y, r], index) => (
        <circle
          key={index}
          cx={x}
          cy={y}
          r={r}
          fill="#f9e6bb"
          className="cfx-scene-twinkle"
          style={{
            animationDelay: `${-index * 0.37}s`,
            animationDuration: `${2.4 + (index % 3)}s`,
          }}
        />
      ))}
      {/* 첫 위치는 고정하고, 반복마다 위치와 크기를 바꾼다. */}
      {[
        { x: 72, y: 7, size: 0.75, delay: "0s", duration: "9s" },
        { x: 206, y: 30, size: 1.1, delay: "-5s", duration: "13s" },
        { x: 170, y: 12, size: 0.48, delay: "-8s", duration: "17s" },
        { x: 110, y: 42, size: 0.62, delay: "-3s", duration: "19s" },
      ].map((meteor, index) => (
        <g key={index} transform={`translate(${meteor.x} ${meteor.y})`}>
          <g
            className="cfx-lunar-meteor"
            style={{
              animationDelay: meteor.delay,
              animationDuration: meteor.duration,
            }}
            onAnimationIteration={(event) => {
              const element = event.currentTarget;
              const x = 65 + Math.random() * 150;
              const y = 5 + Math.random() * 65;
              const scale = 0.45 + Math.random() * 0.75;
              element.parentElement?.setAttribute(
                "transform",
                `translate(${x} ${y})`,
              );
              element.firstElementChild?.setAttribute(
                "transform",
                `scale(${scale})`,
              );
            }}
          >
            <g transform={`scale(${meteor.size})`}>
              <path
                d="M-0.8 -1.1 Q12 -14 36 -30 Q16 -10 0.8 1.1 Z"
                fill={`url(#${id}-meteor-tail)`}
              />
              <circle r="1.2" fill="#fff9e8" />
            </g>
          </g>
        </g>
      ))}
      {/* 달은 아바타 장식의 주인공으로 남기고, 배경은 작은 별빛만 더한다. */}
      <g fill={`url(#${id}-moon)`}>
        <path
          d="M28 23 L29.4 27 L33 28 L29.4 29 L28 33 L26.6 29 L23 28 L26.6 27 Z"
          className="cfx-scene-twinkle"
        />
        <path
          d="M192 23 L193.4 27 L197 28 L193.4 29 L192 33 L190.6 29 L187 28 L190.6 27 Z"
          className="cfx-scene-twinkle"
          style={{ animationDelay: "-1.5s" }}
        />
      </g>
      <path
        d="M110 137 L112 142 L117 144 L112 146 L110 151 L108 146 L103 144 L108 142 Z"
        fill="#f8e4b4"
        opacity="0.7"
        className="cfx-scene-twinkle"
      />
    </svg>
  );
}
