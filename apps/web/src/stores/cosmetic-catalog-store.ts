import { create } from "zustand";
import type { ShopCatalogEntry } from "@nexus/types";

/**
 * 서버 상품표 (상점 관리 2단계, 2026-11-20) — GET /shop/catalog 를 받아 둔다.
 *
 * 관리자가 추가한 상품은 코드에 그림 정의가 없어서, 로비 카드·프로필·닉네임이
 * 남이 낀 장식을 그리려면 이 표가 필요하다. 채우는 건 CosmeticCatalogLoader(앱 전체에 하나),
 * 읽는 건 catalog.ts 의 findCosmetic·useCosmeticCatalog.
 */
interface CosmeticCatalogState {
  /** 코드 → 상품표 항목. 받아 오기 전엔 빈 객체(코드 상품만 그려진다) */
  entries: Record<string, ShopCatalogEntry>;
  setEntries: (list: ShopCatalogEntry[]) => void;
}

export const useCosmeticCatalogStore = create<CosmeticCatalogState>((set) => ({
  entries: {},
  setEntries: (list) =>
    set({ entries: Object.fromEntries(list.map((e) => [e.code, e])) }),
}));
