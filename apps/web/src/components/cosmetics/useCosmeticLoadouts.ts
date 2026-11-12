"use client";

import { useQuery } from "@tanstack/react-query";
import { shopApi, type CosmeticLoadoutState } from "@/lib/api-client";

/** 장착 상태 쿼리 키 머리 — 상점에서 장착을 바꾸면 이 키를 무효화한다 */
export const LOADOUT_QUERY_KEY = "cosmeticLoadouts";

/**
 * 여러 사람이 장착한 꾸미기를 한 번에 읽는다 (로비 카드·프로필).
 * 같은 사람들이면 순서가 바뀌어도 같은 요청으로 본다.
 * 꾸미기는 부가 표시라 실패해도 빈 값으로 넘어간다.
 */
export function useCosmeticLoadouts(userIds: (string | null | undefined)[]) {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))].sort();
  const { data } = useQuery({
    queryKey: [LOADOUT_QUERY_KEY, ids.join(",")],
    queryFn: () => shopApi.getLoadouts(ids),
    enabled: ids.length > 0,
    staleTime: 60 * 1000,
    retry: false,
  });
  return (data ?? {}) as Record<string, CosmeticLoadoutState>;
}
