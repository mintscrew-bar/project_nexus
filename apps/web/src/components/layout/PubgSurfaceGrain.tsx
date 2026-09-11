"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 배그 화면의 필름 그레인.
 *
 * 화면 **위**에 얹는 오버레이다. 바닥에 깔면 페이지들이 자기 배경을
 * 불투명하게 칠해서 통째로 가려진다 — 참고한 화면들도 UI 위에 얹는다.
 *
 * 하는 일은 둘뿐이다. 오버레이를 body 에 붙이고, 커서 좌표를
 * `--pointer-x/--pointer-y` 로 넘겨 그레인에 구멍을 뚫게 한다.
 * 그림은 전부 CSS(`.pubg-grain`)가 그린다.
 *
 * **리렌더를 만들지 않는다.** 좌표를 state 로 들면 마우스를 움직일 때마다
 * 앱 셸 전체가 다시 그려진다. `<html>` 의 style 속성에 직접 쓴다.
 */
export function PubgSurfaceGrain() {
  // 포털은 DOM 이 있어야 한다. 서버 렌더에서는 아무것도 내보내지 않는다.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const root = document.documentElement;

    // 움직임을 줄여 달라고 했으면 좌표를 아예 넘기지 않는다.
    // CSS 기본값(화면 위쪽 가운데)으로 고정되고 마스크도 꺼진다.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let nextX = 0;
    let nextY = 0;

    const paint = () => {
      frame = 0;
      root.style.setProperty("--pointer-x", `${nextX}px`);
      root.style.setProperty("--pointer-y", `${nextY}px`);
    };

    const onMove = (event: PointerEvent) => {
      // 손가락은 무시한다 — 터치는 포인터가 늘 화면에 있지 않아서,
      // 뗀 자리에 구멍이 남으면 얼룩처럼 보인다.
      if (event.pointerType === "touch") return;
      // 오버레이가 뷰포트 기준이라 클라이언트 좌표를 그대로 쓴다.
      nextX = event.clientX;
      nextY = event.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
      root.style.removeProperty("--pointer-x");
      root.style.removeProperty("--pointer-y");
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    // 바깥이 커서 구멍을 뚫고, 안쪽이 살아 움직인다. 한 겹에 몰면 마스크가
    // 애니메이션을 따라 흔들려 구멍이 커서를 벗어난다.
    <div className="pubg-grain" aria-hidden>
      <div className="pubg-grain-film" />
    </div>,
    document.body,
  );
}
