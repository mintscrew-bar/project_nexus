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

/* ───────── 한 사람씩 읽되 요청은 한 번으로 묶는다 ─────────
 * 채팅·경매·결과창처럼 이름이 한 줄씩 따로 그려지는 곳은 사람마다 훅을 부른다.
 * 같은 순간(같은 박자)에 들어온 요청을 모아 /shop/loadouts 한 번으로 보낸다.
 * 서버는 한 번에 100명까지 받으므로 넘치면 나눠 보낸다. */
const LOOKUP_MAX = 100;
let pending = new Map<
  string,
  { resolve: (v: CosmeticLoadoutState) => void; reject: (e: unknown) => void }[]
>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  flushTimer = null;
  const batch = pending;
  pending = new Map();
  const ids = [...batch.keys()];
  for (let i = 0; i < ids.length; i += LOOKUP_MAX) {
    const chunk = ids.slice(i, i + LOOKUP_MAX);
    shopApi
      .getLoadouts(chunk)
      .then((map) => {
        for (const id of chunk)
          batch.get(id)?.forEach((w) => w.resolve(map[id] ?? {}));
      })
      .catch((err) => {
        for (const id of chunk) batch.get(id)?.forEach((w) => w.reject(err));
      });
  }
}

function loadOne(userId: string): Promise<CosmeticLoadoutState> {
  return new Promise((resolve, reject) => {
    const waiters = pending.get(userId) ?? [];
    waiters.push({ resolve, reject });
    pending.set(userId, waiters);
    flushTimer ??= setTimeout(flush, 0);
  });
}

/** 한 사람의 장착 상태 — 같은 박자의 다른 사람 요청과 묶여서 간다 */
export function useUserLoadout(
  userId: string | null | undefined,
): CosmeticLoadoutState {
  const { data } = useQuery({
    queryKey: [LOADOUT_QUERY_KEY, "one", userId],
    queryFn: () => loadOne(userId!),
    enabled: Boolean(userId),
    staleTime: 60 * 1000,
    retry: false,
  });
  return data ?? {};
}
