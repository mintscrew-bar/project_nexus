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
import { Burst } from "./effects";
import { PixelFire } from "./pixel-fire";
import {
  BatWingsFrame,
  CatEarsFrame,
  CrownFrame,
  EmberRing,
  HaloFrame,
  MoonFrame,
  TwinSwordsFrame,
} from "./avatar-frames";

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

/** 주황 고리 위로 귀가 쫑긋, 아래로 꼬리가 살랑 (벡터, avatar-frames.tsx) */
function CatEarsFx({ size }: FxProps) {
  return <CatEarsFrame size={size} />;
}

/* ───────── 공전하는 달 ───────── */

/** 은빛 고리 둘레를 초승달이 돈다 (벡터) */
function MoonFx({ size }: FxProps) {
  return <MoonFrame size={size} />;
}

/* ───────── 반짝 왕관 ───────── */

/** 금 고리 위에 비스듬히 얹힌 보석 왕관 (벡터) */
function CrownFx({ size }: FxProps) {
  return <CrownFrame size={size} />;
}

/* ───────── 천사 고리 (벡터) ───────── */

/** 흰금 고리 + 작은 날개 + 떠오르는 후광 (벡터) */
function HaloFx({ size }: FxProps) {
  return <HaloFrame size={size} />;
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
      <EmberRing size={size} />
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

/** 가시 고리 뒤로 박쥐 날개가 퍼덕인다 (벡터) */
function BatWingsFx({ size }: FxProps) {
  return <BatWingsFrame size={size} />;
}

/* ───────── 교차 검 ───────── */

/** 아바타 뒤에서 두 검이 엇갈려 있다가, 몇 초마다 맞부딪치며 빛이 번진다 */
function TwinSwordsFx({ px, size }: FxProps) {
  return (
    <>
      <TwinSwordsFrame size={size} />
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
