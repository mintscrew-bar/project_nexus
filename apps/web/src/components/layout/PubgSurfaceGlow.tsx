"use client";

import { useEffect } from "react";

/**
 * 배그 화면 바탕의 광원을 커서에 붙인다.
 *
 * 그림은 CSS(`.game-pubg-surface`)가 그리고 여기서는 좌표만 넘긴다 —
 * `--pointer-x/--pointer-y`. 값이 없으면 화면 위쪽 가운데에 고정되므로
 * 터치 기기나 이 컴포넌트가 붙기 전에도 배경은 성립한다.
 *
 * **리렌더를 만들지 않는다.** 좌표를 state 로 들면 마우스를 움직일 때마다
 * 앱 셸 전체가 다시 그려진다. 요소의 style 속성에 직접 쓴다.
 *
 * 갱신은 rAF 로 프레임당 한 번으로 묶는다. pointermove 는 한 프레임에
 * 여러 번 들어오는데 그때마다 style 을 건드리면 레이아웃이 밀린다.
 */
export function PubgSurfaceGlow({
  target,
}: {
  /** 광원을 그리는 요소 — `.game-pubg-surface` 가 붙은 래퍼 */
  target: React.RefObject<HTMLElement | null>;
}) {
  useEffect(() => {
    const el = target.current;
    if (!el) return;

    // 움직임을 줄여 달라고 했으면 좌표를 아예 넘기지 않는다.
    // CSS 기본값(화면 위쪽 가운데)으로 고정돼 질감만 남는다.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let nextX = 0;
    let nextY = 0;

    const paint = () => {
      frame = 0;
      el.style.setProperty("--pointer-x", `${nextX}px`);
      el.style.setProperty("--pointer-y", `${nextY}px`);
    };

    const onMove = (event: PointerEvent) => {
      // 손가락은 무시한다 — 터치는 포인터가 늘 화면에 있지 않아서,
      // 뗀 자리에 빛이 남으면 얼룩처럼 보인다.
      if (event.pointerType === "touch") return;
      // 래퍼 기준 좌표. 배경은 래퍼에 그려지므로 화면 좌표를 그대로 쓰면
      // 헤더 높이만큼 어긋난다.
      const box = el.getBoundingClientRect();
      nextX = event.clientX - box.left;
      nextY = event.clientY - box.top;
      if (!frame) frame = requestAnimationFrame(paint);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
      el.style.removeProperty("--pointer-x");
      el.style.removeProperty("--pointer-y");
    };
  }, [target]);

  return null;
}
