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
import { InkDragonVideo } from "./ink-dragon-video";
import { cn } from "@/lib/utils";
import { Burst, outline, PixelArt, SPARK } from "./effects";
import { PixelFire } from "./pixel-fire";
import {
  CROWN,
  CROWN_PAL,
  EAR,
  EAR_PAL,
  MOON,
  MOON_PAL,
  SWORD,
  SWORD_PAL,
  TAIL,
  WING,
  WING_PAL,
} from "./sprites";

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

// 어두운 사이트 바탕에 묻히지 않게 밝은 치즈 고양이 색

/** 머리 위 양쪽 귀가 쫑긋거리고, 아래쪽에서 꼬리가 살랑인다 */
function CatEarsFx({ px, size }: FxProps) {
  const ep = px * 1.9;
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
        <PixelArt art={MOON} palette={MOON_PAL} px={px * 1.6} />
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

/** 머리 위에 비스듬히 얹혀 둥실거리고, 보석이 가끔 반짝인다 */
function CrownFx({ px, size }: FxProps) {
  const cp = px * 1.45;
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
        {[2, 6, 10].map((x, i) => (
          <PixelArt
            key={x}
            art={SPARK}
            palette={{ w: "#fff3c4", W: "#ffffff" }}
            px={cp}
            className="cfx-twinkle absolute"
            style={{
              left: x * cp,
              top: 6 * cp,
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

/**
 * 아바타가 이글이글 불타오른다 — 아바타 둘레 원이 불씨가 되어 실시간 픽셀 불길이
 * 위로 솟는다(pixel-fire.tsx). 아래쪽 불은 아바타 뒤에 가려지고, 옆과 머리 위로
 * 불길이 치솟으며 불티가 흩날린다.
 */
function FireRingFx({ px, size }: FxProps) {
  const cell = px * 1.75;
  const box = size * 1.8;
  const n = Math.round(box / cell);
  return (
    <>
      <div
        className="cfx-ring-glow absolute inset-0 rounded-full"
        style={BACK}
      />
      <PixelFire
        cols={n}
        rows={n}
        cell={cell}
        source={{ kind: "ring", cx: n / 2, cy: n / 2, r: size / 2 / cell }}
        reach={0.3}
        className="absolute"
        style={{
          ...BACK,
          left: size / 2 - (n * cell) / 2,
          top: size / 2 - (n * cell) / 2,
        }}
      />
    </>
  );
}

/* ───────── 박쥐 날개 ───────── */

/** 어두운 바탕에서도 날개 윤곽이 보이게 보랏빛 테두리 */
const WING_GLOW = "drop-shadow(0 0 3px rgba(170,120,255,0.75))";

/** 아바타 뒤 양쪽으로 펼친 박쥐 날개가 천천히 퍼덕인다 */
function BatWingsFx({ px, size }: FxProps) {
  const wp = px * 2.3;
  const wingW = 18 * wp;
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
  const sp = px * 2;
  const w = 15 * sp;
  const h = 35 * sp;
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

/**
 * 수묵 흑룡이 아바타 둘레를 휘감는다. 몸은 6프레임으로 물결치고,
 * 감은 고리 전체가 천천히 돈다. 격자 가운데가 아바타 중심이다.
 * 그림의 머리가 시계 방향을 보므로 고리도 시계 방향으로 돌린다(머리가 앞장서게).
 */
function DragonOrbitFx({ size }: FxProps) {
  const diameter = size * 1.72;
  return (
    <div
      className="absolute overflow-hidden rounded-full"
      style={{
        ...FRONT,
        left: (size - diameter) / 2,
        top: (size - diameter) / 2,
        width: diameter,
        height: diameter,
        maskImage: "radial-gradient(circle, transparent 0 31%, black 38% 67%, transparent 75%)",
        WebkitMaskImage: "radial-gradient(circle, transparent 0 31%, black 38% 67%, transparent 75%)",
        backgroundColor: "#f3f0e9",
      }}
    >
      <InkDragonVideo variant="avatar" className="absolute inset-0 h-full w-full" />
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
      {/* 아바타가 상자보다 작아도(모바일 80px 등) 가운데에 놓는다 */}
      <div
        className="relative flex h-full w-full items-center justify-center"
        style={{ zIndex: 10 }}
      >
        {children}
      </div>
      {/* cfx-deco — 「숨기기」 설정이면 장식만 빠지고 아바타는 남는다 */}
      <div aria-hidden className="cfx-deco pointer-events-none">
        <Fx px={size / 48} size={size} />
      </div>
    </div>
  );
}
