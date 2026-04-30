"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { labQueryOptions, type SynergyResponse } from "@/lib/lab-queries";
import type { LabPeriod } from "@/stores/lab-store";
import { getChampionIconById } from "@/components/matches/match-utils";
import { formatPosition, formatRate } from "@/lib/lab-format";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, LoadingSpinner } from "@/components/ui";
import { LabEmptyState } from "@/components/lab/shared/LabEmptyState";
import { LabSourceBadge } from "@/components/lab/shared/LabSourceBadge";

interface ChampionCatalogItem {
  championId: number;
  championNameKorean: string;
  championName: string;
}

interface Props {
  activePeriod: LabPeriod;
  canFetch: boolean;
  /** 챔피언 셀렉트박스용 목록 (가나다 정렬) */
  championCatalog: ChampionCatalogItem[];
}

/** 시너지 조합 분석 카드 */
export function SynergyCard({ activePeriod, canFetch, championCatalog }: Props) {
  const [synergyChampionId, setSynergyChampionId] = useState<number | null>(null);
  const [dataSource, setDataSource] = useState<"custom" | "ranked-community" | "all">("custom");

  const { data: synergyData, isLoading: synergyLoading } = useQuery<SynergyResponse>({
    ...labQueryOptions.synergy({
      period: activePeriod,
      championId: synergyChampionId ?? undefined,
      limit: 30,
      source: dataSource,
    }),
    enabled: canFetch,
  });

  const synergyRows = useMemo(() => {
    const rows = synergyData?.rows ?? [];
    if (!synergyChampionId) return rows;
    return rows.filter((r) => r.champ1Id === synergyChampionId || r.champ2Id === synergyChampionId);
  }, [synergyData, synergyChampionId]);

  return (
    <Card className="border-white/10 bg-bg-secondary/80">
      <CardHeader>
        <CardTitle>시너지 조합 분석</CardTitle>
        <CardDescription>같은 팀에서 함께 나온 챔피언 pair의 기대 승률 대비 성과를 봅니다.</CardDescription>
        <LabSourceBadge source={synergyData?.source} />
      </CardHeader>
      <CardContent>
        {/* 필터 */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-white/10 bg-bg-primary/60 p-1">
            {[
              { key: "custom", label: "내전" },
              { key: "ranked-community", label: "랭크" },
              { key: "all", label: "전체" },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setDataSource(option.key as "custom" | "ranked-community" | "all")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  dataSource === option.key
                    ? "bg-accent-primary/20 text-accent-primary"
                    : "text-text-secondary hover:bg-bg-elevated"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSynergyChampionId(null)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              synergyChampionId === null
                ? "bg-accent-primary/20 text-accent-primary"
                : "bg-bg-primary/60 text-text-secondary hover:bg-bg-elevated"
            }`}
          >
            전체 조합
          </button>
          <select
            value={synergyChampionId ?? ""}
            onChange={(e) => setSynergyChampionId(e.target.value ? Number(e.target.value) : null)}
            className="min-w-[240px] rounded-lg border border-white/10 bg-bg-primary/70 px-3 py-2 text-sm text-text-primary outline-none"
          >
            <option value="">챔피언 선택</option>
            {championCatalog.map((c) => (
              <option key={`syn-opt-${c.championId}`} value={c.championId}>
                {c.championNameKorean}
              </option>
            ))}
          </select>
        </div>

        {/* 콘텐츠 */}
        {synergyLoading ? (
          <div className="flex min-h-[220px] items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : synergyRows.length === 0 ? (
          <LabEmptyState level="insufficient" section="시너지 조합" />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
              <span>후보 {synergyData?.summary.totalPairs ?? synergyRows.length}개</span>
              <span>최소 {synergyData?.summary.minGames ?? 3}게임</span>
              <span>
                기준: {dataSource === "custom" ? "내전" : dataSource === "ranked-community" ? "랭크" : "전체"}
              </span>
            </div>
            {synergyRows.map((row) => {
              const isFiltered = synergyChampionId !== null;
              const partnerId =
                isFiltered && row.champ1Id === synergyChampionId ? row.champ2Id : row.champ1Id;
              const partnerName =
                isFiltered && row.champ1Id === synergyChampionId
                  ? row.champ2NameKorean
                  : row.champ1NameKorean;
              const positive = row.deltaWinRate >= 0;
              return (
                <div
                  key={`${row.champ1Id}-${row.champ2Id}`}
                  className={`rounded-xl bg-bg-primary/50 p-4 ${
                    row.confidenceLevel === "low"
                      ? "border border-dashed border-white/10 opacity-70"
                      : "border border-white/10"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Link href={`/lab/champions/${row.champ1Id}`}>
                        <div className="relative h-9 w-9 overflow-hidden rounded-lg border border-white/10 transition-opacity hover:opacity-80">
                          <Image src={getChampionIconById(row.champ1Id)} alt={row.champ1NameKorean} fill className="object-cover" unoptimized />
                        </div>
                      </Link>
                      <span className="text-xs text-text-tertiary">+</span>
                      <Link href={`/lab/champions/${row.champ2Id}`}>
                        <div className="relative h-9 w-9 overflow-hidden rounded-lg border border-white/10 transition-opacity hover:opacity-80">
                          <Image src={getChampionIconById(row.champ2Id)} alt={row.champ2NameKorean} fill className="object-cover" unoptimized />
                        </div>
                      </Link>
                      <div>
                        <p className="text-sm font-semibold text-text-primary">
                          {isFiltered ? `파트너: ${partnerName}` : `${row.champ1NameKorean} + ${row.champ2NameKorean}`}
                        </p>
                        <p className="mt-1 text-xs text-text-tertiary">
                          {row.positions.length > 0
                            ? row.positions.map(formatPosition).join(" + ")
                            : "포지션 전체"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${positive ? "text-accent-success" : "text-accent-danger"}`}>
                        {positive ? "+" : ""}
                        {(row.deltaWinRate * 100).toFixed(1)}%p
                      </p>
                      <p className="text-xs text-text-tertiary">기대 대비</p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-text-secondary sm:grid-cols-3">
                    <span>{row.games}게임</span>
                    <span>승률 {formatRate(row.winRate)}</span>
                    <span>기대 {formatRate(row.expectedWinRate)}</span>
                  </div>
                  {row.badges.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {row.badges.map((b) => (
                        <Badge key={b} variant={b === "주의 표본" ? "warning" : "success"} size="sm">{b}</Badge>
                      ))}
                    </div>
                  )}
                  {isFiltered && (
                    <button
                      type="button"
                      onClick={() => setSynergyChampionId(partnerId)}
                      className="mt-3 text-xs text-accent-info hover:text-accent-info/80"
                    >
                      {partnerName} 중심으로 보기
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
