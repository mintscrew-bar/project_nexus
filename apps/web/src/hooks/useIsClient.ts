"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * 브라우저에서 그리는 중인가 — 서버 렌더(하이드레이션 전)에는 false, 브라우저에선 true.
 *
 * 예전에는 `useEffect(() => setMounted(true), [])` 로 알았는데, 효과 안에서 상태를 바로
 * 바꾸면 한 번 더 그리게 된다(react-hooks/set-state-in-effect). useSyncExternalStore 는
 * 서버 값과 클라이언트 값을 따로 받아 하이드레이션 불일치 없이 같은 일을 한다.
 * createPortal(document.body 필요)이나 window·localStorage 를 읽는 화면에 쓴다.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
