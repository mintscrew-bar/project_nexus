"use client";

/**
 * 사진 조정(자르기) — 프로필 사진·배경을 올리기 전에 위치와 크기를 맞춘다.
 *
 * - 틀(프로필 사진은 원, 배경은 3:1 직사각형) 안에서 사진을 끌어 옮기고, 슬라이더·휠로 확대한다.
 * - 사진은 언제나 틀을 꽉 채운다(빈 곳이 생기도록 옮기거나 줄일 수 없다).
 * - "적용"을 누르면 틀에 보이는 부분만 정해진 크기로 다시 그려 webp 파일로 넘긴다.
 *   (움직이는 GIF 는 첫 장면만 남는다)
 * 라이브러리 없이 canvas 로 그린다.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface CropSpec {
  /** 가로 / 세로 */
  aspect: number;
  /** 원 모양 틀 (프로필 사진) */
  round?: boolean;
  /** 결과 가로 픽셀 */
  outputWidth: number;
}

export const AVATAR_CROP: CropSpec = {
  aspect: 1,
  round: true,
  outputWidth: 512,
};
export const BANNER_CROP: CropSpec = { aspect: 3, outputWidth: 1500 };

const MAX_ZOOM = 4;

export function ImageCropper({
  file,
  spec,
  onCancel,
  onConfirm,
}: {
  file: File;
  spec: CropSpec;
  onCancel: () => void;
  onConfirm: (cropped: File) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [frameW, setFrameW] = useState(0);
  const [zoom, setZoom] = useState(1);
  // 틀 가운데 기준 사진 가운데의 이동량(틀 픽셀)
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );
  const [working, setWorking] = useState(false);

  // 파일 → 미리보기 주소 (닫을 때 해제)
  useEffect(() => {
    const url = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSrc(url);
    const el = new Image();
    el.onload = () => setImg(el);
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // 틀 폭을 재 둔다 (창 크기에 맞춰 변함)
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFrameW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const frameH = frameW / spec.aspect;
  // 확대 1 = 사진이 틀을 딱 덮는 크기
  const baseScale = img
    ? Math.max(frameW / img.naturalWidth, frameH / img.naturalHeight)
    : 1;
  const scale = baseScale * zoom;
  const drawW = img ? img.naturalWidth * scale : 0;
  const drawH = img ? img.naturalHeight * scale : 0;

  /** 사진이 틀 밖으로 비지 않게 이동량을 묶는다 */
  const clamp = useCallback(
    (x: number, y: number, w = drawW, h = drawH) => {
      const maxX = Math.max(0, (w - frameW) / 2);
      const maxY = Math.max(0, (h - frameH) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, x)),
        y: Math.min(maxY, Math.max(-maxY, y)),
      };
    },
    [drawW, drawH, frameW, frameH],
  );

  const setZoomClamped = (next: number) => {
    const z = Math.min(MAX_ZOOM, Math.max(1, next));
    if (!img) return setZoom(z);
    const w = img.naturalWidth * baseScale * z;
    const h = img.naturalHeight * baseScale * z;
    setZoom(z);
    setOffset((o) => clamp(o.x, o.y, w, h));
  };

  const confirm = async () => {
    if (!img || !frameW) return;
    setWorking(true);
    try {
      const outW = spec.outputWidth;
      const outH = Math.round(outW / spec.aspect);
      const ratio = outW / frameW; // 틀 픽셀 → 결과 픽셀
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingQuality = "high";
      // 틀 왼쪽 위 기준 사진 왼쪽 위 위치
      const left = (frameW - drawW) / 2 + offset.x;
      const top = (frameH - drawH) / 2 + offset.y;
      ctx.drawImage(
        img,
        left * ratio,
        top * ratio,
        drawW * ratio,
        drawH * ratio,
      );
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.9),
      );
      if (!blob) return;
      const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
      onConfirm(new File([blob], name, { type: "image/webp" }));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        ref={frameRef}
        className={cn(
          "relative w-full touch-none select-none overflow-hidden bg-bg-primary",
          spec.round ? "mx-auto max-w-[320px] rounded-full" : "rounded-xl",
          img ? "cursor-grab active:cursor-grabbing" : "",
        )}
        style={{ aspectRatio: String(spec.aspect) }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            ox: offset.x,
            oy: offset.y,
          };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setOffset(
            clamp(
              drag.current.ox + (e.clientX - drag.current.x),
              drag.current.oy + (e.clientY - drag.current.y),
            ),
          );
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onWheel={(e) => setZoomClamped(zoom - e.deltaY * 0.0015)}
      >
        {src && img && frameW > 0 && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt="조정할 사진"
            draggable={false}
            className="pointer-events-none absolute max-w-none"
            style={{
              width: drawW,
              height: drawH,
              left: (frameW - drawW) / 2 + offset.x,
              top: (frameH - drawH) / 2 + offset.y,
            }}
          />
        )}
        {/* 가이드 격자 — 끌고 있을 때 위치 잡기 쉽게 */}
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-30">
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className="border border-white/20" />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setZoomClamped(zoom - 0.2)}
          className="text-text-tertiary hover:text-text-primary"
          aria-label="축소"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoomClamped(Number(e.target.value))}
          className="flex-1 accent-[rgb(var(--color-accent-primary))]"
          aria-label="확대"
        />
        <button
          type="button"
          onClick={() => setZoomClamped(zoom + 0.2)}
          className="text-text-tertiary hover:text-text-primary"
          aria-label="확대"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>
      <p className="text-center text-xs text-text-tertiary">
        끌어서 위치를 옮기고, 슬라이더나 마우스 휠로 크기를 맞추세요
      </p>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          취소
        </Button>
        <Button
          onClick={confirm}
          disabled={!img || working}
          isLoading={working}
        >
          적용
        </Button>
      </div>
    </div>
  );
}
