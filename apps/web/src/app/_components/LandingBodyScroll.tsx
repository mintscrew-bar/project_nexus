"use client";

import { useEffect } from "react";

/**
 * 랜딩이 열려 있는 동안 `body` 를 스크롤 가능하게 한다.
 *
 * `body` 는 `h-screen ... overflow-hidden` 이다 — 로비·경매처럼 뷰포트에 딱
 * 맞고 안쪽에서만 스크롤하는 화면을 위한 계약이다. 랜딩은 7000px 짜리 한 장
 * 이라 그대로 두면 잘려서 아래를 볼 수 없다.
 *
 * **전에는 이게 부수효과에 얹혀 있었다.** `LandingMobileNav` 가 마운트되며
 * body 에 `overflow: unset` 을 인라인으로 씌웠고(정리 함수도 원래 값이 아니라
 * `"unset"` 을 넣었다), 그 컴포넌트는 `md:hidden` 으로 버튼만 숨길 뿐 PC 에서도
 * 마운트된다. 그래서 종합 홈을 한 번 거친 탭은 이후 **모든** 앱 화면에서
 * body 가 안 잘렸다 — 로비 참가자·채팅 영역이 안 보이던 원인이다. 새로고침하면
 * 인라인 스타일이 사라져 나았기 때문에 로비 문제로 보였다.
 *
 * 스크롤이 필요한 화면이 직접 켜고, 떠날 때 원래 값으로 되돌린다.
 * 마크업을 그리지 않으므로 랜딩의 SSR 본문에는 영향이 없다.
 */
export function LandingBodyScroll() {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "auto";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return null;
}
