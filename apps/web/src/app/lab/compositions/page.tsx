"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { useLabStore } from "@/stores/lab-store";
import {
  labQueryOptions,
  type SynergyResponse,
  type CounterResponse,
  type CompositionsResponse,
  type ChampionListResponse,
} from "@/lib/lab-queries";
import { getChampionIconById } from "@/components/matches/match-utils";
import { formatRate, confidenceLabel } from "@/lib/lab-format";
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

// 조합 유형 예시 챔피언
const COMPOSITION_EXAMPLE_CHAMPIONS: Record<string, number[]> = {
  TEAMFIGHT: [89, 99, 53],
  SPLIT_PUSH: [157, 92, 114],
  POKE: [81, 115, 74],
  EARLY_AGGRO: [64, 121, 91],
  TANK_LINE: [54, 516, 113],
};

export default function LabCompositionsPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { period: activePeriod } = useLabStore();
  const isAdmin = user?.role === "ADMIN";
  const canFetch = !authLoading && isAuthenticated && isAdmin;

  // 시너지 필터 상태
  const [synergyChampionId, setSynergyChampionId] = useState<number | null>(null);

  // 카운터 필터 상태
  const [counterChampionId, setCounterChampionId] = useState<number | null>(null);
  const [counterVsChampionId, setCounterVsChampionId] = useState<number | null>(null);
  const [counterPosition, setCounterPosition] = useState<"ALL" | "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT">("ALL");

  // 챔피언 카탈로그 (셀렉트박스용)
  const { data: catalogResponse } = useQuery<ChampionListResponse>({
    ...labQueryOptions.champions({ period: activePeriod, includeLowSample: true }),
    enabled: canFetch,
  });
  const championCatalog = useMemo(
    () =>
      (catalogResponse?.champions ?? [])
        .map((r) => ({ championId: r.championId, championNameKorean: r.championNameKorean, championName: r.championName }))
        .sort((a, b) => a.championNameKorean.localeCompare(b.championNameKorean, "ko")),
    [catalogResponse],
  );

  const { data: synergyData, isLoading: synergyLoading } = useQuery<SynergyResponse>({
    ...labQueryOptions.synergy({ period: activePeriod, championId: synergyChampionId ?? undefined, limit: 30 }),
    enabled: canFetch,
  });

  const { data: counterData, isLoading: counterLoading } = useQuery<CounterResponse>({
    ...labQueryOptions.counter({
      period: activePeriod,
      championId: counterChampionId ?? undefined,
      vsChampionId: counterVsChampionId ?? undefined,
      position: counterPosition === "ALL" ? undefined : counterPosition,
      limit: 30,
    }),
    enabled: canFetch,
  });

  const { data: compositionsData, isLoading: compositionsLoading } = useQuery<CompositionsResponse>({
    ...labQueryOptions.compositions(activePeriod),
    enabled: canFetch,
  });

  const synergyRows = useMemo(() => {
    const rows = synergyData?.rows ?? [];
    if (!synergyChampionId) return rows;
    return rows.filter((r) => r.champ1Id === synergyChampionId || r.champ2Id === synergyChampionId);
  }, [synergyData, synergyChampionId]);

  return (
    <div className="space-y-6">
      {/* ── 시너지 조합 ── */}
      <Card className="border-white/10 bg-bg-secondary/80">
        <CardHeader>
          <CardTitle>시너지 조합 분석</CardTitle>
          <CardDescription>챔피언을 선택해 시너지 파트너 승률 순위를 확인합니다.</CardDescription>
          <LabSourceBadge source={synergyData?.source} />
        </CardHeader>
        <CardContent>
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
                const partnerId = isFiltered && row.champ1Id === synergyChampionId ? row.champ2Id : row.champ1Id;
                const partnerName = isFiltered && row.champ1Id === synergyChampionId ? row.champ2NameKorean : row.champ1NameKorean;
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
                      기대 대비 {row.deltaWinRate >= 0 ? "+" : ""}{(row.deltaWinRate * 100).toFixed(1)}%p
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

      {/* ── 카운터 상성 ── */}
      <Card className="border-white/10 bg-bg-secondary/80">
        <CardHeader>
          <CardTitle>카운터 상성</CardTitle>
          <CardDescription>챔피언 기준 상성 데이터를 포지션별로 확인합니다.</CardDescription>
          <LabSourceBadge source={counterData?.source} />
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-2 md:grid-cols-4">
            <select
              value={counterChampionId ?? ""}
              onChange={(e) => setCounterChampionId(e.target.value ? Number(e.target.value) : null)}
              className="rounded-lg border border-white/10 bg-bg-primary/70 px-3 py-2 text-sm text-text-primary outline-none"
            >
              <option value="">기준 챔피언 (전체)</option>
              {championCatalog.map((c) => (
                <option key={`cnt-${c.championId}`} value={c.championId}>{c.championNameKorean}</option>
              ))}
            </select>
            <select
              value={counterVsChampionId ?? ""}
              onChange={(e) => setCounterVsChampionId(e.target.value ? Number(e.target.value) : null)}
              className="rounded-lg border border-white/10 bg-bg-primary/70 px-3 py-2 text-sm text-text-primary outline-none"
            >
              <option value="">상대 챔피언 (전체)</option>
              {championCatalog.map((c) => (
                <option key={`vs-${c.championId}`} value={c.championId}>{c.championNameKorean}</option>
              ))}
            </select>
            <select
              value={counterPosition}
              onChange={(e) => setCounterPosition(e.target.value as typeof counterPosition)}
              className="rounded-lg border border-white/10 bg-bg-primary/70 px-3 py-2 text-sm text-text-primary outline-none"
            >
              <option value="ALL">전체 포지션</option>
              <option value="TOP">탑</option>
              <option value="JUNGLE">정글</option>
              <option value="MID">미드</option>
              <option value="ADC">원딜</option>
              <option value="SUPPORT">서포터</option>
            </select>
            <button
              type="button"
              onClick={() => { setCounterChampionId(null); setCounterVsChampionId(null); setCounterPosition("ALL"); }}
              className="rounded-lg bg-bg-primary/60 px-3 py-2 text-sm text-text-secondary hover:bg-bg-elevated"
            >
              필터 초기화
            </button>
          </div>

          {counterLoading ? (
            <div className="flex min-h-[180px] items-center justify-center">
              <LoadingSpinner />
            </div>
          ) : (counterData?.rows ?? []).length === 0 ? (
            <LabEmptyState level="insufficient" section="카운터 데이터" />
          ) : (
            <div className="space-y-2">
              {(counterData?.rows ?? []).map((row) => (
                <div
                  key={`${row.champId}-${row.vsChampId}-${row.position ?? "ALL"}`}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                    row.verdict === "favorable"
                      ? "border-accent-success/25 bg-accent-success/10"
                      : row.verdict === "unfavorable"
                        ? "border-accent-danger/25 bg-accent-danger/10"
                        : "border-white/10 bg-bg-primary/50"
                  } ${row.confidenceLevel === "low" ? "opacity-80" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <Link href={`/lab/champions/${row.champId}`}>
                      <div className="relative h-8 w-8 overflow-hidden rounded-md border border-white/10 transition-opacity hover:opacity-80">
                        <Image src={getChampionIconById(row.champId)} alt={row.champNameKorean} fill className="object-cover" unoptimized />
                      </div>
                    </Link>
                    <span className="text-xs text-text-tertiary">vs</span>
                    <Link href={`/lab/champions/${row.vsChampId}`}>
                      <div className="relative h-8 w-8 overflow-hidden rounded-md border border-white/10 transition-opacity hover:opacity-80">
                        <Image src={getChampionIconById(row.vsChampId)} alt={row.vsChampNameKorean} fill className="object-cover" unoptimized />
                      </div>
                    </Link>
                    <p className="text-sm text-text-primary">
                      {row.champNameKorean} vs {row.vsChampNameKorean}
                      {row.position ? ` (${row.position === "TOP" ? "탑" : row.position === "JUNGLE" ? "정글" : row.position === "MID" ? "미드" : row.position === "ADC" ? "원딜" : "서포터"})` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <span>{row.games}게임</span>
                    <span>승률 {formatRate(row.winRate)}</span>
                    <Badge
                      variant={row.verdict === "favorable" ? "success" : row.verdict === "unfavorable" ? "danger" : "secondary"}
                      size="sm"
                    >
                      {row.verdict === "favorable" ? "유리" : row.verdict === "unfavorable" ? "불리" : "비등"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 팀 구성 유형 ── */}
      <Card className="border-white/10 bg-bg-secondary/80">
        <CardHeader>
          <CardTitle>팀 구성 유형 분석</CardTitle>
          <CardDescription>한타/스플릿/포킹/속공/탱커라인 유형별 승률과 픽률</CardDescription>
          <LabSourceBadge source={compositionsData?.source} />
        </CardHeader>
        <CardContent>
          {compositionsLoading ? (
            <div className="flex min-h-[180px] items-center justify-center">
              <LoadingSpinner />
            </div>
          ) : (compositionsData?.rows ?? []).length === 0 ? (
            <LabEmptyState level="insufficient" section="조합 유형" />
          ) : (
            <div className="space-y-3">
              {(compositionsData?.rows ?? []).map((row) => (
                <div
                  key={`comp-${row.type}`}
                  className={`rounded-xl border border-white/10 bg-bg-primary/50 p-3 ${row.confidenceLevel === "low" ? "opacity-80" : ""}`}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <p className="font-semibold text-text-primary">{row.label}</p>
                      <div className="flex items-center gap-1">
                        {(COMPOSITION_EXAMPLE_CHAMPIONS[row.type] ?? []).map((championId) => (
                          <Link key={`${row.type}-${championId}`} href={`/lab/champions/${championId}`}>
                            <div className="relative h-6 w-6 overflow-hidden rounded border border-white/10 transition-opacity hover:opacity-80">
                              <Image src={getChampionIconById(championId)} alt={`example-${championId}`} fill className="object-cover" unoptimized />
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                    <Badge variant={row.confidenceLevel === "high" ? "success" : "warning"} size="sm">
                      {confidenceLabel(row.confidenceLevel)}
                    </Badge>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-bg-tertiary">
                    <div
                      className="h-full rounded-full bg-accent-info"
                      style={{ width: `${Math.max(4, row.winRate * 100)}%` }}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-secondary">
                    <span>{row.games}팀</span>
                    <span>승률 {(row.winRate * 100).toFixed(1)}%</span>
                    <span>픽률 {(row.pickRate * 100).toFixed(1)}%</span>
                    <span>평균 {Math.round(row.avgGameDurationSec / 60)}분</span>
                  </div>
                </div>
              ))}
              {compositionsData?.caveat && (
                <p className="text-xs text-text-tertiary">{compositionsData.caveat}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
