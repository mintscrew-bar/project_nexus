"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { useLabStore } from "@/stores/lab-store";
import {
  labQueryOptions,
  type ChampionListResponse,
} from "@/lib/lab-queries";
import { getChampionIconById } from "@/components/matches/match-utils";
import { confidenceLabel, formatRate } from "@/lib/lab-format";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  LoadingSpinner,
} from "@/components/ui";
import { LabEmptyState } from "@/components/lab/shared/LabEmptyState";
import { LabSourceBadge } from "@/components/lab/shared/LabSourceBadge";

type SortKey = "winRate" | "pickRate" | "banRate";

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
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { period: activePeriod, position: activePosition, setPosition } = useLabStore();
  const isAdmin = user?.role === "ADMIN";
  const canFetch = !authLoading && isAuthenticated && isAdmin;

  const [championSearch, setChampionSearch] = useState("");
  const [includeLowSample, setIncludeLowSample] = useState(false);
  const [championSort, setChampionSort] = useState<SortKey>("winRate");

  const { data: championList, isLoading } = useQuery<ChampionListResponse>({
    ...labQueryOptions.champions({
      period: activePeriod,
      position: activePosition === "ALL" ? undefined : activePosition,
      includeLowSample,
    }),
    enabled: canFetch,
  });

  const championRowsWithTier = useMemo(
    () => computeTiers(championList?.champions ?? []),
    [championList],
  );

  const championRowsFiltered = useMemo(() => {
    const keyword = championSearch.trim().toLowerCase();
    const filtered =
      keyword.length === 0
        ? championRowsWithTier
        : championRowsWithTier.filter((row) =>
            row.championNameKorean.toLowerCase().includes(keyword) ||
            row.championName.toLowerCase().includes(keyword),
          );

    return [...filtered].sort((a, b) => {
      if (championSort === "pickRate") return b.pickRate - a.pickRate;
      if (championSort === "banRate") return b.banRate - a.banRate;
      // 승률순 = wilsonLower 기준
      return b.wilsonLower - a.wilsonLower;
    });
  }, [championRowsWithTier, championSearch, championSort]);

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <Card className="border-white/10 bg-bg-secondary/80">
      <CardHeader>
        <CardTitle>챔피언 분석 목록</CardTitle>
        <CardDescription>
          검색/정렬/포지션 필터로 챔피언 픽률·승률·밴률을 탐색합니다.
        </CardDescription>
        <div className="flex items-center gap-2">
          <LabSourceBadge source={championList?.source} />
          {championList?.source === "realtime" && (
            <span className="text-xs text-text-tertiary">스냅샷 미스 시 원본 집계</span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* 검색 + 정렬 */}
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <input
            value={championSearch}
            onChange={(e) => setChampionSearch(e.target.value)}
            placeholder="챔피언 검색 (한글/영문)"
            className="w-full rounded-xl border border-white/10 bg-bg-primary/70 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary md:max-w-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            {(["winRate", "pickRate", "banRate"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setChampionSort(key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  championSort === key
                    ? "bg-accent-primary/20 text-accent-primary"
                    : "bg-bg-primary/60 text-text-secondary hover:bg-bg-elevated"
                }`}
              >
                {key === "winRate" ? "승률순" : key === "pickRate" ? "픽률순" : "밴률순"}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setIncludeLowSample((prev) => !prev)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                includeLowSample
                  ? "bg-accent-info/20 text-accent-info"
                  : "bg-bg-primary/60 text-text-secondary hover:bg-bg-elevated"
              }`}
            >
              5게임 미만 포함
            </button>
          </div>
        </div>

        {/* 포지션 필터 */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(["ALL", "TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const).map((pos) => (
            <button
              key={pos}
              type="button"
              onClick={() => setPosition(pos)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activePosition === pos
                  ? "bg-accent-purple/20 text-accent-purple"
                  : "bg-bg-primary/60 text-text-secondary hover:bg-bg-elevated"
              }`}
            >
              {pos === "ALL" ? "전체" : pos === "TOP" ? "탑" : pos === "JUNGLE" ? "정글" : pos === "MID" ? "미드" : pos === "ADC" ? "원딜" : "서포터"}
            </button>
          ))}
        </div>

        {/* 데스크톱 테이블 */}
        <div className="hidden overflow-x-auto rounded-xl border border-white/10 md:block">
          <table className="min-w-full text-sm">
            <thead className="bg-bg-primary/70 text-text-tertiary">
              <tr>
                <th className="px-3 py-2 text-left">챔피언</th>
                <th className="px-3 py-2 text-right">티어</th>
                <th className="px-3 py-2 text-right">게임</th>
                <th className="px-3 py-2 text-right">승률</th>
                <th className="px-3 py-2 text-right">픽률</th>
                <th className="px-3 py-2 text-right">밴률</th>
                <th className="px-3 py-2 text-right">신뢰도</th>
              </tr>
            </thead>
            <tbody>
              {championRowsFiltered.map((row) => (
                <tr
                  key={row.championId}
                  className={`border-t border-white/10 bg-bg-secondary/40 transition-colors hover:bg-bg-elevated/60 ${
                    row.confidenceLevel === "low" ? "opacity-80" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/lab/champions/${row.championId}?period=${activePeriod}`}
                      className="flex items-center gap-2 text-left"
                    >
                      <div className="relative h-8 w-8 overflow-hidden rounded-lg border border-white/10">
                        <Image
                          src={getChampionIconById(row.championId)}
                          alt={row.championNameKorean}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                      <span className="text-text-primary hover:text-accent-primary">
                        {row.championNameKorean}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Badge
                      variant={row.tier === "S" ? "success" : row.tier === "A" ? "default" : "secondary"}
                    >
                      {row.tier}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right text-text-secondary">{row.games}</td>
                  <td className="px-3 py-2 text-right text-text-secondary">
                    {formatRate(row.winRate)}
                  </td>
                  <td className="px-3 py-2 text-right text-text-secondary">
                    {row.pickRate.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2 text-right text-text-secondary">
                    {row.banRate.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Badge
                      variant={row.confidenceLevel === "high" ? "success" : "warning"}
                      size="sm"
                    >
                      {confidenceLabel(row.confidenceLevel)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 모바일 카드 */}
        <div className="grid grid-cols-2 gap-3 md:hidden">
          {championRowsFiltered.map((row) => (
            <Link
              key={row.championId}
              href={`/lab/champions/${row.championId}?period=${activePeriod}`}
              className={`rounded-xl border border-white/10 bg-bg-secondary/40 p-3 transition-colors hover:bg-bg-elevated/60 ${
                row.confidenceLevel === "low" ? "opacity-80" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-white/10">
                  <Image
                    src={getChampionIconById(row.championId)}
                    alt={row.championNameKorean}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text-primary">
                    {row.championNameKorean}
                  </p>
                  <Badge
                    variant={row.tier === "S" ? "success" : row.tier === "A" ? "default" : "secondary"}
                    className="mt-0.5 text-xs"
                  >
                    {row.tier}
                  </Badge>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-xs text-text-tertiary">
                <div>
                  <p>승률</p>
                  <p className="font-semibold text-text-secondary">{formatRate(row.winRate)}</p>
                </div>
                <div>
                  <p>픽률</p>
                  <p className="font-semibold text-text-secondary">{row.pickRate.toFixed(1)}%</p>
                </div>
                <div>
                  <p>게임</p>
                  <p className="font-semibold text-text-secondary">{row.games}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {championRowsFiltered.length === 0 && (
          <LabEmptyState level="insufficient" section="챔피언 목록" className="mt-4" />
        )}
      </CardContent>
    </Card>
  );
}
