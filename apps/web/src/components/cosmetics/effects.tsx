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

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { PixelFire } from "./pixel-fire";
import {
  BAT,
  BAT_PAL,
  INK_DRAGON_CARD,
  INK_DRAGON_PAL,
  SLIME,
  SLIME_PAL,
  SWORD,
  SWORD_PAL,
} from "./sprites";

export type CosmeticEffectCode =
  | "slime"
  | "ghost"
  | "sakura"
  | "fire"
  | "bats"
  | "sword"
  | "lightning"
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

/* ───────── 슬라임 ───────── */

/**
 * 큰 슬라임이 높이 뛰어 철퍽 착지하면 물방울이 튄다. 새끼 슬라임이 뒤를 쫓는다.
 * 착지(58%)와 물방울 박자는 1.1초로 맞춘다.
 */
function SlimeFx({ px }: { px: number }) {
  const big = px * 0.95;
  return (
    <>
      <div className="cfx-slime-walk absolute bottom-0">
        <div className="cfx-slime-face">
          <div className="relative">
            <div
              className="cfx-slime-hop"
              style={{ filter: outline("rgba(120,230,140,0.7)") }}
            >
              <PixelArt art={SLIME} palette={SLIME_PAL} px={big} />
            </div>
            <Burst
              count={6}
              color="#7be08a"
              size={big}
              dist={big * 7}
              duration={1.1}
              className="cfx-splash"
              style={{ left: 8 * big, bottom: big }}
            />
          </div>
        </div>
      </div>
      {/* 새끼 — 조금 늦게 같은 길을 따라온다 */}
      <div
        className="cfx-slime-walk absolute bottom-0"
        style={{ animationDelay: "-0.9s" }}
      >
        <div className="cfx-slime-face" style={{ animationDelay: "-0.9s" }}>
          <div
            className="cfx-slime-hop"
            style={{
              animationDuration: "0.8s",
              filter: outline("rgba(120,230,140,0.6)"),
            }}
          >
            <PixelArt art={SLIME} palette={SLIME_PAL} px={px * 0.45} />
          </div>
        </div>
      </div>
    </>
  );
}

/* ───────── 꼬마 유령 (벡터) ───────── */

/** 초상화를 휘젓고 다니다가, 몇 초마다 화면 앞으로 확 다가와 놀래킨다 */
function GhostFx({ px }: { px: number }) {
  const w = 15 * px;
  return (
    <div className="cfx-travel cfx-ghost-wander absolute">
      <div className="cfx-ghost-boo">
        <div className="cfx-ghost-bob">
          <svg
            width={w}
            height={w * 1.15}
            viewBox="0 0 24 28"
            style={{
              filter:
                "drop-shadow(0 0 1px rgba(20,24,40,0.9)) drop-shadow(0 0 8px rgba(196,206,255,0.95))",
            }}
          >
            <path
              d="M12 1C5.5 1 2 6 2 12v14l3.4-3 3.3 3 3.3-3 3.3 3 3.3-3 3.4 3V12C22 6 18.5 1 12 1Z"
              fill="rgba(244,246,255,0.96)"
            />
            <g className="cfx-ghost-blink">
              <ellipse cx="8.6" cy="12" rx="1.8" ry="2.5" fill="#1b1f2e" />
              <ellipse cx="15.4" cy="12" rx="1.8" ry="2.5" fill="#1b1f2e" />
            </g>
            {/* 놀래킬 때 벌어지는 입 */}
            <ellipse
              className="cfx-ghost-mouth"
              cx="12"
              cy="18"
              rx="2.2"
              ry="2.6"
              fill="#1b1f2e"
            />
            <ellipse cx="6.2" cy="15.8" rx="1.6" ry="1" fill="#f5a3bd" />
            <ellipse cx="17.8" cy="15.8" rx="1.6" ry="1" fill="#f5a3bd" />
          </svg>
        </div>
      </div>
    </div>
  );
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
 * 초상화 아래 절반을 실시간 픽셀 불길이 집어삼킨다 (pixel-fire.tsx).
 * 불길이 칸마다 이글이글 갈라지고 불티가 흩날린다.
 */
function FireFx() {
  return (
    <>
      <div className="cfx-heat absolute inset-x-0 bottom-0 h-3/4" />
      <PixelFire
        fill
        cols={54}
        rows={26}
        cell={3}
        source={{ kind: "bottom" }}
        reach={0.5}
        className="absolute inset-0"
      />
    </>
  );
}

/* ───────── 박쥐 떼 ───────── */

const BATS = [
  { top: 16, dur: 3.6, delay: 0, flap: 0.22, scale: 1.2, rev: false },
  { top: 44, dur: 4.4, delay: -1.4, flap: 0.26, scale: 0.9, rev: true },
  { top: 6, dur: 5.2, delay: -3.1, flap: 0.2, scale: 1.01, rev: false },
  { top: 30, dur: 4, delay: -2.2, flap: 0.24, scale: 0.75, rev: true },
  { top: 52, dur: 3.2, delay: -0.6, flap: 0.18, scale: 1.05, rev: false },
  { top: 24, dur: 5.8, delay: -4.4, flap: 0.28, scale: 0.68, rev: true },
];

/** 박쥐 6마리가 양쪽에서 출렁이며 쏟아지듯 날아다닌다 */
function BatsFx({ px }: { px: number }) {
  return (
    <>
      {BATS.map((b, i) => (
        <div
          key={i}
          className={cn(
            "cfx-travel absolute",
            b.rev ? "cfx-bat-path-rev" : "cfx-bat-path",
          )}
          style={{
            top: `${b.top}%`,
            animationDuration: `${b.dur}s`,
            animationDelay: `${b.delay}s`,
          }}
        >
          <div
            className="cfx-bat-swoop"
            style={{
              animationDuration: `${b.dur / 3}s`,
              animationDelay: `${b.delay}s`,
              filter: outline("rgba(200,140,255,0.9)"),
            }}
          >
            <Frames
              frames={BAT}
              palette={BAT_PAL}
              px={px * b.scale}
              duration={b.flap}
            />
          </div>
        </div>
      ))}
    </>
  );
}

/* ───────── 전설의 검 ───────── */

export const SPARK = [".w.", "wWw", ".w."];

/** 검 한 번 휘두르는 박자(초) — 검·궤적·충격·파편이 모두 이 박자를 따른다 */
const SWORD_BEAT = 3.2;

/**
 * 오른쪽 위에 떠 있던 큰 검이 초상화를 가로질러 크게 베면, 궤적이 남고
 * 화면이 번쩍이며 불꽃이 튄다. 한 바퀴 돌아 제자리로 와서 칼끝이 반짝인다.
 */
function SwordFx({ px }: { px: number }) {
  const sp = px * 0.62;
  // 손잡이 가운데를 축으로 휘두른다. 베기 궤적 반지름은 축~칼끝 거리에 맞춘다
  const pivotX = 7.5 * sp;
  const pivotY = 30.5 * sp;
  const slash = 30.5 * sp * (70 / 26);
  const beat = { animationDuration: `${SWORD_BEAT}s` };
  return (
    <>
      {/* 벨 때 초상화 전체가 하얗게 번쩍 */}
      <div className="cfx-impact absolute inset-0 bg-sky-100" style={beat} />
      <div className="absolute right-[12%] top-[2%]">
        <svg
          className="cfx-slash pointer-events-none absolute"
          width={slash}
          height={slash}
          viewBox="0 0 70 70"
          style={{ left: pivotX - slash / 2, top: pivotY - slash / 2 }}
        >
          <path
            d="M46 11.4A26 26 0 1 0 43.9 59.4"
            pathLength={100}
            fill="none"
            stroke="rgba(130,190,255,0.6)"
            strokeWidth={10}
            strokeLinecap="round"
            style={beat}
          />
          <path
            d="M46 11.4A26 26 0 1 0 43.9 59.4"
            pathLength={100}
            fill="none"
            stroke="#ffffff"
            strokeWidth={3.5}
            strokeLinecap="round"
            style={beat}
          />
        </svg>
        <Burst
          count={8}
          color="#dff0ff"
          size={px}
          dist={px * 12}
          duration={SWORD_BEAT}
          className="cfx-sword-burst"
          style={{ left: pivotX - slash * 0.3, top: pivotY + slash * 0.05 }}
        />
        <div
          className="cfx-sword"
          style={{
            ...beat,
            transformOrigin: `${pivotX}px ${pivotY}px`,
            filter: outline("rgba(120,190,255,0.9)"),
          }}
        >
          <PixelArt art={SWORD} palette={SWORD_PAL} px={sp} />
          <PixelArt
            art={SPARK}
            palette={{ w: "#cfe6ff", W: "#ffffff" }}
            px={sp}
            className="cfx-glint absolute"
            style={{ ...beat, left: 6 * sp, top: -1 * sp }}
          />
        </div>
      </div>
    </>
  );
}

/* ───────── 천둥번개 (벡터) ───────── */

const BOLTS = [
  { left: 8, delay: 0, flip: false, h: 100 },
  { left: 44, delay: 0.85, flip: true, h: 86 },
  { left: 74, delay: 1.7, flip: false, h: 94 },
];

/** 굵은 번개 세 줄기가 연달아 내리꽂히고, 칠 때마다 초상화가 하얗게 번쩍인다 */
function LightningFx({ px }: { px: number }) {
  return (
    <>
      <div className="cfx-storm absolute inset-0" />
      {BOLTS.map((b, i) => (
        <div key={i} className="contents">
          <div
            className="cfx-travel cfx-flash absolute inset-0 bg-sky-100"
            style={{ animationDelay: `${b.delay}s` }}
          />
          <svg
            className="cfx-travel cfx-bolt absolute top-0"
            width={18 * px}
            viewBox="0 0 24 60"
            preserveAspectRatio="none"
            style={{
              left: `${b.left}%`,
              height: `${b.h}%`,
              animationDelay: `${b.delay}s`,
              transform: b.flip ? "scaleX(-1)" : undefined,
              filter:
                "drop-shadow(0 0 4px rgba(147,197,253,1)) drop-shadow(0 0 12px rgba(96,165,250,0.9))",
            }}
          >
            {/* 줄기 + 곁가지 */}
            <polygon
              points="14,0 4,26 11,26 3,60 20,20 12,20 19,0"
              fill="#fffdf0"
              stroke="#1e3a8a"
              strokeWidth={0.9}
              strokeLinejoin="round"
            />
            <polyline
              points="9,14 1,20 3,28"
              fill="none"
              stroke="#fffdf0"
              strokeWidth={1.4}
            />
            <polyline
              points="15,26 22,34 19,42"
              fill="none"
              stroke="#fffdf0"
              strokeWidth={1.4}
            />
          </svg>
        </div>
      ))}
    </>
  );
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
  const Fx = EFFECTS[code];
  return (
    <div
      aria-hidden
      className="cfx-root cfx-deco pointer-events-none absolute inset-0 overflow-hidden"
    >
      <Fx px={px} />
    </div>
  );
}
