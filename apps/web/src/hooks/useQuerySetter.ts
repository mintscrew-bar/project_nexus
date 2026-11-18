"use client";

import { useCallback } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";

type Next<T> = T | ((prev: T) => T);

/**
 * React Query 캐시를 setState 처럼 바꾸는 함수 — 응답 전체용.
 *
 * 서버 조회를 useEffect + useState 에서 useQuery 로 옮기면서(react-hooks/set-state-in-effect),
 * 처리 직후 목록을 바로 고치던 `setLinks((prev) => prev.map(...))` 같은 코드를 그대로
 * 살리려고 만들었다. 캐시를 고치므로 같은 키를 보는 화면 모두에 바로 반영된다.
 */
export function useQueryDataSetter<T>(queryKey: QueryKey, fallback: T) {
  const queryClient = useQueryClient();
  const keyStr = JSON.stringify(queryKey);
  return useCallback(
    (next: Next<T>) => {
      queryClient.setQueryData<T>(JSON.parse(keyStr), (old) =>
        typeof next === "function"
          ? (next as (prev: T) => T)(old ?? fallback)
          : next,
      );
    },
    // fallback 은 빈 배열 같은 고정값이라 의존성에서 뺀다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, keyStr],
  );
}

/**
 * React Query 캐시 응답 객체의 한 필드를 setState 처럼 바꾸는 함수.
 * 응답이 `{ posts, total }` 이고 화면이 `setPosts(...)` 만 쓰던 경우에 쓴다.
 * 아직 응답이 없으면 아무것도 하지 않는다.
 */
export function useQueryFieldSetter<D extends object, K extends keyof D>(
  queryKey: QueryKey,
  field: K,
) {
  const queryClient = useQueryClient();
  const keyStr = JSON.stringify(queryKey);
  return useCallback(
    (next: Next<D[K]>) => {
      queryClient.setQueryData<D>(JSON.parse(keyStr), (old) =>
        old
          ? {
              ...old,
              [field]:
                typeof next === "function"
                  ? (next as (prev: D[K]) => D[K])(old[field])
                  : next,
            }
          : old,
      );
    },
    [queryClient, keyStr, field],
  );
}
