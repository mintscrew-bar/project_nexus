import type { QueryClient } from "@tanstack/react-query";
import type { CosmeticLoadoutState, ShopItemState } from "@/lib/api-client";
import { LOADOUT_QUERY_KEY } from "./useCosmeticLoadouts";

/**
 * 메달·상점 화면 맞추기 (2026-11-24 상점 오류 정리).
 *
 * 잔액과 장착 상태를 여러 화면이 각자 들고 있어서 한쪽만 바뀌는 일이 잦았다.
 * - 헤더 메달 칩(["medals","me"])과 상점 페이지(["shop"])가 잔액을 따로 읽어,
 *   출석·운영자 지급 뒤 상점 잔액이 옛 값으로 남았다.
 * - 장착을 바꾸면 서버에서 다시 읽어 올 때까지 옛 장착이 보여, 그 사이 다른 걸 누르면 엇갈렸다.
 * 메달이나 장착이 바뀌는 곳은 모두 여기 함수를 부른다.
 */

/** 이 키들은 잔액을 들고 있다 */
const MEDAL_KEY = ["medals", "me"] as const;
const SHOP_KEY = ["shop"] as const;

type ShopData = {
  balance: number;
  loadout: CosmeticLoadoutState;
  items: ShopItemState[];
};

/** 메달이 바뀌었다 — 헤더 칩·메달 내역·상점 잔액을 모두 새로 읽는다 */
export function refreshMedalViews(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ["medals"] });
  // 상점 진열(잔액·보유)만 — 상품표(["shop","catalog"])는 메달과 상관없어 건드리지 않는다
  void queryClient.invalidateQueries({ queryKey: SHOP_KEY, exact: true });
}

/** 서버가 알려 준 새 잔액을 바로 넣는다(다시 읽기 전에도 숫자가 맞게) */
export function setMedalBalance(queryClient: QueryClient, balance: number) {
  queryClient.setQueryData<{ balance: number }>(MEDAL_KEY, (old) =>
    old ? { ...old, balance } : { balance },
  );
  queryClient.setQueryData<ShopData>(SHOP_KEY, (old) =>
    old ? { ...old, balance } : old,
  );
}

/**
 * 장착을 바꿨다 — 서버가 돌려준 장착 상태를 상점 진열에 바로 넣고(장착 중 표시),
 * 로비 카드·프로필이 들고 있는 장착 상태도 새로 읽게 한다.
 */
export function applyLoadout(
  queryClient: QueryClient,
  loadout: CosmeticLoadoutState,
) {
  const equipped = new Set(
    Object.entries(loadout)
      .filter(([k]) => k !== "nameTint")
      .map(([, v]) => v as string),
  );
  queryClient.setQueryData<ShopData>(SHOP_KEY, (old) =>
    old
      ? {
          ...old,
          loadout,
          items: old.items.map((it) => ({
            ...it,
            equipped: equipped.has(it.code),
          })),
        }
      : old,
  );
  void queryClient.invalidateQueries({ queryKey: [LOADOUT_QUERY_KEY] });
  void queryClient.invalidateQueries({ queryKey: SHOP_KEY, exact: true });
}
