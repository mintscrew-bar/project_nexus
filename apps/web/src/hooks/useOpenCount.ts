"use client";

import { useState } from "react";

/**
 * 창이 몇 번째로 열렸는가 — 닫혔다가 다시 열릴 때마다 1 씩 늘어난다.
 *
 * 폼 창을 열 때마다 입력값을 처음으로 되돌리려고 `key={useOpenCount(isOpen)}` 로 쓴다.
 * 예전엔 `useEffect(() => { if (isOpen) setName(room.name); ... }, [isOpen])` 처럼 효과에서
 * 하나씩 되돌렸다(react-hooks/set-state-in-effect). key 가 바뀌면 React 가 새로 만들어
 * useState 초기값이 다시 적용된다. 닫을 때는 key 를 바꾸지 않아 닫힘 애니메이션이 산다.
 *
 * 열림이 바뀐 걸 그리는 중에 알아채고 바로 상태를 고친다 — React 문서의 "prop 이 바뀔 때
 * 상태 조정" 방식이다(효과보다 한 번 덜 그린다).
 */
export function useOpenCount(isOpen: boolean): number {
  const [state, setState] = useState({ wasOpen: isOpen, count: 0 });
  if (state.wasOpen !== isOpen) {
    const next = {
      wasOpen: isOpen,
      count: isOpen ? state.count + 1 : state.count,
    };
    setState(next);
    return next.count;
  }
  return state.count;
}
