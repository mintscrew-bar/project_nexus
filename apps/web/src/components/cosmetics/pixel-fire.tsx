"use client";

import { useEffect, useRef } from "react";

/**
 * 실시간 픽셀 불 — 칸마다 열(0~1)을 들고, 매 박자마다 아래 칸의 열을 물려받아
 * 조금씩 식으며 위로 올라간다. 식는 양과 옆으로 쏠리는 정도를 칸마다 무작위로
 * 흔들어 불길이 이글이글 갈라진다.
 *
 * 자체 규칙 (흔한 "열 전파" 기법을 우리 식으로 짠 것):
 * - 아래 줄에서 무작위로 한 칸(왼·가운데·오른)을 골라 물려받는다 — 평균을 내면 불길이
 *   가로로 뭉개져 줄무늬가 되므로 하나만 골라 혀가 갈라지게 한다
 * - 바람: 시간에 따라 천천히 좌우로 바뀌는 약한 쏠림(사인파)
 * - 식는 양은 「불길이 몇 %까지 솟는가(reach)」로 정한다
 * - 불씨 칸도 매 박자 듬성듬성 꺼졌다 켜져 밑동부터 불길이 끊겨 올라간다
 * - 불티: 아주 드물게 위쪽 빈 칸에 불씨를 띄워 몇 박자 떠오르다 사라진다
 * - 색은 사이트 톤에 맞춘 6단계(검붉음→진홍→주황→노랑→연노랑)
 *
 * 화면 밖이거나 탭이 숨으면 멈추고, 움직임 줄이기 설정이면 한 장면만 그린다.
 */

/** 열 → 색 (아래 값부터). 0 은 투명 */
const STOPS: [number, [number, number, number]][] = [
  [0.1, [96, 12, 10]],
  [0.22, [168, 22, 16]],
  [0.36, [222, 52, 20]],
  [0.52, [255, 128, 24]],
  [0.7, [255, 204, 40]],
  [0.88, [255, 240, 150]],
];

function colorOf(h: number): [number, number, number, number] {
  if (h < STOPS[0][0]) return [0, 0, 0, 0];
  let c = STOPS[0][1];
  for (const [t, rgb] of STOPS) if (h >= t) c = rgb;
  // 가장 옅은 열은 반투명 — 불길 끝이 사진 위에서 부드럽게 사라진다
  const a = h < 0.16 ? 150 : 255;
  return [c[0], c[1], c[2], a];
}

export type FireSource =
  /** 바닥 한 줄이 탄다 (카드) */
  | { kind: "bottom" }
  /** 원 둘레가 탄다 (아바타). 칸 단위 중심·반지름 */
  | { kind: "ring"; cx: number; cy: number; r: number };

export function PixelFire({
  cols,
  rows,
  cell,
  source,
  /** 불길이 평균적으로 솟는 높이 — 캔버스 높이에 대한 비율 (0~1) */
  reach = 0.5,
  /** 초당 박자 */
  fps = 22,
  fill = false,
  className,
  style,
}: {
  /** 부모 크기에 맞춰 늘린다 (카드 초상화처럼 폭이 제각각일 때) */
  fill?: boolean;
  cols: number;
  rows: number;
  /** 한 칸의 화면 크기(px) */
  cell: number;
  source: FireSource;
  reach?: number;
  fps?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 원 둘레 불씨 자리는 매번 다시 계산하지 않게 문자열로 비교한다
  const sourceKey = JSON.stringify(source);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const W = cols;
    const H = rows;
    let heat = new Float32Array(W * H);
    let next = new Float32Array(W * H);
    const img = ctx.createImageData(W, H);
    const src: FireSource = JSON.parse(sourceKey);

    // 불씨 칸 — 매 박자 다시 달군다
    const seeds: number[] = [];
    if (src.kind === "bottom") {
      for (let x = 0; x < W; x++) seeds.push((H - 1) * W + x);
    } else {
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const d = Math.hypot(x + 0.5 - src.cx, y + 0.5 - src.cy);
          if (Math.abs(d - src.r) < 0.9) seeds.push(y * W + x);
        }
    }

    const colCool = new Float32Array(W);
    const colSeed = Float32Array.from(
      { length: W },
      () => Math.random() * 6.28,
    );
    // 불티 (떠오르는 불씨) — 위치·열
    const sparks: { x: number; y: number; h: number; vx: number }[] = [];
    let t = 0;

    const step = () => {
      t += 1;
      // 불씨 달구기 — 대부분 뜨겁고 가끔 식은 칸이 섞여 불길이 갈라진다
      // 자리마다 천천히 오르내리는 화력 — 어떤 혀는 높이, 어떤 혀는 낮게 솟는다
      for (const i of seeds) {
        const x = i % W;
        const surge =
          0.5 + 0.5 * Math.sin(x * 0.55 + t * 0.09 + Math.sin(x * 1.7));
        heat[i] =
          Math.random() < 0.82
            ? 0.72 + 0.28 * surge * Math.random() + 0.1 * surge
            : 0.3;
      }

      // 아주 약한 바람 — 한쪽으로 쏠려 보이지 않게 좌우가 고르게 바뀐다
      const wind = Math.sin(t / 60) * 0.12;
      // 평균 식는 양 — 불씨 열(~0.9)이 reach 높이쯤에서 다 식게
      const cool = 0.9 / Math.max(2, H * reach);
      // 세로줄마다 식는 정도 — 시간에 따라 **천천히** 바뀐다. 줄마다 오래 유지돼야
      // 불길이 세로 혀로 솟는다(매 박자 새로 뽑으면 그 차이가 위로 쌓여 가로 줄무늬가 된다)
      for (let x = 0; x < W; x++) {
        const wave =
          Math.sin(x * 0.7 + t * 0.07 + colSeed[x]) +
          Math.sin(x * 0.23 - t * 0.045 + colSeed[x] * 0.5);
        // 0.3(높이 솟는 혀) ~ 1.9(금방 꺼지는 골) — 차이가 커야 색 경계가 가로로 줄 서지 않는다
        const k = wave * 0.25 + 0.5;
        colCool[x] = 0.3 + 1.6 * k * k + Math.random() * 0.15;
      }
      for (let y = 0; y < H - 1; y++) {
        const below = (y + 1) * W;
        for (let x = 0; x < W; x++) {
          const rnd = Math.random();
          // 거의 바로 아래 칸만 — 옆 칸을 자주 빌리면 이웃 칸이 같은 값을 베껴
          // 가로로 같은 색 토막이 생긴다. 가끔(약 6%)만 옆으로 흔들린다
          const off = rnd < 0.06 + wind ? 1 : rnd > 0.94 + wind ? -1 : 0;
          const sx = Math.min(W - 1, Math.max(0, x + off));
          const v = heat[below + sx] - cool * colCool[x] * (0.85 + rnd * 0.3);
          next[y * W + x] = v > 0 ? v : 0;
        }
      }
      // 맨 아래 줄은 그대로 (바닥 불씨 또는 빈 칸)
      for (let x = 0; x < W; x++) next[(H - 1) * W + x] = heat[(H - 1) * W + x];
      // 원 불씨는 위 계산에 덮였을 수 있으니 다시 달군다
      if (src.kind === "ring")
        for (const i of seeds) next[i] = Math.max(next[i], heat[i]);
      [heat, next] = [next, heat];

      // 불티 — 드물게 생겨 위로 떠오르며 식는다
      if (Math.random() < 0.18 && seeds.length) {
        const i = seeds[(Math.random() * seeds.length) | 0];
        sparks.push({
          x: i % W,
          y: Math.floor(i / W) - 4 - Math.random() * 4,
          h: 0.5 + Math.random() * 0.25,
          vx: (Math.random() - 0.5) * 0.4,
        });
      }
      for (let k = sparks.length - 1; k >= 0; k--) {
        const s = sparks[k];
        s.y -= 0.6;
        s.x += s.vx + wind * 0.1;
        s.h -= 0.025;
        if (s.h < 0.2 || s.y < 0) sparks.splice(k, 1);
      }

      // 그리기
      const d = img.data;
      for (let i = 0; i < W * H; i++) {
        const [r, g, b, a] = colorOf(heat[i]);
        d[i * 4] = r;
        d[i * 4 + 1] = g;
        d[i * 4 + 2] = b;
        d[i * 4 + 3] = a;
      }
      for (const s of sparks) {
        const x = Math.round(s.x);
        const y = Math.round(s.y);
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const [r, g, b] = colorOf(s.h);
        const i = (y * W + x) * 4;
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
        d[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    };

    // 처음부터 불이 차 있게 몇 박자 미리 돌린다
    for (let i = 0; i < H * 2; i++) step();

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    let raf = 0;
    let last = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(canvas);
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden) return;
      if (now - last < 1000 / fps) return;
      last = now;
      step();
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [cols, rows, sourceKey, reach, fps]);

  return (
    <canvas
      ref={canvasRef}
      width={cols}
      height={rows}
      className={className}
      style={{
        width: fill ? "100%" : cols * cell,
        height: fill ? "100%" : rows * cell,
        imageRendering: "pixelated",
        ...style,
      }}
    />
  );
}
