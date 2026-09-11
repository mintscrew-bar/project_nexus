"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 배그 화면의 필름 그레인.
 *
 * 콘텐츠 **뒤**에 깔리는 고정 레이어다(`z-index: -1`). 카드는 불투명하므로
 * 카드 사이 여백과 페이지 가장자리에서 보인다.
 *
 * body 로 포털하는 이유: 토큰 클래스(`.game-pubg`)는 포털 모달까지 덮으려고
 * 셸 래퍼와 body 양쪽에 붙어서, 질감을 그 클래스에 넣으면 두 겹으로 깔린다.
 * 셸 래퍼 안에 두는 것도 안 된다 — 거기서 `z-index: -1` 을 쓰려면 래퍼에
 * 쌓임 맥락이 필요하고, 그러면 안쪽 `fixed` 요소가 갇힌다(친구 패널이
 * 모달 아래로 내려간다). body 직계는 쌓임 맥락을 만들지 않아 안전하다.
 *
 * 그림은 전부 CSS(`.pubg-grain`)가 그린다. 여기는 자리만 잡는다.
 */
export function PubgSurfaceGrain() {
  // 포털은 DOM 이 있어야 한다. 서버 렌더에서는 아무것도 내보내지 않는다.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return createPortal(
    <div className="pubg-grain" aria-hidden>
      <div className="pubg-grain-film" />
    </div>,
    document.body,
  );
}
