"use client";

/**
 * 아바타 장식 — 프로필의 둥근 아바타 둘레에서 움직이는 장식 (메달 상점 상품).
 *
 * 로비 카드 장식(effects.tsx)과는 **따로 파는 상품**이다(2026-11-12 결정:
 * 꾸미는 자리마다 상품을 나눈다 — 카드 장식, 아바타 장식 …).
 *
 * 아바타를 감싸서 그린다. 장식은 아바타 원 밖으로 삐져나와도 된다(귀·왕관·날개).
 * 층은 셋: 뒤(z 0, 날개·검·불꽃) → 아바타(z 10) → 앞(z 20, 왕관·달·용).
 * 픽셀 한 칸 크기는 아바타 지름에 비례한다(96px 일 때 2px).
 */

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  Burst,
  outline,
  BREATH,
  BREATH_PAL,
  DRAGON,
  DRAGON_PAL,
  FLAME,
  FLAME_PAL,
  Frames,
  PixelArt,
  SPARK,
  SWORD,
  SWORD_PAL,
  type Palette,
} from "./effects";

export type AvatarEffectCode =
  | "cat_ears"
  | "moon"
  | "crown"
  | "halo"
  | "fire_ring"
  | "bat_wings"
  | "twin_swords"
  | "dragon_orbit";

type FxProps = { px: number; size: number };

const BACK: CSSProperties = { zIndex: 0 };
const FRONT: CSSProperties = { zIndex: 20 };

/* ───────── 고양이 귀 ───────── */

const EAR = [
  "...o...",
  "..ofo..",
  "..oPo..",
  ".ofPfo.",
  ".oPPPo.",
  "ofPPPfo",
  "ofPPPfo",
];
// 어두운 사이트 바탕에 묻히지 않게 밝은 치즈 고양이 색
const EAR_PAL: Palette = { o: "#5a3418", f: "#f0a65a", P: "#f7b9c8" };

const TAIL = [
  "....oo",
  "...off",
  "..off.",
  "..of..",
  ".off..",
  ".of...",
  "off...",
  "of....",
];

/** 머리 위 양쪽 귀가 쫑긋거리고, 아래쪽에서 꼬리가 살랑인다 */
function CatEarsFx({ px, size }: FxProps) {
  const ep = px * 2.4;
  return (
    <>
      <div
        className="cfx-tail absolute"
        style={{
          ...BACK,
          right: -size * 0.12,
          bottom: size * 0.02,
          filter: outline("rgba(240,166,90,0.6)"),
        }}
      >
        <PixelArt art={TAIL} palette={EAR_PAL} px={ep} />
      </div>
      <div
        className="cfx-ear-l absolute"
        style={{
          ...BACK,
          left: size * 0.02,
          top: -size * 0.16,
          filter: outline("rgba(240,166,90,0.6)"),
        }}
      >
        <PixelArt art={EAR} palette={EAR_PAL} px={ep} />
      </div>
      <div
        className="cfx-ear-r absolute"
        style={{
          ...BACK,
          right: size * 0.02,
          top: -size * 0.16,
          filter: outline("rgba(240,166,90,0.6)"),
        }}
      >
        <PixelArt art={EAR} palette={EAR_PAL} px={ep} />
      </div>
    </>
  );
}

/* ───────── 공전하는 달 ───────── */

const MOON = [
  "..ooo..",
  ".oyyo..",
  "oyyo...",
  "oyy....",
  "oyyo...",
  ".oyyo..",
  "..ooo..",
];
const MOON_PAL: Palette = { o: "#b39a4e", y: "#f6e7a6" };

/** 초승달과 별이 아바타 둘레를 천천히 돈다 */
function MoonFx({ px }: FxProps) {
  const pad = px * 7;
  return (
    <div
      className="cfx-spin absolute"
      style={{ ...FRONT, inset: -pad, animationDuration: "5s" }}
    >
      <div
        className="absolute left-1/2 top-0 -translate-x-1/2"
        style={{ filter: outline("rgba(246,231,166,0.95)") }}
      >
        <PixelArt art={MOON} palette={MOON_PAL} px={px * 2} />
      </div>
      {[
        "bottom-0 left-1/2 -translate-x-1/2",
        "left-0 top-1/2 -translate-y-1/2",
        "right-0 top-1/2 -translate-y-1/2",
      ].map((pos, i) => (
        <div
          key={pos}
          className={cn("cfx-twinkle absolute", pos)}
          style={{ animationDuration: "1.4s", animationDelay: `${-i * 0.45}s` }}
        >
          <PixelArt
            art={SPARK}
            palette={{ w: "#cfe6ff", W: "#ffffff" }}
            px={px * 1.6}
          />
        </div>
      ))}
    </div>
  );
}

/* ───────── 반짝 왕관 ───────── */

const CROWN = [
  "o....o....o",
  "yo..oyo..oy",
  "yyo.oyo.oyy",
  "yyyoyyyoyyy",
  "yRyyyByyyRy",
  "yyyyyyyyyyy",
  "ddddddddddd",
];
const CROWN_PAL: Palette = {
  o: "#f9de7a",
  y: "#f0c03a",
  d: "#a87a16",
  R: "#e0475f",
  B: "#5aa9ff",
};

/** 머리 위에 비스듬히 얹혀 둥실거리고, 보석이 가끔 반짝인다 */
function CrownFx({ px, size }: FxProps) {
  const cp = px * 2;
  return (
    <div
      className="absolute"
      style={{ ...FRONT, right: size * 0.02, top: -size * 0.2 }}
    >
      <div
        className="cfx-crown-bob relative"
        style={{ filter: outline("rgba(255,214,90,0.9)") }}
      >
        <PixelArt art={CROWN} palette={CROWN_PAL} px={cp} />
        {/* 보석 셋이 번갈아 반짝 */}
        {[0, 4, 8].map((x, i) => (
          <PixelArt
            key={x}
            art={SPARK}
            palette={{ w: "#fff3c4", W: "#ffffff" }}
            px={cp}
            className="cfx-twinkle absolute"
            style={{
              left: x * cp,
              top: 3 * cp,
              animationDuration: "1.5s",
              animationDelay: `${-i * 0.5}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ───────── 천사 고리 (벡터) ───────── */

const HALO_SPARKS = [
  { x: 0.02, y: 0.18, delay: 0 },
  { x: 0.92, y: 0.3, delay: -0.9 },
  { x: 0.84, y: 0.9, delay: -1.6 },
  { x: 0.06, y: 0.78, delay: -2.3 },
];

/** 머리 위에서 떠오르는 금빛 고리 + 둘레에서 깜빡이는 별빛 */
function HaloFx({ px, size }: FxProps) {
  const w = size * 0.72;
  return (
    <>
      <svg
        className="cfx-halo-float absolute left-1/2"
        width={w}
        height={w * 0.3}
        viewBox="0 0 100 30"
        style={{
          ...FRONT,
          top: -size * 0.24,
          marginLeft: -w / 2,
          filter:
            "drop-shadow(0 0 4px rgba(255,226,140,0.95)) drop-shadow(0 0 10px rgba(255,210,100,0.6))",
        }}
      >
        <ellipse
          cx="50"
          cy="15"
          rx="44"
          ry="10"
          fill="none"
          stroke="#ffe7a3"
          strokeWidth="7"
        />
      </svg>
      {HALO_SPARKS.map((s, i) => (
        <PixelArt
          key={i}
          art={SPARK}
          palette={{ w: "#fff3c4", W: "#ffffff" }}
          px={px * 1.6}
          className="cfx-twinkle absolute"
          style={{
            ...FRONT,
            left: s.x * size,
            top: s.y * size,
            animationDuration: "1.6s",
            animationDelay: `${s.delay / 2}s`,
          }}
        />
      ))}
    </>
  );
}

/* ───────── 불꽃 고리 ───────── */

/** 아바타 둘레에 바깥을 향한 픽셀 불꽃 12개가 일렁이며 천천히 돈다 */
function FireRingFx({ px, size }: FxProps) {
  const r = size / 2 - px;
  return (
    <>
      <div
        className="cfx-ring-glow absolute inset-0 rounded-full"
        style={BACK}
      />
      <div
        className="cfx-spin absolute inset-0"
        style={{ ...BACK, animationDuration: "10s" }}
      >
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={i}
            className="absolute left-1/2 top-1/2"
            style={{ transform: `rotate(${i * 30}deg) translateY(${-r}px)` }}
          >
            <div
              className="absolute bottom-0"
              style={{ left: -3.5 * px * (i % 2 ? 1.4 : 1.9) }}
            >
              <Frames
                frames={FLAME}
                palette={FLAME_PAL}
                px={px * (i % 2 ? 1.4 : 1.9)}
                duration={0.34}
                delay={-(i % 3) * 0.14}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ───────── 박쥐 날개 ───────── */

const WING = [
  ".............o",
  "..........ooxo",
  ".......ooxxxxo",
  "....ooxxxmxxo.",
  "..oxxxxmxxxxo.",
  ".oxxxmxxxxxo..",
  "oxx.xx.xxxo...",
  "ox..x..xxo....",
  "o...o..oo.....",
];
const WING_PAL: Palette = { o: "#0f0a16", x: "#3a2a55", m: "#7a55a8" };
/** 어두운 바탕에서도 날개 윤곽이 보이게 보랏빛 테두리 */
const WING_GLOW = "drop-shadow(0 0 3px rgba(170,120,255,0.75))";

/** 아바타 뒤 양쪽으로 펼친 박쥐 날개가 천천히 퍼덕인다 */
function BatWingsFx({ px, size }: FxProps) {
  const wp = px * 3;
  const wingW = 14 * wp;
  return (
    <>
      <div
        className="cfx-wing-r absolute"
        style={{ ...BACK, left: size * 0.72, top: -size * 0.02 }}
      >
        <PixelArt
          art={WING}
          palette={WING_PAL}
          px={wp}
          style={{ filter: WING_GLOW }}
        />
      </div>
      <div
        className="cfx-wing-l absolute"
        style={{ ...BACK, left: size * 0.28 - wingW, top: -size * 0.02 }}
      >
        {/* 그림은 오른쪽 날개 기준이라 왼쪽은 좌우를 뒤집는다 */}
        <PixelArt
          art={WING}
          palette={WING_PAL}
          px={wp}
          style={{ transform: "scaleX(-1)", filter: WING_GLOW }}
        />
      </div>
    </>
  );
}

/* ───────── 교차 검 ───────── */

/** 아바타 뒤에서 두 검이 엇갈려 있다가, 몇 초마다 맞부딪치며 빛이 번진다 */
function TwinSwordsFx({ px, size }: FxProps) {
  const sp = px * 4.4;
  const w = 9 * sp;
  const h = 16 * sp;
  const common: CSSProperties = {
    ...BACK,
    left: size / 2 - w / 2,
    top: size / 2 - h / 2,
    transformOrigin: "50% 50%",
    filter: outline("rgba(120,190,255,0.9)"),
  };
  return (
    <>
      <div className="cfx-sword-l absolute" style={common}>
        <PixelArt art={SWORD} palette={SWORD_PAL} px={sp} />
      </div>
      <div className="cfx-sword-r absolute" style={common}>
        <PixelArt art={SWORD} palette={SWORD_PAL} px={sp} />
      </div>
      {/* 맞부딪칠 때 머리 위로 튀는 불꽃 */}
      <Burst
        count={10}
        color="#e6f3ff"
        size={px * 1.4}
        dist={size * 0.32}
        duration={2.4}
        className="cfx-clash-burst"
        style={{ ...FRONT, left: size / 2, top: -size * 0.02 }}
      />
      {/* 맞부딪칠 때 아바타 둘레로 번지는 빛 */}
      <div
        className="cfx-clash-ring absolute inset-0 rounded-full"
        style={FRONT}
      />
    </>
  );
}

/* ───────── 휘감는 용 ───────── */

/** 픽셀 용이 아바타 둘레를 돌며 날갯짓하고, 한 바퀴에 한 번 불을 뿜는다 */
function DragonOrbitFx({ px }: FxProps) {
  const dp = px * 2;
  const pad = 9 * dp;
  return (
    <div
      className="cfx-spin-rev absolute"
      style={{ ...FRONT, inset: -pad, animationDuration: "4.5s" }}
    >
      <div
        className="absolute left-1/2 top-0 -translate-x-1/2"
        style={{ filter: outline("rgba(255,180,120,0.9)") }}
      >
        <div className="relative">
          <div
            className="cfx-breath absolute"
            style={{
              right: "100%",
              top: 1.3 * dp,
              marginRight: -px,
              animationDuration: "4.5s",
            }}
          >
            <Frames
              frames={BREATH}
              palette={BREATH_PAL}
              px={dp * 1.3}
              duration={0.2}
            />
          </div>
          <Frames frames={DRAGON} palette={DRAGON_PAL} px={dp} duration={0.5} />
        </div>
      </div>
    </div>
  );
}

const AVATAR_EFFECTS: Record<AvatarEffectCode, (p: FxProps) => ReactNode> = {
  cat_ears: CatEarsFx,
  moon: MoonFx,
  crown: CrownFx,
  halo: HaloFx,
  fire_ring: FireRingFx,
  bat_wings: BatWingsFx,
  twin_swords: TwinSwordsFx,
  dragon_orbit: DragonOrbitFx,
};

/**
 * 아바타를 장식과 함께 감싼다. `children` 은 아바타(원) 자체.
 * 장식이 없으면 children 만 그대로 돌려준다.
 */
export function AvatarDecoration({
  code,
  size,
  className,
  children,
}: {
  code?: AvatarEffectCode | null;
  /** 아바타 지름(px) */
  size: number;
  className?: string;
  children: ReactNode;
}) {
  if (!code) return <>{children}</>;
  const Fx = AVATAR_EFFECTS[code];
  return (
    <div
      className={cn("cfx-root relative isolate flex-shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <div className="relative h-full w-full" style={{ zIndex: 10 }}>
        {children}
      </div>
      <div aria-hidden className="pointer-events-none">
        <Fx px={size / 48} size={size} />
      </div>
    </div>
  );
}
