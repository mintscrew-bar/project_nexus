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

/** 초상화 아래쪽을 통통 튀며 좌우로 오간다 */
function SlimeFx({ px }: { px: number }) {
  return (
    <div className="cfx-slime-walk absolute bottom-0">
      <div className="cfx-slime-face">
        <div className="cfx-slime-hop">
          <PixelArt art={SLIME} palette={SLIME_PAL} px={px} />
        </div>
      </div>
    </div>
  );
}

/* ───────── 꼬마 유령 (벡터) ───────── */

function GhostFx({ px }: { px: number }) {
  const w = 10 * px;
  return (
    <div className="cfx-travel cfx-ghost-wander absolute">
      <div className="cfx-ghost-bob">
        <svg
          width={w}
          height={w * 1.15}
          viewBox="0 0 24 28"
          style={{ filter: "drop-shadow(0 0 5px rgba(196,206,255,0.75))" }}
        >
          <path
            d="M12 1C5.5 1 2 6 2 12v14l3.4-3 3.3 3 3.3-3 3.3 3 3.3-3 3.4 3V12C22 6 18.5 1 12 1Z"
            fill="rgba(238,242,255,0.92)"
          />
          <g className="cfx-ghost-blink">
            <ellipse cx="8.6" cy="12" rx="1.6" ry="2.2" fill="#1b1f2e" />
            <ellipse cx="15.4" cy="12" rx="1.6" ry="2.2" fill="#1b1f2e" />
          </g>
          <ellipse cx="6.4" cy="15.6" rx="1.5" ry="0.9" fill="#f5a3bd" />
          <ellipse cx="17.6" cy="15.6" rx="1.5" ry="0.9" fill="#f5a3bd" />
        </svg>
      </div>
    </div>
  );
}

/* ───────── 벚꽃 (벡터) ───────── */

const PETALS = [
  { left: 6, dur: 6.2, delay: 0, size: 1 },
  { left: 22, dur: 7.4, delay: -2.5, size: 0.8 },
  { left: 38, dur: 5.6, delay: -4.1, size: 1.1 },
  { left: 52, dur: 6.8, delay: -1.2, size: 0.9 },
  { left: 66, dur: 7.9, delay: -5.3, size: 1 },
  { left: 80, dur: 6.1, delay: -3.4, size: 0.75 },
  { left: 92, dur: 7.1, delay: -0.6, size: 0.95 },
];

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
              animationDuration: `${p.dur / 2.5}s`,
              animationDelay: `${p.delay}s`,
            }}
          >
            <svg
              width={4.5 * px * p.size}
              height={4.5 * px * p.size}
              viewBox="0 0 10 10"
            >
              <path
                d="M5 0C8.5 2 9.5 6.5 5 10 .5 6.5 1.5 2 5 0Z"
                fill="#f6a5c4"
              />
              <path
                d="M5 2.2C6.4 3.4 6.6 6 5 8 3.4 6 3.6 3.4 5 2.2Z"
                fill="#fcd6e5"
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
  r: "#b8401a",
  R: "#e8692a",
  y: "#f2a33a",
  Y: "#fbe3a0",
};
const FLAMES = [
  { left: -3, scale: 1, delay: 0 },
  { left: 13, scale: 1.4, delay: -0.15 },
  { left: 31, scale: 0.9, delay: -0.3 },
  { left: 47, scale: 1.25, delay: -0.1 },
  { left: 64, scale: 1, delay: -0.25 },
  { left: 80, scale: 1.45, delay: -0.05 },
];
const EMBERS = [
  { left: 12, delay: 0, dur: 2.2 },
  { left: 30, delay: -0.8, dur: 2.6 },
  { left: 51, delay: -1.5, dur: 2.1 },
  { left: 70, delay: -0.4, dur: 2.8 },
  { left: 86, delay: -1.9, dur: 2.4 },
];

function FireFx({ px }: { px: number }) {
  return (
    <>
      {/* 바닥 열기 */}
      <div className="cfx-heat absolute inset-x-0 bottom-0 h-1/2" />
      {EMBERS.map((e, i) => (
        <span
          key={i}
          className="cfx-travel cfx-ember absolute bottom-[12%]"
          style={{
            left: `${e.left}%`,
            width: px,
            height: px,
            animationDuration: `${e.dur}s`,
            animationDelay: `${e.delay}s`,
          }}
        />
      ))}
      {FLAMES.map((f, i) => (
        <div
          key={i}
          className="absolute -bottom-[3px]"
          style={{ left: `${f.left}%` }}
        >
          <Frames
            frames={FLAME}
            palette={FLAME_PAL}
            px={px * f.scale}
            duration={0.42}
            delay={f.delay}
          />
        </div>
      ))}
    </>
  );
}

/* ───────── 박쥐 떼 ───────── */

const BAT = [
  ["x.........x", "xx..x.x..xx", "xxxxexexxxx", "..xxxxxxx..", "....x.x...."],
  ["....x.x....", "...xxxxx...", "..xxexexx..", ".xxx.x.xxx.", "xx.......xx"],
];
export const BAT_PAL: Palette = { x: "#1c1428", e: "#ef5d7a" };
const BATS = [
  { top: 22, dur: 6.5, delay: 0, bob: 1.1, flap: 0.3, scale: 1 },
  { top: 42, dur: 8, delay: -3.2, bob: 1.4, flap: 0.36, scale: 0.8 },
  { top: 10, dur: 9.5, delay: -6.1, bob: 0.9, flap: 0.28, scale: 0.9 },
];

function BatsFx({ px }: { px: number }) {
  return (
    <>
      {BATS.map((b, i) => (
        <div
          key={i}
          className="cfx-travel cfx-bat-path absolute"
          style={{
            top: `${b.top}%`,
            animationDuration: `${b.dur}s`,
            animationDelay: `${b.delay}s`,
          }}
        >
          <div
            className="cfx-bob"
            style={{
              animationDuration: `${b.bob}s`,
              filter: "drop-shadow(0 0 2px rgba(190,140,255,0.8))",
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

/**
 * 초상화 오른쪽 위에 떠 있다가, 몇 초마다 왼쪽으로 크게 휘둘러 베기 궤적을 남기고
 * 한 바퀴 돌아 제자리로 온다. 칼끝에 가끔 반짝임.
 */
function SwordFx({ px }: { px: number }) {
  const pivotX = 4.5 * px;
  const pivotY = 11.5 * px;
  const slash = 36 * px;
  return (
    <div className="absolute right-[16%] top-[8%]">
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
          stroke="rgba(150,200,255,0.55)"
          strokeWidth={7}
          strokeLinecap="round"
        />
        <path
          d="M46 11.4A26 26 0 1 0 43.9 59.4"
          pathLength={100}
          fill="none"
          stroke="#f5f9ff"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      </svg>
      <div
        className="cfx-sword"
        style={{
          transformOrigin: `${pivotX}px ${pivotY}px`,
          filter: "drop-shadow(0 0 3px rgba(120,190,255,0.7))",
        }}
      >
        <PixelArt art={SWORD} palette={SWORD_PAL} px={px} />
        <PixelArt
          art={SPARK}
          palette={{ w: "#cfe6ff", W: "#ffffff" }}
          px={px}
          className="cfx-glint absolute"
          style={{ left: 3 * px, top: -1 * px }}
        />
      </div>
    </div>
  );
}

/* ───────── 천둥번개 (벡터) ───────── */

const BOLTS = [
  { left: 14, delay: 0, flip: false, h: 92 },
  { left: 60, delay: 1.9, flip: true, h: 78 },
];

function LightningFx({ px }: { px: number }) {
  return (
    <>
      {BOLTS.map((b, i) => (
        <div key={i} className="contents">
          {/* 번쩍일 때 초상화 전체가 잠깐 밝아진다 */}
          <div
            className="cfx-travel cfx-flash absolute inset-0 bg-sky-100"
            style={{ animationDelay: `${b.delay}s` }}
          />
          <svg
            className="cfx-travel cfx-bolt absolute top-0"
            width={13 * px}
            viewBox="0 0 20 60"
            preserveAspectRatio="none"
            style={{
              left: `${b.left}%`,
              height: `${b.h}%`,
              animationDelay: `${b.delay}s`,
              transform: b.flip ? "scaleX(-1)" : undefined,
              filter:
                "drop-shadow(0 0 3px rgba(147,197,253,0.95)) drop-shadow(0 0 8px rgba(96,165,250,0.7))",
            }}
          >
            <polygon
              points="13,0 4,25 10,25 3,60 18,20 11,20 17,0"
              fill="#fffbe6"
              stroke="#1e3a8a"
              strokeWidth={0.8}
              strokeLinejoin="round"
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
  R: "#c2453f",
  b: "#f0c27e",
  w: "#e9925a",
  e: "#fde68a",
  h: "#e7e2d6",
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
  R: "#ea7a2a",
  y: "#f6b74a",
  Y: "#fff0bf",
};

/** 오른쪽에서 날아와 가운데에서 불을 뿜고 왼쪽으로 빠져나간다 (8초에 한 번) */
function DragonFx({ px }: { px: number }) {
  return (
    <div className="cfx-travel cfx-dragon-fly absolute">
      <div
        className="cfx-bob relative"
        style={{
          animationDuration: "1.2s",
          filter: "drop-shadow(0 0 2px rgba(255,226,190,0.85))",
        }}
      >
        <div
          className="cfx-breath absolute"
          style={{ right: "100%", top: 3.5 * px * 1.2, marginRight: -px }}
        >
          <Frames
            frames={BREATH}
            palette={BREATH_PAL}
            px={px * 1.1}
            duration={0.24}
          />
        </div>
        <Frames frames={DRAGON} palette={DRAGON_PAL} px={px} duration={0.5} />
      </div>
    </div>
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
