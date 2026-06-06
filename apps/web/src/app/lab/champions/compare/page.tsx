"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { useLabStore } from "@/stores/lab-store";
import {
  labQueryOptions,
  type ChampionDetailResponse,
  type ChampionListResponse,
  type LabDataSource,
} from "@/lib/lab-queries";
import { getChampionIconById } from "@/components/matches/match-utils";
import { formatRate } from "@/lib/lab-format";
import { Badge, Card, CardContent, CardHeader, CardTitle, LoadingSpinner } from "@/components/ui";
import { ArrowLeft, Plus, X } from "lucide-react";

/** 최대 비교 챔피언 수 */
const MAX_COMPARE = 4;

/** 컬럼별 색상 */
const COL_COLORS = ["#667EEA", "#0bc4e2", "#764BA2", "#ffa726"];

export default function ChampionComparePage() {
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { period: activePeriod, statsEnabled } = useLabStore();
  const canFetch = !authLoading && isAuthenticated && statsEnabled;

  const router = useRouter();
  const searchParams = useSearchParams();

  // URL에서 비교할 챔피언 ID 목록 파싱
  const championIds = useMemo(() => {
    const raw = searchParams.get("ids") ?? "";
    return raw
      .split(",")
      .map(Number)
      .filter((n) => n > 0)
      .slice(0, MAX_COMPARE);
  }, [searchParams]);
  const sourceParam = searchParams.get("source") as LabDataSource | null;
  const activeSource: LabDataSource =
    sourceParam && ["custom", "ranked-community", "ranked-meta"].includes(sourceParam)
      ? sourceParam
      : "custom";

  // 챔피언 추가 셀렉트 상태
  const [adding, setAdding] = useState(false);

  /** URL ids 업데이트 */
  function setIds(ids: number[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (ids.length > 0) {
      params.set("ids", ids.join(","));
    } else {
      params.delete("ids");
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  function removeChampion(id: number) {
    setIds(championIds.filter((x) => x !== id));
  }

  function addChampion(id: number) {
    if (!championIds.includes(id) && championIds.length < MAX_COMPARE) {
      setIds([...championIds, id]);
    }
    setAdding(false);
  }

  // 챔피언 카탈로그 (셀렉트박스용)
  const { data: catalogResponse } = useQuery<ChampionListResponse>({
    ...labQueryOptions.champions({ period: activePeriod, includeLowSample: true, source: activeSource }),
    enabled: canFetch,
  });
  const championCatalog = useMemo(
    () =>
      (catalogResponse?.champions ?? [])
        .map((r) => ({ championId: r.championId, championNameKorean: r.championNameKorean }))
        .sort((a, b) => a.championNameKorean.localeCompare(b.championNameKorean, "ko")),
    [catalogResponse],
  );

  // 각 챔피언 상세 조회 — useQueries로 hooks 규칙 준수
  const queries = useQueries({
    queries: championIds.map((id) => ({
      ...labQueryOptions.championDetail(id, activePeriod, activeSource),
      enabled: canFetch && id > 0,
    })),
  }) as ReturnType<typeof useQuery<ChampionDetailResponse>>[];

  const isLoading = queries.some((q) => q.isLoading);

  // 비교 지표 행 정의
  const metrics: Array<{
    label: string;
    getValue: (d: ChampionDetailResponse) => string;
    better: "higher" | "lower" | "none";
  }> = [
    {
      label: "누적 게임",
      getValue: (d) => d.totals.games.toLocaleString(),
      better: "none",
    },
    {
      label: "승률",
      getValue: (d) => formatRate(d.totals.winRate),
      better: "higher",
    },
    {
      label: "주 포지션",
      getValue: (d) => {
        const top = [...d.positions].sort((a, b) => b.games - a.games)[0];
        return top?.position ?? "-";
      },
      better: "none",
    },
    {
      label: "포지션 수",
      getValue: (d) => String(d.positions.length),
      better: "none",
    },
    {
      label: "최고 아이템 조합 게임",
      getValue: (d) => (d.topItemCombos[0]?.games ?? 0).toLocaleString(),
      better: "none",
    },
    {
      label: "최고 아이템 조합 승률",
      getValue: (d) => d.topItemCombos[0] ? formatRate(d.topItemCombos[0].winRate) : "-",
      better: "higher",
    },
  ];

  /** 수치 기반 최고/최저 찾기 */
  function getRawValue(d: ChampionDetailResponse, label: string): number | null {
    if (label === "누적 게임") return d.totals.games;
    if (label === "승률") return d.totals.winRate;
    if (label === "포지션 수") return d.positions.length;
    if (label === "최고 아이템 조합 승률") return d.topItemCombos[0]?.winRate ?? null;
    if (label === "최고 아이템 조합 게임") return d.topItemCombos[0]?.games ?? null;
    return null;
  }

  return (
    <div className="space-y-6">
      {/* 브레드크럼 */}
      <Link
        href={`/lab/champions?period=${activePeriod}&source=${activeSource}`}
        className="inline-flex items-center gap-1.5 text-sm text-text-tertiary hover:text-text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        챔피언 목록으로
      </Link>

      {/* 헤더 + 챔피언 선택 행 */}
      <div>
        <h1 className="mb-4 text-xl font-bold text-text-primary">챔피언 비교</h1>
        <div className="flex flex-wrap items-center gap-3">
          {championIds.map((id, colIdx) => {
            const detail = queries[colIdx]?.data;
            return (
              <div
                key={id}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-bg-secondary/80 px-3 py-2"
              >
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ background: COL_COLORS[colIdx] }}
                />
                {detail ? (
                  <>
                    <div className="relative h-7 w-7 overflow-hidden rounded-lg border border-white/10">
                      <Image src={getChampionIconById(id)} alt={detail.championNameKorean} fill className="object-cover" unoptimized />
                    </div>
                    <span className="text-sm font-semibold text-text-primary">{detail.championNameKorean}</span>
                  </>
                ) : (
                  <span className="text-sm text-text-tertiary">{id}</span>
                )}
                <button type="button" onClick={() => removeChampion(id)} className="ml-1 text-text-tertiary hover:text-accent-danger">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}

          {/* 챔피언 추가 */}
          {championIds.length < MAX_COMPARE && (
            adding ? (
              <select
                autoFocus
                className="rounded-xl border border-white/10 bg-bg-secondary/80 px-3 py-2 text-sm text-text-primary outline-none"
                defaultValue=""
                onChange={(e) => { if (e.target.value) addChampion(Number(e.target.value)); }}
                onBlur={() => setAdding(false)}
              >
                <option value="" disabled>챔피언 선택</option>
                {championCatalog
                  .filter((c) => !championIds.includes(c.championId))
                  .map((c) => (
                    <option key={c.championId} value={c.championId}>{c.championNameKorean}</option>
                  ))}
              </select>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex items-center gap-1.5 rounded-xl border border-dashed border-white/10 bg-bg-secondary/40 px-3 py-2 text-sm text-text-tertiary transition-colors hover:bg-bg-elevated"
              >
                <Plus className="h-4 w-4" />
                챔피언 추가
              </button>
            )
          )}
        </div>
      </div>

      {isLoading && (
        <div className="flex min-h-[40vh] items-center justify-center">
          <LoadingSpinner />
        </div>
      )}

      {/* 비교 없는 상태 */}
      {!isLoading && championIds.length === 0 && (
        <Card className="border-white/10 bg-bg-secondary/80">
          <CardContent className="py-12 text-center text-sm text-text-secondary">
            비교할 챔피언을 추가해주세요. (최대 {MAX_COMPARE}개)
          </CardContent>
        </Card>
      )}

      {/* 비교 테이블 */}
      {!isLoading && championIds.length > 0 && (
        <Card className="border-white/10 bg-bg-secondary/80">
          <CardHeader>
            <CardTitle className="text-base">수치 비교</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-2 pr-4 text-left text-xs text-text-tertiary">지표</th>
                  {championIds.map((id, colIdx) => {
                    const detail = queries[colIdx]?.data;
                    return (
                      <th key={id} className="py-2 px-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <div
                            className="h-2.5 w-full rounded-full"
                            style={{ background: COL_COLORS[colIdx] + "40" }}
                          />
                          <span className="text-xs font-semibold text-text-primary">
                            {detail?.championNameKorean ?? `#${id}`}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {metrics.map((metric) => {
                  // 수치 비교를 위한 raw 값들
                  const rawValues = queries.map((q) =>
                    q.data ? getRawValue(q.data, metric.label) : null,
                  );
                  const validRaws = rawValues.filter((v): v is number => v !== null);
                  const maxRaw = validRaws.length > 0 ? Math.max(...validRaws) : null;
                  const minRaw = validRaws.length > 0 ? Math.min(...validRaws) : null;

                  return (
                    <tr key={metric.label} className="border-b border-white/10 last:border-0">
                      <td className="py-2.5 pr-4 text-xs text-text-tertiary">{metric.label}</td>
                      {championIds.map((id, colIdx) => {
                        const detail = queries[colIdx]?.data;
                        const raw = detail ? getRawValue(detail, metric.label) : null;
                        const isBest =
                          metric.better === "higher" && raw !== null && raw === maxRaw && validRaws.length > 1;
                        const isWorst =
                          metric.better === "higher" && raw !== null && raw === minRaw && raw !== maxRaw && validRaws.length > 1;
                        return (
                          <td key={id} className="py-2.5 px-3 text-center">
                            {detail ? (
                              <span className={`text-sm font-semibold ${
                                isBest ? "text-accent-success" : isWorst ? "text-accent-danger" : "text-text-primary"
                              }`}>
                                {metric.getValue(detail)}
                              </span>
                            ) : (
                              <span className="text-text-tertiary">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* 챔피언 상세 링크 */}
      {championIds.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {championIds.map((id, colIdx) => {
            const detail = queries[colIdx]?.data;
            if (!detail) return null;
            return (
              <Link
                key={id}
                href={`/lab/champions/${id}?period=${activePeriod}&source=${activeSource}`}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-bg-secondary/80 px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
              >
                <div className="h-2 w-2 rounded-full" style={{ background: COL_COLORS[colIdx] }} />
                {detail.championNameKorean} 상세 보기
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
