"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { labQueryOptions, type CounterResponse } from "@/lib/lab-queries";
import { getChampionIconById } from "@/components/matches/match-utils";
import { formatRate } from "@/lib/lab-format";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, LoadingSpinner } from "@/components/ui";
import { LabEmptyState } from "@/components/lab/shared/LabEmptyState";
import { LabSourceBadge } from "@/components/lab/shared/LabSourceBadge";

type CounterPosition = "ALL" | "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT";

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

/** 포지션명 한국어 변환 */
function positionLabel(pos: string): string {
  const map: Record<string, string> = {
    TOP: "탑", JUNGLE: "정글", MID: "미드", ADC: "원딜", SUPPORT: "서포터",
  };
  return map[pos] ?? pos;
}

/** 카운터 상성 카드 */
export function CounterCard({ activePeriod, canFetch, championCatalog }: Props) {
  const [counterChampionId, setCounterChampionId] = useState<number | null>(null);
  const [counterVsChampionId, setCounterVsChampionId] = useState<number | null>(null);
  const [counterPosition, setCounterPosition] = useState<CounterPosition>("ALL");

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

  const rows = counterData?.rows ?? [];

  return (
    <Card className="border-white/10 bg-bg-secondary/80">
      <CardHeader>
        <CardTitle>카운터 상성</CardTitle>
        <CardDescription>챔피언 기준 상성 데이터를 포지션별로 확인합니다.</CardDescription>
        <LabSourceBadge source={counterData?.source} />
      </CardHeader>
      <CardContent>
        {/* 필터 */}
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
            onChange={(e) => setCounterPosition(e.target.value as CounterPosition)}
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
            onClick={() => {
              setCounterChampionId(null);
              setCounterVsChampionId(null);
              setCounterPosition("ALL");
            }}
            className="rounded-lg bg-bg-primary/60 px-3 py-2 text-sm text-text-secondary hover:bg-bg-elevated"
          >
            필터 초기화
          </button>
        </div>

        {/* 콘텐츠 */}
        {counterLoading ? (
          <div className="flex min-h-[180px] items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : rows.length === 0 ? (
          <LabEmptyState level="insufficient" section="카운터 데이터" />
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
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
                    {row.position ? ` (${positionLabel(row.position)})` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <span>{row.games}게임</span>
                  <span>승률 {formatRate(row.winRate)}</span>
                  <Badge
                    variant={
                      row.verdict === "favorable"
                        ? "success"
                        : row.verdict === "unfavorable"
                          ? "danger"
                          : "secondary"
                    }
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
  );
}
