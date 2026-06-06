"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { useLabStore } from "@/stores/lab-store";
import { labQueryOptions, type ChampionListResponse } from "@/lib/lab-queries";
import { SynergyCard } from "@/components/lab/compositions/SynergyCard";
import { CounterCard } from "@/components/lab/compositions/CounterCard";
import { CompositionTypesCard } from "@/components/lab/compositions/CompositionTypesCard";

export default function LabCompositionsPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { period: activePeriod, statsEnabled } = useLabStore();
  const canFetch = !authLoading && isAuthenticated && statsEnabled;

  // 챔피언 카탈로그 (시너지·카운터 셀렉트박스 공용)
  const { data: catalogResponse } = useQuery<ChampionListResponse>({
    ...labQueryOptions.champions({ period: activePeriod, includeLowSample: true }),
    enabled: canFetch,
  });

  const championCatalog = useMemo(
    () =>
      (catalogResponse?.champions ?? [])
        .map((r) => ({
          championId: r.championId,
          championNameKorean: r.championNameKorean,
          championName: r.championName,
        }))
        .sort((a, b) => a.championNameKorean.localeCompare(b.championNameKorean, "ko")),
    [catalogResponse],
  );

  return (
    <div className="space-y-6">
      <SynergyCard activePeriod={activePeriod} canFetch={canFetch} championCatalog={championCatalog} />
      <CounterCard activePeriod={activePeriod} canFetch={canFetch} championCatalog={championCatalog} />
      <CompositionTypesCard activePeriod={activePeriod} canFetch={canFetch} />
    </div>
  );
}
