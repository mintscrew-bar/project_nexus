"use client";

import Image from "next/image";
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
import { getChampionIconById } from "@/components/matches/match-utils";
import { formatRate, formatDelta, formatPosition, confidenceLabel } from "@/lib/lab-format";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, LoadingSpinner } from "@/components/ui";
import { LabEmptyState } from "@/components/lab/shared/LabEmptyState";
import { Activity, ArrowRight, ShieldAlert, Swords, Users, Target, FlaskConical } from "lucide-react";

// ─── 통계 요약 카드 ────────────────────────────────────────────────────────────
function StatMetric({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ElementType;
}) {
  return (
    <Card className="border-white/10 bg-bg-secondary/80">
      <CardContent className="flex items-start justify-between p-5">
        <div>
          <p className="text-sm text-text-secondary">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-text-primary">{value}</p>
          <p className="mt-2 text-xs leading-5 text-text-tertiary">{hint}</p>
        </div>
        <div className="rounded-2xl bg-accent-primary/10 p-3 text-accent-primary">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function LabMetaPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { period: activePeriod } = useLabStore();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "ADMIN";
  const canFetch = !authLoading && isAuthenticated && isAdmin;

  const { data: overview, isLoading: overviewLoading, isError: overviewError } = useQuery<LabOverview>({
    ...labQueryOptions.overview(),
    enabled: canFetch,
  });

  const { data: metaRadar, isLoading: metaRadarLoading } = useQuery<MetaRadarResponse>({
    ...labQueryOptions.metaRadar(activePeriod),
    enabled: canFetch,
  });

  const { data: patchImpact } = useQuery<PatchImpactResponse>({
    ...labQueryOptions.patchImpact(),
    enabled: canFetch,
  });

  const { data: playPatterns } = useQuery<PlayPatternsResponse>({
    ...labQueryOptions.playPatterns(activePeriod),
    enabled: canFetch,
  });

  const { data: rankedSnapshots } = useQuery<RankedSnapshotsResponse>({
    ...labQueryOptions.rankedSnapshots({ period: "30d" }),
    enabled: canFetch,
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
        c.championId,
        { winRate: c.winRate, games: c.games },
      ]),
    );
    const rankedTop = rankedSnapshots.champions
      .filter((r) => r.position === null && r.games >= 5)
      .slice(0, 20);
    return rankedTop
      .map((r) => ({
        ...r,
        customWinRate: (customMap.get(r.championId)?.winRate ?? null) as number | null,
        customGames: (customMap.get(r.championId)?.games ?? null) as number | null,
        delta:
          customMap.get(r.championId) !== undefined
            ? r.winRate - (customMap.get(r.championId)?.winRate as number)
            : null,
      }))
      .filter((r) => r.customWinRate !== null && r.delta !== null)
      .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0))
      .slice(0, 10);
  }, [rankedSnapshots, metaRadar]);

  const loading = canFetch && (overviewLoading || metaRadarLoading);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (overviewError || !overview) {
    return (
      <div className="flex items-start gap-4 rounded-2xl border border-accent-danger/20 bg-accent-danger/5 p-6">
        <ShieldAlert className="mt-0.5 h-5 w-5 text-accent-danger" />
        <div>
          <p className="font-semibold text-text-primary">실험실 로드 실패</p>
          <p className="mt-1 text-sm text-text-secondary">
            관리자용 실험실 데이터를 아직 사용할 수 없습니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── 데이터셋 요약 통계 ── */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatMetric
          label="분석된 경기"
          value={overview.sample.matchesWithStats.toLocaleString()}
          hint={`참가자 행 ${overview.sample.participantRows.toLocaleString()}개`}
          icon={Swords}
        />
        <StatMetric
          label="최근 30일"
          value={`${overview.sample.recentMatches30d.toLocaleString()}경기`}
          hint={`경기당 평균 ${avgParticipantsPerMatch.toFixed(1)}명`}
          icon={Activity}
        />
        <StatMetric
          label="플레이어 표본"
          value={overview.sample.playersInDataset.toLocaleString()}
          hint="내전 데이터에 포함된 유저 수"
          icon={Users}
        />
        <StatMetric
          label="챔피언 풀"
          value={overview.sample.championsInDataset.toLocaleString()}
          hint="실제로 사용된 챔피언 수"
          icon={Target}
        />
      </div>

      {/* ── 1. 트렌딩 챔피언 + 랭크 비교 ── */}
      <div className="grid gap-6 xl:grid-cols-2">
        {/* 트렌딩 챔피언 */}
        <Card className="border-white/10 bg-bg-secondary/80">
          <CardHeader>
            <CardTitle>트렌딩 챔피언</CardTitle>
            <CardDescription>최근 픽률 상승폭 기준 TOP 5</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(metaRadar?.trending ?? []).length === 0 ? (
              <p className="text-sm text-text-secondary">트렌딩 데이터가 아직 부족합니다.</p>
            ) : (
              (metaRadar?.trending ?? []).slice(0, 5).map((champion) => (
                <Link
                  key={champion.championId}
                  href={`/lab/champions/${champion.championId}?period=${activePeriod}`}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-bg-primary/60 p-3 transition-colors hover:bg-bg-elevated"
                >
                  <div className="relative h-10 w-10 overflow-hidden rounded-lg border border-white/10 bg-slate-950/60">
                    <Image
                      src={getChampionIconById(champion.championId)}
                      alt={champion.championNameKorean}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-text-primary">{champion.championNameKorean}</p>
                    <p className="text-xs text-text-tertiary">
                      승률 {champion.recentWinRate.toFixed(1)}% · 최근 {champion.recentGames}게임
                    </p>
                  </div>
                  <Badge variant="success">{formatDelta(champion.pickRateDelta, 2)}</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* 내전 vs 랭크 비교 */}
        <Card className="border-white/10 bg-bg-secondary/80">
          <CardHeader>
            <CardTitle>내전 vs 랭크 메타 비교</CardTitle>
            <CardDescription>
              고티어(챌린저+그마) 랭크 메타와 내전 메타의 챔피언 승률 차이
            </CardDescription>
          </CardHeader>
          <CardContent>
            {rankedComparison.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-bg-primary/60 p-4 text-sm text-text-secondary">
                랭크 메타 스냅샷 수집 중입니다. 고티어 시딩 유저 배치가 완료되면 표시됩니다.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="mb-3 flex gap-4 text-xs text-text-tertiary">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-accent-success" />
                    랭크 우세
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-accent-danger" />
                    내전 우세
                  </span>
                </div>
                {rankedComparison.map((row) => {
                  const isRankedBetter = (row.delta ?? 0) > 0;
                  return (
                    <Link
                      key={row.championId}
                      href={`/lab/champions/${row.championId}`}
                      className="flex items-center gap-2 rounded-lg bg-bg-primary/40 px-3 py-2 transition-colors hover:bg-bg-elevated"
                    >
                      <Image
                        src={getChampionIconById(row.championId)}
                        alt={`챔피언 ${row.championId}`}
                        width={24}
                        height={24}
                        className="rounded-full"
                        unoptimized
                      />
                      <span className="w-20 truncate text-xs text-text-secondary">
                        {`#${row.championId}`}
                      </span>
                      <div className="flex flex-1 items-center gap-1 text-xs">
                        <span className="text-text-tertiary">
                          내전 {formatRate(row.customWinRate ?? 0)}
                        </span>
                        <ArrowRight className="h-3 w-3 text-text-tertiary" />
                        <span className="text-text-primary">
                          랭크 {formatRate(row.winRate)}
                        </span>
                      </div>
                      <Badge
                        variant={isRankedBetter ? "success" : "danger"}
                        className="shrink-0 text-xs"
                      >
                        {formatDelta((row.delta ?? 0) * 100)}
                      </Badge>
                    </Link>
                  );
                })}
                <p className="mt-2 text-xs text-text-tertiary">
                  * KR 챌린저+그마 30일 데이터 기준 (최소 5경기)
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── 2. 패치 임팩트 (브리핑+상세 통합) ── */}
      <Card className="border-white/10 bg-bg-secondary/80">
        <CardHeader>
          <CardTitle>패치 임팩트</CardTitle>
          <CardDescription>
            {patchImpact?.currentPatch && patchImpact?.previousPatch
              ? `${patchImpact.previousPatch} → ${patchImpact.currentPatch} 기준 내전 양상 변화`
              : "패치 비교 데이터 준비 중"}
          </CardDescription>
          {patchImpact?.currentPatch && (
            <a
              href="https://www.leagueoflegends.com/ko-kr/news/tags/patch-notes/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-accent-info hover:text-accent-info/80"
            >
              라이엇 패치 노트
              <ArrowRight className="h-3 w-3" />
            </a>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {/* 수혜 챔피언 */}
            <div className="rounded-xl border border-white/10 bg-bg-primary/50 p-3">
              <p className="mb-2 text-xs font-semibold text-accent-success">수혜 TOP 5</p>
              <div className="space-y-1.5">
                {(patchImpact?.buffed ?? []).length === 0 ? (
                  <p className="text-xs text-text-tertiary">데이터 없음</p>
                ) : (
                  (patchImpact?.buffed ?? []).slice(0, 5).map((row) => (
                    <Link
                      key={`buff-${row.championId}`}
                      href={`/lab/champions/${row.championId}`}
                      className="flex items-center justify-between rounded text-xs text-text-secondary hover:text-text-primary"
                    >
                      <span>{row.championNameKorean}</span>
                      <span className="text-accent-success">{formatDelta(row.deltaWinRate)}</span>
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* 피해 챔피언 */}
            <div className="rounded-xl border border-white/10 bg-bg-primary/50 p-3">
              <p className="mb-2 text-xs font-semibold text-accent-danger">피해 TOP 5</p>
              <div className="space-y-1.5">
                {(patchImpact?.nerfed ?? []).length === 0 ? (
                  <p className="text-xs text-text-tertiary">데이터 없음</p>
                ) : (
                  (patchImpact?.nerfed ?? []).slice(0, 5).map((row) => (
                    <Link
                      key={`nerf-${row.championId}`}
                      href={`/lab/champions/${row.championId}`}
                      className="flex items-center justify-between rounded text-xs text-text-secondary hover:text-text-primary"
                    >
                      <span>{row.championNameKorean}</span>
                      <span className="text-accent-danger">{formatDelta(row.deltaWinRate)}</span>
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* 포지션 변화 */}
            <div className="rounded-xl border border-white/10 bg-bg-primary/50 p-3">
              <p className="mb-2 text-xs font-semibold text-accent-info">포지션 변화 TOP 3</p>
              <div className="space-y-1.5">
                {(patchImpact?.positionShifts ?? []).length === 0 ? (
                  <p className="text-xs text-text-tertiary">데이터 없음</p>
                ) : (
                  (patchImpact?.positionShifts ?? []).slice(0, 3).map((row) => (
                    <div key={`pos-${row.position}`} className="text-xs text-text-secondary">
                      <span className="font-medium text-text-primary">{formatPosition(row.position)}</span>
                      {" "}승률 {formatDelta(row.deltaWinRate)} · 픽률 {formatDelta(row.deltaPickRate, 2)}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 조합 변화 */}
            <div className="rounded-xl border border-white/10 bg-bg-primary/50 p-3">
              <p className="mb-2 text-xs font-semibold text-accent-purple">조합 변화 TOP 3</p>
              <div className="space-y-1.5">
                {(patchImpact?.compositionShifts ?? []).length === 0 ? (
                  <p className="text-xs text-text-tertiary">데이터 없음</p>
                ) : (
                  (patchImpact?.compositionShifts ?? []).slice(0, 3).map((row) => (
                    <div key={`comp-${row.type}`} className="text-xs text-text-secondary">
                      <span className="font-medium text-text-primary">{row.label}</span>
                      {" "}픽률 {formatDelta(row.deltaPickRate, 2)} · 승률 {formatDelta(row.deltaWinRate)}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-text-tertiary">
            표본: 현재 {patchImpact?.sample.currentGames ?? 0}경기 / 이전 {patchImpact?.sample.previousGames ?? 0}경기
          </p>
        </CardContent>
      </Card>

      {/* ── 3. 포지션별 티어 그리드 ── */}
      <Card className="border-white/10 bg-bg-secondary/80">
        <CardHeader>
          <CardTitle>포지션별 티어 그리드</CardTitle>
          <CardDescription>Wilson + 픽률 가중 점수 기반 (S/A/B/C/D)</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {(["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const).map((position) => {
            const rows = (metaRadar?.tiers?.[position] ?? []).slice(0, 5);
            return (
              <div key={position} className="rounded-xl border border-white/10 bg-bg-primary/60 p-3">
                <p className="mb-2 text-sm font-semibold text-text-primary">{formatPosition(position)}</p>
                <div className="space-y-2">
                  {rows.length === 0 ? (
                    <p className="text-xs text-text-tertiary">데이터 부족</p>
                  ) : (
                    rows.map((row) => (
                      <Link
                        key={`${position}-${row.championId}`}
                        href={`/lab/champions/${row.championId}?period=${activePeriod}`}
                        className="flex items-center justify-between gap-2 text-xs transition-opacity hover:opacity-80"
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          <div className="relative h-5 w-5 shrink-0 overflow-hidden rounded border border-white/10">
                            <Image
                              src={getChampionIconById(row.championId)}
                              alt={`champion-${row.championId}`}
                              fill
                              className="object-cover"
                              unoptimized
                            />
                          </div>
                          <span className="truncate text-text-secondary">
                            {/* championNameKorean은 tiers 응답에 없을 수 있어 ID로 fallback */}
                            {row.championId}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Badge
                            variant={
                              row.tier === "S" ? "success" : row.tier === "A" ? "default" : "secondary"
                            }
                          >
                            {row.tier}
                          </Badge>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── 4. 내전 활동 패턴 ── */}
      {playPatterns && playPatterns.totalGames > 0 && (
        <Card className="border-white/10 bg-bg-secondary/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent-info" />
              내전 활동 패턴
            </CardTitle>
            <CardDescription>
              KST 기준 요일·시간대별 내전 빈도 (총 {playPatterns.totalGames}경기 / {playPatterns.periodDays}일)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              {/* 요일별 */}
              <div>
                <p className="mb-3 text-xs font-semibold text-text-secondary">요일별 빈도</p>
                <div className="space-y-1.5">
                  {playPatterns.byDayOfWeek.map((d) => {
                    const maxGames = Math.max(...playPatterns.byDayOfWeek.map((x) => x.games), 1);
                    const pct = d.games / maxGames;
                    const isPeak = d.dayOfWeek === playPatterns.peakDayOfWeek;
                    return (
                      <div key={d.dayOfWeek} className="flex items-center gap-2">
                        <span className={`w-4 text-xs font-medium ${isPeak ? "text-accent-info" : "text-text-tertiary"}`}>
                          {d.dayLabel}
                        </span>
                        <div className="flex-1 rounded-full bg-bg-primary/60">
                          <div
                            className={`h-4 rounded-full ${isPeak ? "bg-accent-info" : "bg-white/20"}`}
                            style={{ width: `${Math.max(pct * 100, 2)}%` }}
                          />
                        </div>
                        <span className="w-8 text-right text-xs text-text-secondary">{d.games}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 시간대별 */}
              <div>
                <p className="mb-3 text-xs font-semibold text-text-secondary">시간대별 빈도 (KST)</p>
                <div className="flex h-32 items-end gap-0.5">
                  {playPatterns.byHour.map((h) => {
                    const maxGames = Math.max(...playPatterns.byHour.map((x) => x.games), 1);
                    const pct = h.games / maxGames;
                    const isPeak = h.hour === playPatterns.peakHour;
                    return (
                      <div key={h.hour} className="group relative flex flex-1 flex-col items-center">
                        <div
                          className={`w-full rounded-t transition-colors ${isPeak ? "bg-accent-info" : "bg-white/20 group-hover:bg-white/30"}`}
                          style={{ height: `${Math.max(pct * 100, 2)}%` }}
                        />
                        {h.hour % 6 === 0 && (
                          <span className="absolute -bottom-5 text-[9px] text-text-tertiary">{h.hour}시</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-6 flex gap-4 text-xs text-text-tertiary">
                  <span>피크 요일: <span className="font-medium text-accent-info">{["일", "월", "화", "수", "목", "금", "토"][playPatterns.peakDayOfWeek]}요일</span></span>
                  <span>피크 시간: <span className="font-medium text-accent-info">{playPatterns.peakHour}시</span></span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 5. 챔피언 시그널 ── */}
      {overview.championSignals.length > 0 && (
        <Card className="border-white/10 bg-bg-secondary/80">
          <CardHeader>
            <CardTitle>연구 우선순위 챔피언</CardTitle>
            <CardDescription>표본이 쌓인 챔피언부터 내전 특화 지표 후보로 분류합니다.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {overview.championSignals.map((champion) => (
              <Link
                key={champion.championId}
                href={`/lab/champions/${champion.championId}?period=${activePeriod}`}
                className="rounded-2xl border border-white/10 bg-bg-primary/60 p-4 transition-colors hover:bg-bg-elevated"
              >
                <div className="flex items-center gap-3">
                  <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-white/10 bg-slate-950/60">
                    <Image
                      src={getChampionIconById(champion.championId)}
                      alt={champion.championName}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  <div>
                    <p className="font-semibold text-text-primary">{champion.championNameKorean}</p>
                    <p className="text-xs text-text-tertiary">{champion.games.toLocaleString()}게임 표본</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-text-tertiary">승률</p>
                    <p className="mt-0.5 font-semibold text-text-primary">{champion.winRate.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-text-tertiary">평균 KDA</p>
                    <p className="mt-0.5 font-semibold text-text-primary">
                      {champion.avgKills.toFixed(1)} / {champion.avgDeaths.toFixed(1)} / {champion.avgAssists.toFixed(1)}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── 데이터 없음 상태 ── */}
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
