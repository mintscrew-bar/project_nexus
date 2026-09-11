"use client";

import { useEffect } from "react";

/**
 * 배그 화면 바탕의 광원과 그레인을 커서에 붙인다.
 *
 * 그림은 CSS 가 그리고 여기서는 좌표만 넘긴다 — `--pointer-x/--pointer-y`.
 * 값이 없으면 화면 위쪽 가운데에 고정되므로, 터치 기기와 이 컴포넌트가
 * 붙기 전에도 배경은 성립한다.
 *
 * 좌표를 **`<html>` 에 얹는 이유**: 이 값을 쓰는 곳이 둘이다. 광원은 body 가,
 * 그레인 마스크는 앱 셸 래퍼가 그린다(한 요소에 몰면 마스크가 광원까지
 * 지운다). 커스텀 속성은 상속되므로 최상단에 한 번만 쓰면 둘 다 받는다.
 *
 * **리렌더를 만들지 않는다.** 좌표를 state 로 들면 마우스를 움직일 때마다
 * 앱 셸 전체가 다시 그려진다. style 속성에 직접 쓴다.
 *
 * 갱신은 rAF 로 프레임당 한 번으로 묶는다. pointermove 는 한 프레임에
 * 여러 번 들어오는데 그때마다 style 을 건드리면 레이아웃이 밀린다.
 */
export function PubgSurfaceGlow() {
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
      // 뗀 자리에 빛이 남으면 얼룩처럼 보인다.
      if (event.pointerType === "touch") return;
      // 뷰포트 좌표를 그대로 쓴다. 광원은 `background-attachment: fixed` 라
      // 뷰포트 기준이고, 래퍼는 셸 최상단이라 좌상단이 (0,0) 이다.
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

  return null;
}
