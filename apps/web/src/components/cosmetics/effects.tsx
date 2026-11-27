"use client";

/**
 * 카드 장식 효과 — 초상화 위에서 움직이는 캐릭터·연출 (메달 상점 상품).
 *
 * 초상화 칸 안에 덮어 그리고(`absolute inset-0`), 클릭은 통과시킨다.
 * 픽셀 그림은 문자열 격자(`art`)를 SVG 사각형으로 바꿔 그린다. 한 글자가 한 칸이고
 * `.`은 빈칸, 나머지 글자는 팔레트 색이다. 행 길이가 달라도 된다(오른쪽을 빈칸으로 본다).
 *
 * 움직임 정의는 globals.css 의 `.cfx-*`. 움직임 줄이기 설정에선 멈추고, 날아다니는
 * 것들(`.cfx-travel`)은 숨긴다.
 */

import { InkDragonVideo } from "./ink-dragon-video";
import { LunarCard } from "./lunar-card";
import { CARD_SCENES } from "./card-scenes";
import { LiveBanner } from "./live-banner";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { PixelSheet } from "./pixel-sheet";
import { INK_DRAGON_CARD, INK_DRAGON_PAL } from "./sprites";

export type CosmeticEffectCode =
  | "slime"
  | "ghost"
  | "sakura"
  | "fire"
  | "bats"
  | "sword"
  | "lightning"
  | "lunar_card"
  | "dragon";

export type Palette = Record<string, string>;

/** 문자열 격자 → 픽셀 SVG. 같은 색이 가로로 이어지면 사각형 하나로 합친다 */
export function PixelArt({
  art,
  palette,
  px,
  className,
  style,
}: {
  art: string[];
  palette: Palette;
  /** 한 칸의 화면 크기(px) */
  px: number;
  className?: string;
  style?: CSSProperties;
}) {
  const w = Math.max(...art.map((row) => row.length));
  const h = art.length;
  // 같은 색을 path 하나에 모은다. 가로로 이어진 칸은 사각형 하나로 합친다.
  // 점묘가 많은 그림(수묵 용)도 DOM 노드가 색 수만큼만 생긴다.
  const paths: Record<string, string> = {};
  art.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      if (!palette[c]) {
        x++;
        continue;
      }
      let run = 1;
      while (row[x + run] === c) run++;
      paths[c] = (paths[c] ?? "") + `M${x} ${y}h${run}v1h-${run}z`;
      x += run;
    }
  });
  return (
    <svg
      width={w * px}
      height={h * px}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      className={cn("block", className)}
      style={style}
    >
      {Object.entries(paths).map(([c, d]) => (
        <path key={c} d={d} fill={palette[c]} />
      ))}
    </svg>
  );
}

/**
 * 여러 프레임을 한 장짜리 그림띠(스프라이트 시트)로 붙여 두고, 창 하나로 한 칸씩 넘겨 본다.
 *
 * 예전엔 프레임마다 따로 겹쳐 두고 투명도로 켜고 껐는데, 바뀌는 순간 어느 프레임도
 * 켜지지 않은 틈이 생겨 깜빡였다(2026-11-12 「왤캐 깜빡거려」). 그림띠는 요소가 하나라
 * 틈이 생길 수 없다.
 */
export function Frames({
  frames,
  palette,
  px,
  duration,
  delay = 0,
}: {
  frames: string[][];
  palette: Palette;
  px: number;
  duration: number;
  delay?: number;
}) {
  const n = frames.length;
  // 프레임마다 크기가 달라도(박쥐 날개 위·아래) 가장 큰 칸에 맞춰 왼쪽 위로 붙인다
  const w = Math.max(...frames.flatMap((f) => f.map((row) => row.length)));
  const h = Math.max(...frames.map((f) => f.length));
  const paths: Record<string, string> = {};
  frames.forEach((art, k) => {
    art.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        const c = row[x];
        if (!palette[c]) {
          x++;
          continue;
        }
        let run = 1;
        while (row[x + run] === c) run++;
        paths[c] = (paths[c] ?? "") + `M${x + k * w} ${y}h${run}v1h-${run}z`;
        x += run;
      }
    });
  });
  return (
    <div style={{ width: w * px, height: h * px, overflow: "hidden" }}>
      <svg
        width={n * w * px}
        height={h * px}
        viewBox={`0 0 ${n * w} ${h}`}
        shapeRendering="crispEdges"
        className="cfx-sheet block"
        style={{
          animationDuration: `${duration}s`,
          animationDelay: `${delay}s`,
          animationTimingFunction: `steps(${n})`,
        }}
      >
        {Object.entries(paths).map(([c, d]) => (
          <path key={c} d={d} fill={palette[c]} />
        ))}
      </svg>
    </div>
  );
}

/* ───────── 공용 ───────── */

/**
 * 픽셀 그림 테두리. 초상화 색이 제각각이라(흰 털·검은 배경) 어디서든 윤곽이 보이게
 * 검은 1px 외곽선 + 상품 색 빛을 함께 두른다.
 */
export function outline(glow: string) {
  return `drop-shadow(1px 0 0 rgba(0,0,0,0.85)) drop-shadow(-1px 0 0 rgba(0,0,0,0.85)) drop-shadow(0 1px 0 rgba(0,0,0,0.85)) drop-shadow(0 -1px 0 rgba(0,0,0,0.85)) drop-shadow(0 0 5px ${glow})`;
}

/** 한 점에서 사방으로 튀는 파편. 애니메이션 박자는 부모 장식과 맞춘다 */
export function Burst({
  count,
  color,
  size,
  dist,
  duration,
  className,
  style,
}: {
  count: number;
  color: string;
  size: number;
  dist: number;
  duration: number;
  className: string;
  style?: CSSProperties;
}) {
  return (
    <div className="absolute" style={style}>
      {Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2 + 0.4;
        return (
          <span
            key={i}
            className={cn("absolute", className)}
            style={
              {
                width: size,
                height: size,
                left: -size / 2,
                top: -size / 2,
                background: color,
                boxShadow: `0 0 4px ${color}`,
                animationDuration: `${duration}s`,
                "--dx": `${Math.cos(a) * dist}px`,
                "--dy": `${Math.sin(a) * dist}px`,
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

/* ───────── pixelfx 카드 장면 ───────── */

/**
 * pixelfx(픽셀 효과 라이브러리)로 그려 구운 카드 장면 — 110×92 칸.
 * 멈춘 배경 한 장(bg-*.png) 위에 움직이는 스프라이트 시트를 겹친다. 칸 크기가 모든
 * 카드에서 같아 픽셀 크기가 맞는다. 원본 효과 파일과 다시 굽는 법은 scripts/pixelfx (README).
 */
const CARD_SHEETS = {
  fire: { frames: 60, columns: 8, src: "fire-blaze", bg: "fire" },
  slime: { frames: 72, columns: 8, src: "slime", bg: "slime" },
  ghost: { frames: 96, columns: 9, src: "ghost", bg: "ghost" },
  bats: { frames: 96, columns: 9, src: "bats", bg: "bats" },
  sword: { frames: 48, columns: 7, src: "sword", bg: "sword" },
  storm: { frames: 120, columns: 11, src: "storm", bg: "storm" },
} as const;

function CardSheet({ name }: { name: keyof typeof CARD_SHEETS }) {
  const s = CARD_SHEETS[name];
  return (
    <>
      {/* 배경 — 시트와 같이 아래에 붙여 폭에 맞춘다(칸 크기가 시트와 같게) */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(/cosmetics/cards/bg-${s.bg}.png)`,
          backgroundSize: "100% auto",
          backgroundPosition: "bottom",
          backgroundColor: "#0a0d18",
          imageRendering: "pixelated",
        }}
      />
      <PixelSheet
        src={`/cosmetics/cards/${s.src}.png`}
        frameW={110}
        frameH={92}
        frames={s.frames}
        columns={s.columns}
        fps={20}
        className="absolute inset-x-0 bottom-0"
      />
    </>
  );
}

/* ───────── 슬라임 ───────── */

/** 큰 슬라임이 초상화 오른쪽에서 통통 뛰고, 왼쪽의 작은 슬라임이 반 박자 늦게 따라 뛴다 */
function SlimeFx() {
  return <CardSheet name="slime" />;
}

/* ───────── 꼬마 유령 ───────── */

/** 꼬마 유령이 초상화 옆에서 둥실거리고, 반대편에 흐릿한 유령이 하나 더 떠 있다 */
function GhostFx() {
  return <CardSheet name="ghost" />;
}

/* ───────── 벚꽃 (벡터) ───────── */

const PETALS = Array.from({ length: 14 }, (_, i) => ({
  left: (i * 37) % 100,
  dur: 3.4 + ((i * 7) % 10) / 5,
  delay: -((i * 13) % 40) / 10,
  size: 1 + ((i * 5) % 9) / 10,
}));

/** 꽃잎 14장이 바람에 크게 흔들리며 쏟아진다 */
function SakuraFx({ px }: { px: number }) {
  return (
    <>
      {PETALS.map((p, i) => (
        <div
          key={i}
          className="cfx-travel cfx-petal-fall absolute"
          style={{
            left: `${p.left}%`,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
          }}
        >
          <div
            className="cfx-petal-sway"
            style={{
              animationDuration: `${p.dur / 2.2}s`,
              animationDelay: `${p.delay}s`,
            }}
          >
            <svg
              width={5 * px * p.size}
              height={5 * px * p.size}
              viewBox="0 0 10 10"
              style={{
                filter: "drop-shadow(0 0 1px rgba(90,20,50,0.7))",
              }}
            >
              <path
                d="M5 0C8.5 2 9.5 6.5 5 10 .5 6.5 1.5 2 5 0Z"
                fill="#f7a1c3"
              />
              <path
                d="M5 2.2C6.4 3.4 6.6 6 5 8 3.4 6 3.6 3.4 5 2.2Z"
                fill="#ffe0ec"
              />
            </svg>
          </div>
        </div>
      ))}
    </>
  );
}

/* ───────── 픽셀 화염 ───────── */

/**
 * 초상화 아래를 불벽이 집어삼킨다. 밑동은 하얗게 달아오르고 위로 갈수록
 * 노랑→주황→빨강→검붉음으로 딱딱 끊겨 식으며, 들쭉날쭉한 불끝에서 불조각이
 * 떨어져 나가 솟아오르다 꺼진다. 양옆이 조금 더 높아 초상화를 감싼다.
 *
 * 그림은 pixelfx(픽셀 효과 라이브러리)로 그려 — 위로 흐르는 노이즈에서 높이를 빼 색 단계를 고른다 —
 * 구운 스프라이트 시트(110×92 칸 60장, 3초 반복) — 원본 효과 파일은
 * scripts/pixelfx/card-blaze.js. 예전 실시간 열 전파 불(pixel-fire.tsx)은
 * 칸이 세로로 늘어나고 자글자글한 잡티가 많았다. 아바타 불꽃은 그대로 그걸 쓴다.
 */
function FireFx() {
  return (
    <>
      <div className="cfx-heat absolute inset-x-0 bottom-0 h-3/4" />
      <CardSheet name="fire" />
    </>
  );
}

/* ───────── 박쥐 떼 ───────── */

/** 박쥐 세 마리가 카드 위쪽에서 저마다 박자로 8자를 그리며 날갯짓한다 */
function BatsFx() {
  return <CardSheet name="bats" />;
}

/* ───────── 전설의 검 ───────── */

/** 초상화 옆에 꽂힌 검에서 푸른 빛기둥이 솟고 반짝이가 피어오른다 */
function SwordFx() {
  return <CardSheet name="sword" />;
}

/* ───────── 천둥번개 ───────── */

/**
 * 6초에 두 번, 초상화 양옆으로 갈래 번개가 내리꽂혀 깜빡이고 불똥이 튄다.
 * 비·먹구름·하늘 번쩍임은 카드 배경(card-scenes)이 그린다.
 */
function LightningFx() {
  return <CardSheet name="storm" />;
}

/* ───────── 용의 숨결 ───────── */

/** 흑룡이 지나가는 박자(초) */
const DRAGON_BEAT = 7;

/**
 * 수묵 흑룡 — 초상화 위에 한지 바탕이 번져 나오고, 그 위를 먹빛 용이 헤엄쳐
 * 지나간다. 몸은 6프레임으로 물결친다. 먹빛이 사진에 묻히지 않게 한지를 깐다.
 */
function DragonFx({ px }: { px: number }) {
  const beat = { animationDuration: `${DRAGON_BEAT}s` };
  return (
    <>
      <div className="cfx-travel cfx-ink-veil absolute inset-0" style={beat} />
      <div className="cfx-travel cfx-dragon-fly absolute" style={beat}>
        <div
          className="cfx-bob"
          style={{ animationDuration: "1.6s", filter: INK_GLOW }}
        >
          <Frames
            frames={INK_DRAGON_CARD}
            palette={INK_DRAGON_PAL}
            px={px * 0.9}
            duration={0.9}
          />
        </div>
      </div>
    </>
  );
}

/** 먹빛 그림이 어두운 바탕에서도 보이게 두르는 흰 번짐 */
export const INK_GLOW =
  "drop-shadow(0 0 1px rgba(255,255,255,0.85)) drop-shadow(0 0 5px rgba(255,255,255,0.35))";

const EFFECTS: Record<
  CosmeticEffectCode,
  (p: { px: number }) => React.ReactNode
> = {
  slime: SlimeFx,
  ghost: GhostFx,
  sakura: SakuraFx,
  fire: FireFx,
  bats: BatsFx,
  sword: SwordFx,
  lightning: LightningFx,
  lunar_card: LunarCard,
  dragon: DragonFx,
};

/**
 * 초상화 칸 위에 장식 효과를 덮는다. 부모는 `relative overflow-hidden` 이어야 한다.
 * `px` 는 픽셀 그림 한 칸 크기 — 카드가 작을수록 줄인다.
 */
export function CosmeticEffect({
  code,
  px,
}: {
  code: CosmeticEffectCode;
  px: number;
}) {
  if (code === "sakura") {
    // 벚꽃의 여운 — 노을 벚나무 반복 영상(live-banner 가 재생·멈춘 그림·숨기기를 처리)
    return <LiveBanner code="sakura_card" className="pointer-events-none" />;
  }
  if (code === "dragon") {
    return (
      <div
        aria-hidden
        className="cfx-root cfx-deco pointer-events-none absolute inset-0 overflow-hidden bg-[#ece7dd]"
      >
        <InkDragonVideo
          variant="card"
          className="absolute inset-0 h-full w-full"
        />
      </div>
    );
  }
  const Fx = EFFECTS[code];
  // 카드 전체를 채우는 배경 장면(2026-11-24) — 그 위에서 기존 캐릭터가 논다
  const Backdrop = CARD_SCENES[code];
  return (
    <div
      aria-hidden
      className="cfx-root cfx-deco pointer-events-none absolute inset-0 overflow-hidden"
    >
      {Backdrop && <Backdrop />}
      <Fx px={px} />
    </div>
  );
}
