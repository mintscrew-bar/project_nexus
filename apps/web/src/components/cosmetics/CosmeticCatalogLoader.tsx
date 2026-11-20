"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { shopApi } from "@/lib/api-client";
import { useCosmeticCatalogStore } from "@/stores/cosmetic-catalog-store";

/** 상품표 쿼리 키 — ["shop"] 아래라 상점·관리자 화면이 ["shop"] 을 새로 고치면 같이 새로 받는다 */
export const COSMETIC_CATALOG_QUERY_KEY = ["shop", "catalog"] as const;

/**
 * 서버 상품표를 앱이 뜰 때 한 번 받아 저장소에 넣는다(로그인 없이도).
 * 관리자가 추가한 상품을 어디서든 그릴 수 있게 하는 것 — 화면에는 아무것도 그리지 않는다.
 */
export function CosmeticCatalogLoader() {
  const setEntries = useCosmeticCatalogStore((s) => s.setEntries);
  const { data } = useQuery({
    queryKey: COSMETIC_CATALOG_QUERY_KEY,
    queryFn: shopApi.catalog,
    // 상품은 자주 안 바뀐다 — 5분에 한 번이면 충분하다
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  useEffect(() => {
    if (data) setEntries(data);
  }, [data, setEntries]);
  return null;
}
