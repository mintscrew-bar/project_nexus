"use client";

import { useCallback } from "react";
import { useResetOn } from "@/hooks/useResetOn";

type Next = number | ((prev: number) => number);

/**
 * 경매에서 눌러 쌓는 추가 입찰액.
 *
 * - 경매 대상 선수(resetKey)가 바뀌면 0 으로 돌아간다(다른 사람 입찰 시에는 유지).
 * - 쓸 수 있는 예산(max)을 넘으면 max 로 잘라 보인다(예비금 반영).
 *
 * 예전엔 두 가지 모두 효과에서 setAccBid 로 고쳤다(react-hooks/set-state-in-effect).
 * 여기서는 되돌림은 useResetOn 이, 자르기는 그릴 때 계산이 한다. 바꿀 때도 잘린 값을
 * 기준으로 계산해 예전과 같은 결과가 나온다.
 */
export function useBidAccumulator(
  resetKey: unknown,
  max: number,
): [number, (next: Next) => void] {
  const [raw, setRaw] = useResetOn(0, resetKey);
  const value = Math.min(raw, max);
  const set = useCallback(
    (next: Next) =>
      setRaw((prev) => {
        const current = Math.min(prev, max);
        return typeof next === "function" ? next(current) : next;
      }),
    [setRaw, max],
  );
  return [value, set];
}
