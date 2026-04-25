"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { labQueryOptions, type SynergyResponse } from "@/lib/lab-queries";
import { getChampionIconById } from "@/components/matches/match-utils";
import { formatRate, confidenceLabel } from "@/lib/lab-format";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, LoadingSpinner } from "@/components/ui";
import { LabEmptyState } from "@/components/lab/shared/LabEmptyState";
import { LabSourceBadge } from "@/components/lab/shared/LabSourceBadge";

interface ChampionCatalogItem {
  championId: number;
  championNameKorean: string;
  championName: string;
}

interface Props {
  activePeriod: string;
  canFetch: boolean;
  /** 챔피언 셀렉트박스용 목록 (가나다 정렬) */
  championCatalog: ChampionCatalogItem[];
}

/** 시너지 조합 분석 카드 */
export function SynergyCard({ activePeriod, canFetch, championCatalog }: Props) {
  const [synergyChampionId, setSynergyChampionId] = useState<number | null>(null);

  const { data: synergyData, isLoading: synergyLoading } = useQuery<SynergyResponse>({
    ...labQueryOptions.synergy({ period: activePeriod, championId: synergyChampionId ?? undefined, limit: 30 }),
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
        <CardDescription>챔피언을 선택해 시너지 파트너 승률 순위를 확인합니다.</CardDescription>
        <LabSourceBadge source={synergyData?.source} />
      </CardHeader>
      <CardContent>
        {/* 필터 */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
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
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {synergyRows.map((row) => {
              const isFiltered = synergyChampionId !== null;
              const partnerId =
                isFiltered && row.champ1Id === synergyChampionId ? row.champ2Id : row.champ1Id;
              const partnerName =
                isFiltered && row.champ1Id === synergyChampionId
                  ? row.champ2NameKorean
                  : row.champ1NameKorean;
              return (
                <div
                  key={`${row.champ1Id}-${row.champ2Id}`}
                  className={`rounded-xl border border-white/10 bg-bg-primary/50 p-3 ${row.confidenceLevel === "low" ? "opacity-80" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
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
                    </div>
                    <Badge variant={row.confidenceLevel === "high" ? "success" : "warning"} size="sm">
                      {confidenceLabel(row.confidenceLevel)}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-text-primary">
                    {isFiltered ? `파트너: ${partnerName}` : `${row.champ1NameKorean} + ${row.champ2NameKorean}`}
                  </p>
                  <p className="mt-1 text-xs text-text-secondary">
                    {row.games}게임 · 승률 {formatRate(row.winRate)}
                  </p>
                  <p className="mt-1 text-xs text-text-tertiary">
                    기대 대비 {row.deltaWinRate >= 0 ? "+" : ""}
                    {(row.deltaWinRate * 100).toFixed(1)}%p
                  </p>
                  {row.badges.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {row.badges.map((b) => (
                        <Badge key={b} variant="success" size="sm">{b}</Badge>
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
