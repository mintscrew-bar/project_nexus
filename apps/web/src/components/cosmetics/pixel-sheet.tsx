"use client";

import { useEffect, useRef } from "react";
import { cosmeticFxPaused } from "@/stores/cosmetic-fx-store";

/**
 * 스프라이트 시트 한 장을 캔버스에 한 칸씩 돌려 그리는 픽셀 애니메이션.
 *
 * 시트는 pixelfx(픽셀 효과 라이브러리)로 그려 구운 PNG — 칸이 가로 `columns` 개씩
 * 왼쪽 위부터 차례로 놓여 있다. 캔버스 해상도는 칸 하나 크기 그대로이고, 화면에서는
 * 폭에 맞춰 키우되 **가로세로 비율을 지켜** 픽셀이 정사각형으로 보이게 한다
 * (예전 실시간 불은 칸을 초상화 크기에 억지로 늘려 세로로 길쭉한 칸이 됐다).
 *
 * 화면 밖이거나 탭이 숨으면 멈추고, 꾸미기 「멈춘 그림」·「숨기기」면 지금 칸에서 멈춘다.
 * 움직임 줄이기 설정이면 첫 칸만 그린다.
 */
export function PixelSheet({
  src,
  frameW,
  frameH,
  frames,
  columns,
  fps,
  className,
  style,
}: {
  src: string;
  frameW: number;
  frameH: number;
  frames: number;
  columns: number;
  fps: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.imageSmoothingEnabled = false;

    const img = new Image();
    let frame = 0;
    let raf = 0;
    let last = 0;
    let visible = true;
    let cancelled = false;

    const paint = () => {
      const sx = (frame % columns) * frameW;
      const sy = Math.floor(frame / columns) * frameH;
      ctx.clearRect(0, 0, frameW, frameH);
      ctx.drawImage(img, sx, sy, frameW, frameH, 0, 0, frameW, frameH);
    };

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });

    img.onload = () => {
      if (cancelled) return;
      paint();
      const reduce = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (reduce) return;
      io.observe(canvas);
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        if (!visible || document.hidden || cosmeticFxPaused()) return;
        if (now - last < 1000 / fps) return;
        last = now;
        frame = (frame + 1) % frames;
        paint();
      };
      raf = requestAnimationFrame(loop);
    };
    img.src = src;

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [src, frameW, frameH, frames, columns, fps]);

  return (
    <canvas
      ref={canvasRef}
      width={frameW}
      height={frameH}
      className={className}
      style={{
        // 폭에 맞추고 높이는 비율대로 — 칸이 정사각형으로 남는다
        width: "100%",
        height: "auto",
        aspectRatio: `${frameW} / ${frameH}`,
        imageRendering: "pixelated",
        ...style,
      }}
    />
  );
}
