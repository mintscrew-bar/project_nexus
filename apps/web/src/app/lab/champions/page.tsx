"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useLabStore } from "@/stores/lab-store";
import { labQueryOptions, type ChampionListResponse, type LabDataSource } from "@/lib/lab-queries";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle, LoadingSpinner,
} from "@/components/ui";
import { LabSourceBadge } from "@/components/lab/shared/LabSourceBadge";
import { GitCompareArrows } from "lucide-react";
import { ChampionFilters } from "@/components/lab/champions/ChampionFilters";
import { ChampionListTable } from "@/components/lab/champions/ChampionListTable";
import { AdSlotCard } from "@/components/ads/AdSlot";

type SortKey = "winRate" | "pickRate" | "banRate";
type Position = "ALL" | "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT";

const VALID_SORTS: SortKey[] = ["winRate", "pickRate", "banRate"];
const VALID_POSITIONS: Position[] = ["ALL", "TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
const VALID_SOURCES: LabDataSource[] = ["custom", "ranked-community", "ranked-meta"];
const SOURCE_LABELS: Record<LabDataSource, string> = {
  custom: "내전",
  "ranked-community": "랭크",
  "ranked-meta": "랭크 메타",
};

/** 윌슨 하한 + 픽률 가중 점수로 S/A/B/C/D 티어 산정 */
function computeTiers(champions: ChampionListResponse["champions"]) {
  if (champions.length === 0) return [];
  const wilsonValues = champions.map((r) => r.wilsonLower);
  const pickValues = champions.map((r) => r.pickRate);
  const wMin = Math.min(...wilsonValues);
  const wMax = Math.max(...wilsonValues);
  const pMin = Math.min(...pickValues);
  const pMax = Math.max(...pickValues);
  const wRange = wMax - wMin || 1;
  const pRange = pMax - pMin || 1;

  const scored = champions.map((row) => {
    const wilsonNorm = (row.wilsonLower - wMin) / wRange;
    const pickNorm = (row.pickRate - pMin) / pRange;
    const tierScore = wilsonNorm * 0.6 + pickNorm * 0.4;
    return { ...row, tierScore };
  });
  scored.sort((a, b) => b.tierScore - a.tierScore);

  return scored.map((row, idx) => {
    const percentile = idx / scored.length;
    const tier =
      percentile < 0.1 ? "S" : percentile < 0.3 ? "A" : percentile < 0.6 ? "B" : percentile < 0.85 ? "C" : "D";
    return { ...row, tier };
  });
}

export default function LabChampionsPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { period: activePeriod, position: storePosition, statsEnabled, setPosition } = useLabStore();
  const canFetch = !authLoading && isAuthenticated && statsEnabled;

  const router = useRouter();
  const searchParams = useSearchParams();

  // URL query param → 필터 상태 (없으면 기본값)
  const search = searchParams.get("q") ?? "";
  const sort = (VALID_SORTS.includes(searchParams.get("sort") as SortKey)
    ? searchParams.get("sort")
    : "winRate") as SortKey;
  const includeLowSample = searchParams.get("lowSample") === "1";
  const urlPosition = searchParams.get("position") as Position | null;
  const activePosition = urlPosition && VALID_POSITIONS.includes(urlPosition) ? urlPosition : storePosition as Position;
  const urlSource = searchParams.get("source") as LabDataSource | null;
  const activeSource = urlSource && VALID_SOURCES.includes(urlSource) ? urlSource : "custom";

  /** URL param 한 항목만 바꾸고 push */
  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === "" || value === "0") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function handleSearchChange(v: string) { updateParam("q", v || null); }
  function handleSortChange(v: SortKey) { updateParam("sort", v === "winRate" ? null : v); }
  function handleIncludeLowSampleChange(v: boolean) { updateParam("lowSample", v ? "1" : null); }
  function handlePositionChange(v: Position) {
    setPosition(v); // lab-store에도 동기화
    updateParam("position", v === "ALL" ? null : v);
  }

  const { data: championList, isLoading } = useQuery<ChampionListResponse>({
    ...labQueryOptions.champions({
      period: activePeriod,
      position: activePosition === "ALL" ? undefined : activePosition,
      includeLowSample,
      source: activeSource,
    }),
    enabled: canFetch,
  });

  const championRowsWithTier = useMemo(
    () => computeTiers(championList?.champions ?? []),
    [championList],
  );

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const filtered = keyword.length === 0
      ? championRowsWithTier
      : championRowsWithTier.filter((row) =>
          row.championNameKorean.toLowerCase().includes(keyword) ||
          row.championName.toLowerCase().includes(keyword),
        );

    return [...filtered].sort((a, b) => {
      if (sort === "pickRate") return b.pickRate - a.pickRate;
      if (sort === "banRate") return b.banRate - a.banRate;
      return b.wilsonLower - a.wilsonLower;
    });
  }, [championRowsWithTier, search, sort]);

  if (isLoading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><LoadingSpinner /></div>;
  }

  return (
    <div className="space-y-4">
      <AdSlotCard slotKey="labTop" minHeight={100} />
      <Card className="border-white/10 bg-bg-secondary/80">
      <CardHeader>
        <CardTitle>챔피언 분석 목록</CardTitle>
        <CardDescription>검색/정렬/포지션 필터로 챔피언 픽률·승률·밴률을 탐색합니다.</CardDescription>
        <div className="flex items-center gap-2">
          <LabSourceBadge source={championList?.source} />
          {championList?.source === "realtime" && (
            <span className="text-xs text-text-tertiary">스냅샷 미스 시 원본 집계</span>
          )}
          <Link
            href={`/lab/champions/compare?period=${activePeriod}&source=${activeSource}`}
            className="ml-auto flex items-center gap-1.5 rounded-lg bg-bg-primary/60 px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
          >
            <GitCompareArrows className="h-3.5 w-3.5" />
            챔피언 비교
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {VALID_SOURCES.map((source) => (
            <button
              key={source}
              type="button"
              onClick={() => updateParam("source", source === "custom" ? null : source)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeSource === source
                  ? "bg-accent-primary/20 text-accent-primary"
                  : "bg-bg-primary/60 text-text-secondary hover:bg-bg-elevated"
              }`}
            >
              {SOURCE_LABELS[source]}
            </button>
          ))}
        </div>
        <ChampionFilters
          search={search}
          onSearchChange={handleSearchChange}
          sort={sort}
          onSortChange={handleSortChange}
          includeLowSample={includeLowSample}
          onIncludeLowSampleChange={handleIncludeLowSampleChange}
          position={activePosition}
          onPositionChange={handlePositionChange}
        />
        <ChampionListTable rows={filteredRows} activePeriod={activePeriod} activeSource={activeSource} />
      </CardContent>
      </Card>
    </div>
  );
}
