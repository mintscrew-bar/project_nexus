"use client";

/**
 * 길게 눌러 내전 종료 — 경매·스네이크·역할 선택·대진표 머리글이 함께 쓰는 버튼.
 *
 * 1초 동안 누르고 있으면 버튼이 왼쪽부터 빨갛게 차오르고, 다 차면 onConfirm 을 한 번 부른다.
 * 중간에 떼면 취소되고 처음으로 돌아간다. 확인 창을 대신한다.
 * - 마우스·터치: pointer 이벤트(포인터 캡처). 모바일 길게 누르기 메뉴는 막는다.
 * - 키보드: Space/Enter 를 누르고 있으면 같은 방식으로 동작한다.
 * - 한 번 누를 때 한 번만 실행되고, 실패해서 isBusy 가 풀리면 처음으로 돌아간다.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Power } from "lucide-react";
import { cn } from "@/lib/utils";

/** 길게 눌러야 하는 시간(ms) */
const HOLD_MS = 1000;

export function HoldToEndButton({
  onConfirm,
  isBusy = false,
  label = "길게 눌러 종료",
  shortLabel,
  title = "1초 동안 누르고 있으면 이 판을 종료하고 대기실로 돌아갑니다 (전적에 반영되지 않음)",
  size = "md",
  className,
}: {
  onConfirm: () => void;
  /** 종료 요청 중 — 버튼을 잠그고 "종료하는 중…" 으로 표시 */
  isBusy?: boolean;
  label?: string;
  /** 좁은 화면(sm 미만)에서 쓰는 짧은 글자. 없으면 label 그대로 */
  shortLabel?: string;
  title?: string;
  /** md = 높이 40px(대진표 머리글), sm = 32px(경매·드래프트·역할 선택 머리글) */
  size?: "sm" | "md";
  className?: string;
}) {
  const [progress, setProgress] = useState(0);
  const frame = useRef<number | null>(null);
  // 한 번 누를 때 onConfirm 이 두 번 불리지 않게
  const fired = useRef(false);

  const cancel = useCallback(() => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (!fired.current) setProgress(0);
  }, []);

  const begin = useCallback(() => {
    if (isBusy || frame.current) return;
    fired.current = false;
    const t0 = performance.now();
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / HOLD_MS);
      setProgress(p);
      if (p >= 1) {
        frame.current = null;
        fired.current = true;
        onConfirm();
        return;
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [isBusy, onConfirm]);

  // 화면을 떠나면 진행 중인 애니메이션 정리
  useEffect(() => () => cancel(), [cancel]);

  // 실패해서 다시 누를 수 있게 되면 채움을 되돌린다
  useEffect(() => {
    if (!isBusy && fired.current) {
      fired.current = false;
      setProgress(0);
    }
  }, [isBusy]);

  const holding = progress > 0 && progress < 1;
  const text = isBusy ? "종료하는 중…" : holding ? "놓으면 취소" : null;

  return (
    <button
      type="button"
      disabled={isBusy}
      onPointerDown={(e) => {
        // 왼쪽 버튼·터치만
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        begin();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          begin();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") cancel();
      }}
      onBlur={cancel}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        "relative flex shrink-0 touch-none select-none items-center gap-1.5 overflow-hidden rounded-xl border border-accent-danger/60 bg-accent-danger/10 font-bold text-accent-danger transition-colors hover:border-accent-danger hover:bg-accent-danger/15 disabled:opacity-60",
        size === "md" ? "h-10 px-3.5 text-sm" : "h-8 px-3 text-xs",
        className,
      )}
      title={title}
      aria-label="내전 종료 — 길게 눌러 실행"
    >
      {/* 차오르는 빨강 */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 bg-accent-danger/45"
        style={{ width: `${progress * 100}%` }}
      />
      <Power
        className={cn("relative", size === "md" ? "h-4 w-4" : "h-3.5 w-3.5")}
      />
      {text ? (
        <span className="relative">{text}</span>
      ) : shortLabel ? (
        <>
          <span className="relative hidden sm:inline">{label}</span>
          <span className="relative sm:hidden">{shortLabel}</span>
        </>
      ) : (
        <span className="relative">{label}</span>
      )}
    </button>
  );
}
