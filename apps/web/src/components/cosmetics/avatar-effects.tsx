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

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useCosmeticFxStore } from "@/stores/cosmetic-fx-store";
import { useIsClient } from "@/hooks/useIsClient";
import { InkDragonVideo } from "./ink-dragon-video";
import { cn } from "@/lib/utils";
import { Burst } from "./effects";
import { PixelSheet } from "./pixel-sheet";
import {
  BatWingsFrame,
  CatEarsFrame,
  CrownFrame,
  EmberRing,
  HaloFrame,
  LunarPhasesFrame,
  MoonFrame,
  TwinSwordsFrame,
} from "./avatar-frames";

export type AvatarEffectCode =
  | "cat_ears"
  | "moon"
  | "lunar_phases"
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
 * 아바타가 이글이글 불타오른다 — 아바타 둘레가 불씨가 되어 머리 위로 가장 높이,
 * 옆으로는 낮게 불길이 솟고 불티가 흩날린다. 아래쪽 불은 아바타 뒤에 가려진다.
 *
 * pixelfx 로 그려 구운 시트(72×72 칸 60장, 3초 반복, public/cosmetics/avatars/fire-ring.png).
 * 시트 한 칸이 아바타 지름의 1.8배라 그만큼 키워 가운데 맞춘다. 원본은
 * scripts/pixelfx/cards/avatar-ring.js. 예전 실시간 열 전파 불은 자글자글한 잡티가 많았다.
 */
function FireRingFx({ size }: FxProps) {
  const box = size * 1.8;
  return (
    <>
      <EmberRing size={size} />
      <div
        className="cfx-ring-glow absolute inset-0 rounded-full"
        style={BACK}
      />
      <PixelSheet
        src="/cosmetics/avatars/fire-ring.png"
        frameW={72}
        frameH={72}
        frames={60}
        columns={8}
        fps={20}
        className="absolute"
        style={{
          ...BACK,
          width: box,
          left: size / 2 - box / 2,
          top: size / 2 - box / 2,
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
      className="absolute"
      style={{
        ...FRONT,
        left: (size - diameter) / 2,
        top: (size - diameter) / 2,
        width: diameter,
        height: diameter,
        // 흰 종이는 걷었다(투명 영상) — 어두운 바탕에서도 먹이 보이게 옅은 빛만 두른다
        filter:
          "drop-shadow(0 0 1.5px rgba(236,229,212,0.7)) drop-shadow(0 0 5px rgba(236,229,212,0.25))",
      }}
    >
      <InkDragonVideo
        variant="avatar"
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
}

/* ───────── 관리자가 올린 아바타 장식 (상점 관리 2단계) ───────── */

/** 올린 파일 — 투명 WebM(없으면 정지 그림만) + 투명 WebP */
export interface AvatarMediaDef {
  video: string | null;
  poster: string;
}

/** 장식 지정 — 코드에 있는 장식 이름, 또는 올린 파일 */
export type AvatarEffectSource = AvatarEffectCode | AvatarMediaDef;

/**
 * 올린 장식 — 규격이 384×384 상자 가운데 지름 192 원(아바타 자리)이라 상자는 아바타 지름의 2배.
 * 사파리는 투명 WebM 을 못 틀어 투명 정지 그림으로 대신한다(흑룡과 같은 방식).
 */
function MediaAvatarFx({ size, media }: FxProps & { media: AvatarMediaDef }) {
  const box = size * 2;
  const ref = useRef<HTMLVideoElement>(null);
  const mode = useCosmeticFxStore((state) => state.mode);
  const isClient = useIsClient();
  const safari =
    isClient &&
    /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
  const useVideo = Boolean(media.video) && !safari;

  // 움직임 설정·화면 밖·탭 숨김이면 멈춘다(라이브 배경과 같은 규칙)
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const reduce =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const still = mode !== "full" || reduce;
    let inView = true;
    const sync = () => {
      if (still || !inView || document.hidden) {
        video.pause();
        if (still) video.currentTime = 0;
      } else {
        void video.play().catch(() => {});
      }
    };
    const io = new IntersectionObserver(([e]) => {
      inView = e.isIntersecting;
      sync();
    });
    io.observe(video);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [mode, useVideo, media.video]);

  return (
    <div
      className="absolute"
      style={{
        ...FRONT,
        left: (size - box) / 2,
        top: (size - box) / 2,
        width: box,
        height: box,
      }}
    >
      {useVideo ? (
        // key — 다른 장식으로 바꾸면 영상 칸을 새로 만든다(<source> 만 바꾸면 앞 영상이 남는다)
        <video
          key={media.video}
          ref={ref}
          aria-hidden
          muted
          loop
          playsInline
          disablePictureInPicture
          preload="metadata"
          poster={media.poster}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        >
          <source src={media.video!} type="video/webm" />
        </video>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- 올린 투명 그림을 그대로 쓴다
        <img
          aria-hidden
          alt=""
          src={media.poster}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        />
      )}
    </div>
  );
}

/* ───────── 빛무리 + 반짝이 (2026-11-24 「허접한 장식」 다듬기) ─────────
 * 코드로 그린 장식은 그림만 덩그러니 있어 밋밋했다. 뒤에 장식 색의 빛무리가 숨 쉬듯 번지고,
 * 둘레를 따라 작은 반짝이가 깜빡이게 한다. 흑룡(영상)은 그대로 둔다. */
const AURA: Partial<
  Record<AvatarEffectCode, { glow: string; spark: string; count: number }>
> = {
  cat_ears: { glow: "255,150,70", spark: "#ffd29a", count: 6 },
  moon: { glow: "150,190,255", spark: "#eef4ff", count: 8 },
  crown: { glow: "255,205,70", spark: "#fff3b0", count: 9 },
  halo: { glow: "255,244,210", spark: "#ffffff", count: 10 },
  fire_ring: { glow: "255,100,40", spark: "#ffc04d", count: 8 },
  bat_wings: { glow: "150,90,255", spark: "#d8b8ff", count: 7 },
  twin_swords: { glow: "120,175,255", spark: "#e3efff", count: 8 },
};

function Aura({ size, code }: FxProps & { code: AvatarEffectCode }) {
  const a = AURA[code];
  if (!a) return null;
  const glowBox = size * 1.7;
  const ring = size * 0.6;
  return (
    <>
      {/* 뒤 — 장식 색 빛무리 */}
      <div
        className="cfx-aura-pulse pointer-events-none absolute rounded-full"
        style={{
          ...BACK,
          left: (size - glowBox) / 2,
          top: (size - glowBox) / 2,
          width: glowBox,
          height: glowBox,
          background: `radial-gradient(circle, rgba(${a.glow},0.42) 0%, rgba(${a.glow},0.16) 42%, rgba(${a.glow},0) 70%)`,
        }}
      />
      {/* 앞 — 둘레의 반짝이(천천히 돈다) */}
      <div
        className="cfx-aura-orbit pointer-events-none absolute"
        style={{ ...FRONT, left: 0, top: 0, width: size, height: size }}
      >
        {Array.from({ length: a.count }, (_, i) => {
          const ang = (i / a.count) * Math.PI * 2 + (i % 2 ? 0.3 : 0);
          const r = ring * (i % 3 === 0 ? 1.12 : 1);
          const dot = Math.max(2, size * (i % 3 === 0 ? 0.05 : 0.032));
          return (
            <span
              key={i}
              className="cfx-scene-twinkle absolute rounded-full"
              style={{
                left: size / 2 + Math.cos(ang) * r - dot / 2,
                top: size / 2 + Math.sin(ang) * r - dot / 2,
                width: dot,
                height: dot,
                background: a.spark,
                boxShadow: `0 0 ${dot * 2}px ${a.spark}`,
                animationDuration: `${2.2 + (i % 4) * 0.6}s`,
                animationDelay: `${-i * 0.45}s`,
              }}
            />
          );
        })}
      </div>
    </>
  );
}

/** 장식 그림 + 빛무리를 함께 그린다 */
const withAura = (code: AvatarEffectCode, Fx: (p: FxProps) => ReactNode) =>
  function AuraFx(p: FxProps) {
    return (
      <>
        <Aura {...p} code={code} />
        {Fx(p)}
      </>
    );
  };

const AVATAR_EFFECTS: Record<AvatarEffectCode, (p: FxProps) => ReactNode> = {
  cat_ears: withAura("cat_ears", CatEarsFx),
  moon: withAura("moon", MoonFx),
  lunar_phases: ({ size }) => <LunarPhasesFrame size={size} />,
  crown: withAura("crown", CrownFx),
  halo: withAura("halo", HaloFx),
  fire_ring: withAura("fire_ring", FireRingFx),
  bat_wings: withAura("bat_wings", BatWingsFx),
  twin_swords: withAura("twin_swords", TwinSwordsFx),
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
  code?: AvatarEffectSource | null;
  /** 아바타 지름(px) */
  size: number;
  className?: string;
  children: ReactNode;
}) {
  if (!code) return <>{children}</>;
  // 올린 파일이면 그 영상·그림을, 아니면 코드에 있는 장식을 그린다
  const Fx = typeof code === "string" ? AVATAR_EFFECTS[code] : null;
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
        {Fx ? (
          <Fx px={size / 48} size={size} />
        ) : (
          <MediaAvatarFx
            px={size / 48}
            size={size}
            media={code as AvatarMediaDef}
          />
        )}
      </div>
    </div>
  );
}
