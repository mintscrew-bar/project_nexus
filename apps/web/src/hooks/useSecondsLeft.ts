"use client";

import { useEffect, useState } from "react";

/**
 * 마감 시각(timerEnd, ms)까지 남은 초 — 0.1초마다 다시 계산한다.
 *
 * 예전엔 경매 화면마다 `useEffect(() => { setTimeLeft(calc()); setInterval(...) })` 로
 * 효과 안에서 바로 setState 했다(react-hooks/set-state-in-effect). 여기서는 "지금 시각"
 * 만 타이머로 갱신하고 남은 초는 그릴 때 계산한다. 마감 시각이 바뀌면 다음 그림에서
 * 바로 반영된다(지금 시각은 최대 0.1초 늦을 뿐).
 *
 * Math.ceil: 9.1초 남았을 때 "9" 아닌 "10" 표시 — 숫자가 느리게 내려가는 자연스러운 카운트다운
 */
export function useSecondsLeft(timerEnd: number): number {
  // 처음 값은 한 번만 잡는다(초기값 함수) — 이후엔 타이머가 갱신한다
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(interval);
  }, []);
  return Math.max(0, Math.ceil((timerEnd - now) / 1000));
}
