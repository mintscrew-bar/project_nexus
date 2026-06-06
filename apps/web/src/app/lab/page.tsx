"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useLabStore } from "@/stores/lab-store";
import {
  labQueryOptions,
  type LabOverview,
  type MetaRadarResponse,
  type PatchImpactResponse,
  type PlayPatternsResponse,
  type RankedSnapshotsResponse,
} from "@/lib/lab-queries";
import { LoadingSpinner } from "@/components/ui";
import { LabEmptyState } from "@/components/lab/shared/LabEmptyState";
import { TrendingChampionsCard } from "@/components/lab/meta/TrendingChampionsCard";
import { RankedComparisonCard } from "@/components/lab/meta/RankedComparisonCard";
import { PatchImpactCard } from "@/components/lab/meta/PatchImpactCard";
import { TierGridCard } from "@/components/lab/meta/TierGridCard";
import { PlayPatternsCard } from "@/components/lab/meta/PlayPatternsCard";
import { ChampionSignalsCard } from "@/components/lab/meta/ChampionSignalsCard";
import { ArrowRight, ShieldAlert, Loader2 } from "lucide-react";

// ─── 통계 인라인 항목 ───────────────────────────────────────────────────────────
function StatItem({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex flex-1 flex-col gap-0.5 px-4 py-3">
      <span className="text-xs text-text-tertiary">{label}</span>
      <span className="text-lg font-bold text-text-primary">{value}</span>
      <span className="text-xs text-text-tertiary">{hint}</span>
    </div>
  );
}

export default function LabMetaPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { period: activePeriod, statsEnabled, setStatsEnabled } = useLabStore();
  const queryClient = useQueryClient();
  const canFetch = !authLoading && isAuthenticated && statsEnabled;

  const { data: overview, isLoading: overviewLoading, isError: overviewError } = useQuery<LabOverview>({
    ...labQueryOptions.overview(), enabled: canFetch,
  });
  const { data: metaRadar, isLoading: metaRadarLoading } = useQuery<MetaRadarResponse>({
    ...labQueryOptions.metaRadar(activePeriod), enabled: canFetch,
  });
  const { data: patchImpact } = useQuery<PatchImpactResponse>({
    ...labQueryOptions.patchImpact(), enabled: canFetch,
  });
  const { data: playPatterns } = useQuery<PlayPatternsResponse>({
    ...labQueryOptions.playPatterns(activePeriod), enabled: canFetch,
  });
  const { data: rankedSnapshots } = useQuery<RankedSnapshotsResponse>({
    ...labQueryOptions.rankedSnapshots({ period: "30d" }), enabled: canFetch,
  });

  // 메타 레이더 다른 기간 프리패치
  useEffect(() => {
    if (!canFetch) return;
    const others = (["30d", "90d", "all"] as const).filter((p) => p !== activePeriod);
    others.forEach((p) => void queryClient.prefetchQuery(labQueryOptions.metaRadar(p)));
  }, [canFetch, activePeriod, queryClient]);

  const avgParticipantsPerMatch = useMemo(() => {
    if (!overview?.sample.matchesWithStats) return 0;
    return overview.sample.participantRows / overview.sample.matchesWithStats;
  }, [overview]);

  // 내전 vs 랭크 비교 계산
  const rankedComparison = useMemo(() => {
    if (!rankedSnapshots || rankedSnapshots.champions.length === 0) return [];
    const customMap = new Map(
      (metaRadar?.tiers ? Object.values(metaRadar.tiers).flat() : []).map((c) => [
        c.championId, { winRate: c.winRate, games: c.games },
      ]),
    );
    return rankedSnapshots.champions
      .filter((r) => r.position === null && r.games >= 5)
      .slice(0, 20)
      .map((r) => ({
        ...r,
        customWinRate: (customMap.get(r.championId)?.winRate ?? null) as number | null,
        customGames: (customMap.get(r.championId)?.games ?? null) as number | null,
        delta: customMap.get(r.championId) !== undefined
          ? r.winRate - (customMap.get(r.championId)?.winRate as number)
          : null,
      }))
      .filter((r) => r.customWinRate !== null && r.delta !== null)
      .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0))
      .slice(0, 10);
  }, [rankedSnapshots, metaRadar]);

  const loading = canFetch && (overviewLoading || metaRadarLoading);

  if (!statsEnabled) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-white/10 bg-bg-secondary/70 p-6">
          <p className="text-sm font-semibold text-text-primary">실험실 통계는 기본 비활성화되어 있습니다.</p>
          <p className="mt-1 text-sm text-text-secondary">
            필요할 때만 데이터를 불러오도록 설정했습니다. 아래 버튼을 눌러 통계를 로드하세요.
          </p>
          <button
            type="button"
            onClick={() => setStatsEnabled(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent-primary/20 px-3 py-2 text-sm font-semibold text-accent-primary transition-colors hover:bg-accent-primary/30"
          >
            <Loader2 className="h-4 w-4" />
            통계 불러오기
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><LoadingSpinner /></div>;
  }

  if (overviewError || !overview) {
    return (
      <div className="flex items-start gap-4 rounded-2xl border border-accent-danger/20 bg-accent-danger/5 p-6">
        <ShieldAlert className="mt-0.5 h-5 w-5 text-accent-danger" />
        <div>
          <p className="font-semibold text-text-primary">실험실 로드 실패</p>
          <p className="mt-1 text-sm text-text-secondary">관리자용 실험실 데이터를 아직 사용할 수 없습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 데이터셋 요약 통계 — 인라인 스트립 */}
      <div className="flex divide-x divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-bg-secondary/80">
        <StatItem label="분석된 경기" value={overview.sample.matchesWithStats.toLocaleString()} hint={`참가자 ${overview.sample.participantRows.toLocaleString()}행`} />
        <StatItem label="최근 30일" value={`${overview.sample.recentMatches30d.toLocaleString()}경기`} hint={`경기당 ${avgParticipantsPerMatch.toFixed(1)}명`} />
        <StatItem label="플레이어 표본" value={overview.sample.playersInDataset.toLocaleString()} hint="내전 데이터 유저" />
        <StatItem label="챔피언 풀" value={overview.sample.championsInDataset.toLocaleString()} hint="사용된 챔피언 수" />
      </div>

      {/* 트렌딩 + 랭크 비교 */}
      <div className="grid gap-6 xl:grid-cols-2">
        <TrendingChampionsCard trending={metaRadar?.trending ?? []} activePeriod={activePeriod} />
        <RankedComparisonCard rankedComparison={rankedComparison} />
      </div>

      {/* 패치 임팩트 */}
      <PatchImpactCard patchImpact={patchImpact} />

      {/* 포지션별 티어 그리드 */}
      <TierGridCard tiers={metaRadar?.tiers} activePeriod={activePeriod} />

      {/* 활동 패턴 */}
      {playPatterns && playPatterns.totalGames > 0 && (
        <PlayPatternsCard playPatterns={playPatterns} />
      )}

      {/* 챔피언 시그널 */}
      <ChampionSignalsCard championSignals={overview.championSignals} activePeriod={activePeriod} />

      {/* 데이터 없음 */}
      {!metaRadar && !overviewLoading && (
        <LabEmptyState level="insufficient" section="메타 레이더" />
      )}

      {/* 전적 페이지 링크 */}
      <div className="flex justify-end">
        <Link
          href="/matches"
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-bg-secondary/60 px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-elevated"
        >
          내전 전적 데이터 보기
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
