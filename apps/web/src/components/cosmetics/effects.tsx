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
  const rects: React.ReactNode[] = [];
  art.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      const fill = palette[c];
      if (!fill) {
        x++;
        continue;
      }
      let run = 1;
      while (row[x + run] === c) run++;
      rects.push(
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width={run}
          height={1}
          fill={fill}
        />,
      );
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
      {rects}
    </svg>
  );
}

/** 여러 프레임을 겹쳐 두고 번갈아 보인다 (2프레임: flap, 3프레임: f3) */
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
  const cls =
    frames.length === 2
      ? ["cfx-flap-a", "cfx-flap-b"]
      : ["cfx-f3-1", "cfx-f3-2", "cfx-f3-3"];
  return (
    <div className="relative">
      {frames.map((art, i) => (
        <PixelArt
          key={i}
          art={art}
          palette={palette}
          px={px}
          className={cn(cls[i], i > 0 && "absolute left-0 top-0")}
          style={{
            animationDuration: `${duration}s`,
            animationDelay: `${delay}s`,
          }}
        />
      ))}
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

const SLIME = [
  "....oooo....",
  "..oolllloo..",
  ".oHlllllllo.",
  "oHlllllllllo",
  "olllellelllo",
  "olllellelldo",
  "ollllllllldo",
  "odlllllllddo",
  ".oddddddddo.",
  "..oooooooo..",
];
const SLIME_PAL: Palette = {
  o: "#1d4428",
  l: "#5cc46a",
  d: "#3a9150",
  H: "#d3f7c9",
  e: "#10131c",
};

/**
 * 큰 슬라임이 높이 뛰어 철퍽 착지하면 물방울이 튄다. 새끼 슬라임이 뒤를 쫓는다.
 * 착지(58%)와 물방울 박자는 1.1초로 맞춘다.
 */
function SlimeFx({ px }: { px: number }) {
  const big = px * 1.25;
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
              style={{ left: 6 * big, bottom: big }}
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
            <PixelArt art={SLIME} palette={SLIME_PAL} px={px * 0.6} />
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

export const FLAME = [
  [
    "...r...",
    "...r...",
    "..rRr..",
    "..rRr..",
    ".rRyRr.",
    ".rRyRr.",
    "rRyYyRr",
    "rRyYyRr",
    "rRyYyRr",
    ".rRyRr.",
  ],
  [
    "....r..",
    "...rr..",
    "..rRr..",
    "..rRRr.",
    ".rRyRr.",
    ".rRyyRr",
    "rRyYyRr",
    "rRyYYRr",
    "rRyYyRr",
    ".rRyRr.",
  ],
  [
    "..r....",
    "..rr...",
    ".rRr...",
    ".rRRr..",
    ".rRyRr.",
    "rRyyRr.",
    "rRyYyRr",
    "rRYYyRr",
    "rRyYyRr",
    ".rRyRr.",
  ],
];
export const FLAME_PAL: Palette = {
  r: "#c2410c",
  R: "#f06a1e",
  y: "#ffae2e",
  Y: "#fff1b8",
};
const FLAMES = [
  { left: -6, scale: 1.7, delay: 0 },
  { left: 9, scale: 2.3, delay: -0.15 },
  { left: 27, scale: 1.5, delay: -0.3 },
  { left: 40, scale: 2.1, delay: -0.1 },
  { left: 57, scale: 1.6, delay: -0.25 },
  { left: 70, scale: 2.4, delay: -0.05 },
  { left: 87, scale: 1.8, delay: -0.2 },
];
const EMBERS = Array.from({ length: 10 }, (_, i) => ({
  left: 4 + i * 10,
  delay: -((i * 7) % 20) / 10,
  dur: 1.6 + ((i * 3) % 8) / 10,
}));

/** 초상화 아래 절반을 픽셀 불길이 집어삼키고, 불씨가 솟구치며 화면이 일렁인다 */
function FireFx({ px }: { px: number }) {
  return (
    <>
      <div className="cfx-heat absolute inset-x-0 bottom-0 h-3/4" />
      {FLAMES.map((f, i) => (
        <div
          key={i}
          className="absolute -bottom-[4px]"
          style={{
            left: `${f.left}%`,
            filter: "drop-shadow(0 0 6px rgba(255,140,40,0.85))",
          }}
        >
          <Frames
            frames={FLAME}
            palette={FLAME_PAL}
            px={px * f.scale}
            duration={0.36}
            delay={f.delay}
          />
        </div>
      ))}
      {EMBERS.map((e, i) => (
        <span
          key={i}
          className="cfx-travel cfx-ember absolute bottom-[20%]"
          style={{
            left: `${e.left}%`,
            width: px * 1.3,
            height: px * 1.3,
            animationDuration: `${e.dur}s`,
            animationDelay: `${e.delay}s`,
          }}
        />
      ))}
    </>
  );
}

/* ───────── 박쥐 떼 ───────── */

const BAT = [
  ["x.........x", "xx..x.x..xx", "xxxxexexxxx", "..xxxxxxx..", "....x.x...."],
  ["....x.x....", "...xxxxx...", "..xxexexx..", ".xxx.x.xxx.", "xx.......xx"],
];
export const BAT_PAL: Palette = { x: "#22183a", e: "#ff4f74" };
const BATS = [
  { top: 16, dur: 3.6, delay: 0, flap: 0.22, scale: 1.6, rev: false },
  { top: 44, dur: 4.4, delay: -1.4, flap: 0.26, scale: 1.2, rev: true },
  { top: 6, dur: 5.2, delay: -3.1, flap: 0.2, scale: 1.35, rev: false },
  { top: 30, dur: 4, delay: -2.2, flap: 0.24, scale: 1, rev: true },
  { top: 52, dur: 3.2, delay: -0.6, flap: 0.18, scale: 1.4, rev: false },
  { top: 24, dur: 5.8, delay: -4.4, flap: 0.28, scale: 0.9, rev: true },
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

export const SWORD = [
  "....o....",
  "...oWo...",
  "...oWso..",
  "...oWso..",
  "...oWso..",
  "...oWso..",
  "...oWso..",
  "...oWso..",
  "...oWso..",
  ".ooGgGoo.",
  "oGgggggGo",
  ".ooohooo.",
  "...oho...",
  "...oho...",
  "...oPo...",
  "....o....",
];
export const SWORD_PAL: Palette = {
  o: "#141824",
  W: "#eef3fb",
  s: "#93a3bf",
  g: "#e2b347",
  G: "#9a7426",
  h: "#6e4128",
  P: "#4fb3e8",
};
export const SPARK = [".w.", "wWw", ".w."];

/** 검 한 번 휘두르는 박자(초) — 검·궤적·충격·파편이 모두 이 박자를 따른다 */
const SWORD_BEAT = 3.2;

/**
 * 오른쪽 위에 떠 있던 큰 검이 초상화를 가로질러 크게 베면, 궤적이 남고
 * 화면이 번쩍이며 불꽃이 튄다. 한 바퀴 돌아 제자리로 와서 칼끝이 반짝인다.
 */
function SwordFx({ px }: { px: number }) {
  const sp = px * 1.35;
  const pivotX = 4.5 * sp;
  const pivotY = 11.5 * sp;
  const slash = 40 * sp;
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
            style={{ ...beat, left: 3 * sp, top: -1 * sp }}
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

export const DRAGON = [
  [
    "..............oo",
    "............oowwo",
    "..........oowwwwo",
    "...hh....owwwwwwo",
    "..oRRo..owwwwwwwo",
    ".oRRRRo.owwwwwwo",
    "oReRRRRoowwwwwo",
    "oRRRRRRRRowwwo....oo",
    ".ooobRRRRRRRRRo..oRo",
    "....obbRRRRRRRRooRRo",
    ".....obbbRRRRRRRRRo",
    "......obbRRoRRo.ooo",
    "......oRRo.oRRo",
    "......ooo..ooo",
  ],
  [
    "",
    "",
    "",
    "...hh",
    "..oRRo",
    ".oRRRRo",
    "oReRRRRoooooo",
    "oRRRRRRRRRRRRo....oo",
    ".ooobRRRowwwwwo..oRo",
    "....obbRowwwwwwooRRo",
    ".....obbbowwwwwwRRo",
    "......obbRowwwwo.ooo",
    "......oRRo.owwo",
    "......ooo...oo",
  ],
];
export const DRAGON_PAL: Palette = {
  o: "#2a0e12",
  R: "#d0453c",
  b: "#f5c780",
  w: "#f09a5c",
  e: "#fff07a",
  h: "#ece6d8",
};
export const BREATH = [
  [
    "..yyR.........",
    "yYYyyRRr......",
    "YYYYYyyRRRrr..",
    "yYYYyyyRRRrrrr",
    "YYYYYyyRRRrr..",
    "yYYyyRRr......",
    "..yyR.........",
  ],
  [
    ".yR...........",
    ".yYyRRr.......",
    "yYYYyyRRrr....",
    "YYYYYyyyRRrrrr",
    "yYYYyyRRrr....",
    "..yYyRRr......",
    "...yR.........",
  ],
];
export const BREATH_PAL: Palette = {
  r: "#c2410c",
  R: "#f07a22",
  y: "#ffb83a",
  Y: "#fff3c4",
};

/** 용이 날아오는 박자(초) — 비행·불길·화면 달아오름이 같은 박자 */
const DRAGON_BEAT = 6;

/** 큰 용이 날아와 초상화를 가로지르는 불길을 뿜어 화면이 달아오르고, 빠져나간다 */
function DragonFx({ px }: { px: number }) {
  const dp = px * 1.6;
  const beat = { animationDuration: `${DRAGON_BEAT}s` };
  return (
    <>
      <div className="cfx-travel cfx-scorch absolute inset-0" style={beat} />
      <div className="cfx-travel cfx-dragon-fly absolute" style={beat}>
        <div
          className="cfx-bob relative"
          style={{
            animationDuration: "0.9s",
            filter: outline("rgba(255,180,120,0.9)"),
          }}
        >
          <div
            className="cfx-breath absolute"
            style={{
              ...beat,
              right: "100%",
              top: 2.2 * dp,
              marginRight: -dp,
            }}
          >
            <Frames
              frames={BREATH}
              palette={BREATH_PAL}
              px={dp * 1.5}
              duration={0.2}
            />
          </div>
          <Frames
            frames={DRAGON}
            palette={DRAGON_PAL}
            px={dp}
            duration={0.36}
          />
        </div>
      </div>
    </>
  );
}

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
      className="cfx-root pointer-events-none absolute inset-0 overflow-hidden"
    >
      <Fx px={px} />
    </div>
  );
}
