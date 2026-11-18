"use client";

import { useCallback, useState } from "react";

/**
 * resetKey 가 바뀌면 처음 값으로 돌아가는 상태.
 *
 * 예전엔 `useEffect(() => setPage(1), [gameParam])` 처럼 효과에서 되돌렸는데, 그러면
 * 바뀐 조건으로 한 번 그렸다가 다시 그린다(react-hooks/set-state-in-effect). 여기서는
 * 값을 "어느 조건에서 정한 값인지" 와 같이 들고 있다가, 조건이 다르면 처음 값을 보인다.
 * 효과 없이 같은 결과가 나오고 중간 화면이 없다.
 *
 * resetKey 는 문자열·숫자 같은 원시값으로 준다(여러 개면 JSON.stringify 로 묶는다).
 */
export function useResetOn<T>(
  initial: T,
  resetKey: unknown,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<{ key: unknown; value: T }>({
    key: resetKey,
    value: initial,
  });
  const value = Object.is(state.key, resetKey) ? state.value : initial;
  const set = useCallback(
    (next: T | ((prev: T) => T)) =>
      setState((prev) => {
        const current = Object.is(prev.key, resetKey) ? prev.value : initial;
        return {
          key: resetKey,
          value:
            typeof next === "function" ? (next as (p: T) => T)(current) : next,
        };
      }),
    // initial 은 1·null 같은 고정값이라 의존성에서 뺀다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resetKey],
  );
  return [value, set];
}
