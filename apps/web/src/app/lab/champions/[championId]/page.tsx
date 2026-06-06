"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { useLabStore, type LabPeriod } from "@/stores/lab-store";
import {
  labQueryOptions,
  type ChampionDetailResponse,
  type ChampionMasteryResponse,
  type LabDataSource,
} from "@/lib/lab-queries";
import { getChampionIconById, getItemIcon, getSummonerSpellIcon, getPerkIcon, getPerkName } from "@/components/matches/match-utils";
import { formatRate } from "@/lib/lab-format";
import {
  Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, LoadingSpinner,
} from "@/components/ui";
import { TrendChart } from "@/components/lab/charts/TrendChart";
import { PositionPie } from "@/components/lab/charts/PositionPie";
import { PatchTrendCard } from "@/components/lab/charts/PatchTrendCard";
import { LabConfidenceBadge, LabDataSourceBadge } from "@/components/lab/shared/LabSourceBadge";
import { ArrowLeft, Crown, Medal } from "lucide-react";

const SOURCE_OPTIONS: Array<{ key: LabDataSource; label: string; hint: string }> = [
  { key: "custom", label: "내전", hint: "Nexus 내전" },
  { key: "ranked-community", label: "랭크", hint: "등록 유저 랭크" },
  { key: "ranked-meta", label: "랭크 메타", hint: "고티어 시딩" },
];

function getDetailConfidence(detail?: ChampionDetailResponse) {
  if (!detail) return undefined;
  const topPosition = [...detail.positions].sort((a, b) => b.games - a.games)[0];
  return topPosition?.confidenceLevel ?? (
    detail.totals.games >= 30 ? "high" : detail.totals.games >= 15 ? "moderate" : detail.totals.games >= 5 ? "low" : "insufficient"
  );
}

export default function ChampionDetailPage() {
  const params = useParams<{ championId: string }>();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { period: storePeriod, statsEnabled } = useLabStore();
  const canFetch = !authLoading && isAuthenticated && statsEnabled;

  const urlPeriod = searchParams.get("period") as LabPeriod | null;
  const activePeriod: LabPeriod =
    urlPeriod && ["30d", "90d", "all"].includes(urlPeriod) ? urlPeriod : storePeriod;
  const urlSource = searchParams.get("source") as LabDataSource | null;
  const activeSource: LabDataSource =
    urlSource && SOURCE_OPTIONS.some((source) => source.key === urlSource)
      ? urlSource
      : "custom";

  const championId = Number(params.championId);

  const { data: detail, isLoading: detailLoading, isError: detailError } = useQuery<ChampionDetailResponse>({
    ...labQueryOptions.championDetail(championId, activePeriod, activeSource),
    enabled: canFetch && championId > 0,
  });

  const { data: mastery, isLoading: masteryLoading } = useQuery<ChampionMasteryResponse>({
    ...labQueryOptions.championMastery(championId, activeSource),
    enabled: canFetch && championId > 0,
  });

  const { data: customDetail } = useQuery<ChampionDetailResponse>({
    ...labQueryOptions.championDetail(championId, activePeriod, "custom"),
    enabled: canFetch && championId > 0,
  });

  const { data: rankedDetail } = useQuery<ChampionDetailResponse>({
    ...labQueryOptions.championDetail(championId, activePeriod, "ranked-community"),
    enabled: canFetch && championId > 0,
  });

  if (detailLoading || authLoading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><LoadingSpinner /></div>;
  }

  if (detailError || !detail) {
    return (
      <div className="rounded-xl border border-accent-danger/20 bg-accent-danger/10 p-4 text-sm text-text-secondary">
        챔피언 상세 데이터를 불러오지 못했습니다.
      </div>
    );
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

      {/* 헤더 */}
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60">
          <Image src={getChampionIconById(detail.championId)} alt={detail.championNameKorean} fill className="object-cover" unoptimized />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-text-primary">{detail.championNameKorean}</h1>
            <LabDataSourceBadge source={detail.dataSource} />
            <LabConfidenceBadge confidence={getDetailConfidence(detail)} games={detail.totals.games} />
          </div>
          <p className="text-sm text-text-tertiary">{detail.championName}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {SOURCE_OPTIONS.map((source) => (
          <Link
            key={source.key}
            href={`/lab/champions/${championId}?period=${activePeriod}&source=${source.key}`}
            className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
              activeSource === source.key
                ? "bg-accent-primary/20 text-accent-primary"
                : "bg-bg-secondary/80 text-text-secondary hover:bg-bg-elevated"
            }`}
            title={source.hint}
          >
            {source.label}
          </Link>
        ))}
      </div>

      {/* 기간 요약 통계 */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-bg-secondary/80 p-4">
          <p className="text-xs text-text-tertiary">누적 게임</p>
          <p className="mt-1 text-2xl font-bold text-text-primary">{detail.totals.games}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-bg-secondary/80 p-4">
          <p className="text-xs text-text-tertiary">승률</p>
          <p className="mt-1 text-2xl font-bold text-accent-success">{formatRate(detail.totals.winRate)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-bg-secondary/80 p-4">
          <p className="text-xs text-text-tertiary">분석 기간</p>
          <p className="mt-1 text-2xl font-bold text-text-primary">{detail.period}</p>
        </div>
      </div>

      <Card className="border-white/10 bg-bg-secondary/80">
        <CardHeader>
          <CardTitle className="text-base">내전 ↔ 랭크 비교</CardTitle>
          <CardDescription>같은 챔피언의 Nexus 내전과 등록 유저 랭크 표본을 나란히 봅니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              { label: "내전", source: "custom" as const, data: customDetail },
              { label: "랭크", source: "ranked-community" as const, data: rankedDetail },
            ].map((entry) => (
              <div key={entry.label} className="rounded-xl border border-white/10 bg-bg-primary/50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold text-text-secondary">{entry.label}</p>
                  <LabDataSourceBadge source={entry.source} />
                  <LabConfidenceBadge confidence={getDetailConfidence(entry.data)} games={entry.data?.totals.games} />
                </div>
                {entry.data ? (
                  <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-text-tertiary">게임</p>
                      <p className="font-bold text-text-primary">{entry.data.totals.games}</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-tertiary">승률</p>
                      <p className="font-bold text-accent-success">{formatRate(entry.data.totals.winRate)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-tertiary">주 포지션</p>
                      <p className="font-bold text-text-primary">
                        {[...entry.data.positions].sort((a, b) => b.games - a.games)[0]?.position ?? "-"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-text-secondary">표본이 없습니다.</p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 추이 + 포지션 분포 */}
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-white/10 bg-bg-secondary/80">
          <CardHeader><CardTitle className="text-base">기간별 승률 추이</CardTitle></CardHeader>
          <CardContent><TrendChart detail={detail} /></CardContent>
        </Card>
        <Card className="border-white/10 bg-bg-secondary/80">
          <CardHeader><CardTitle className="text-base">포지션 분포</CardTitle></CardHeader>
          <CardContent><PositionPie detail={detail} /></CardContent>
        </Card>
      </div>

      {/* 패치 히스토리 */}
      <PatchTrendCard detail={detail} />

      {/* 빌드 + 룬 */}
      <Card className="border-white/10 bg-bg-secondary/80">
        <CardHeader>
          <CardTitle className="text-base">코어 빌드 TOP 5</CardTitle>
          <CardDescription>최종 인벤토리·스펠·핵심 룬 조합 기준</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {detail.topBuilds.length === 0 ? (
            <p className="text-sm text-text-secondary">조건을 만족하는 코어 빌드가 없습니다.</p>
          ) : (
            detail.topBuilds.map((build) => (
              <div
                key={`${build.coreItems.join("-")}-${build.boots ?? "none"}-${build.summonerSpellIds.join("-")}-${build.keystonePerk}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-bg-primary/50 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  {build.coreItems.map((itemId) => (
                    <div key={itemId} className="relative h-8 w-8 overflow-hidden rounded-md border border-white/10">
                      <Image src={getItemIcon(itemId)} alt={`item-${itemId}`} fill className="object-cover" unoptimized />
                    </div>
                  ))}
                  {build.boots ? (
                    <div className="relative h-8 w-8 overflow-hidden rounded-md border border-white/10 opacity-80">
                      <Image src={getItemIcon(build.boots)} alt={`boots-${build.boots}`} fill className="object-cover" unoptimized />
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-1">
                  {build.summonerSpellIds.map((spellId) => (
                    <div key={spellId} className="relative h-7 w-7 overflow-hidden rounded-md border border-white/10">
                      <Image src={getSummonerSpellIcon(spellId)} alt={`spell-${spellId}`} fill className="object-cover" unoptimized />
                    </div>
                  ))}
                  <div
                    className="relative h-7 w-7 overflow-hidden rounded-full border border-white/10 bg-bg-primary/70"
                    title={getPerkName(build.keystonePerk)}
                  >
                    <Image src={getPerkIcon(build.keystonePerk)} alt={getPerkName(build.keystonePerk)} fill className="object-cover" unoptimized />
                  </div>
                </div>
                <p className="text-xs text-text-secondary">{build.games}게임</p>
                <p className="text-sm font-semibold text-accent-success">{formatRate(build.winRate)}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-white/10 bg-bg-secondary/80">
          <CardHeader>
            <CardTitle className="text-base">최고 성과 빌드 TOP 5</CardTitle>
            <CardDescription>Wilson 하한 기준</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {detail.topItemCombos.length === 0 ? (
              <p className="text-sm text-text-secondary">조건을 만족하는 빌드 조합이 없습니다.</p>
            ) : (
              detail.topItemCombos.map((combo) => (
                <div
                  key={`${combo.itemIds[0]}-${combo.itemIds[1]}`}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-bg-primary/50 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    {combo.itemIds.map((itemId) => (
                      <div key={itemId} className="relative h-8 w-8 overflow-hidden rounded-md border border-white/10">
                        <Image src={getItemIcon(itemId)} alt={`item-${itemId}`} fill className="object-cover" unoptimized />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-text-secondary">{combo.games}게임</p>
                  <p className="text-sm font-semibold text-accent-success">{formatRate(combo.winRate)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-bg-secondary/80">
          <CardHeader>
            <CardTitle className="text-base">추천 룬 TOP 3</CardTitle>
            <CardDescription>승률 + 픽률 종합 기준</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {detail.topRuneCombos.length === 0 ? (
              <p className="text-sm text-text-secondary">조건을 만족하는 룬 조합이 없습니다.</p>
            ) : (
              detail.topRuneCombos.map((combo, idx) => (
                <div
                  key={`${combo.primaryStyle}-${combo.subStyle}-${combo.keystonePerk}-${idx}`}
                  className="rounded-lg border border-white/10 bg-bg-primary/50 px-3 py-3"
                >
                  <div className="flex items-start gap-4">
                    {/* 주 트리 */}
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="relative h-5 w-5 overflow-hidden rounded-full" title={getPerkName(combo.primaryStyle)}>
                          <Image src={getPerkIcon(combo.primaryStyle)} alt={getPerkName(combo.primaryStyle)} fill className="object-cover" unoptimized />
                        </div>
                        <span className="text-[10px] font-semibold text-text-tertiary">{getPerkName(combo.primaryStyle)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {/* 키스톤은 크게 */}
                        <div
                          className="relative h-9 w-9 overflow-hidden rounded-full border border-white/20 bg-bg-primary/70"
                          title={getPerkName(combo.keystonePerk)}
                        >
                          <Image src={getPerkIcon(combo.keystonePerk)} alt={getPerkName(combo.keystonePerk)} fill className="object-cover" unoptimized />
                        </div>
                        {/* 나머지 주 트리 룬 3개 */}
                        {combo.primarySelections.slice(1).map((perkId) => (
                          <div
                            key={perkId}
                            className="relative h-6 w-6 overflow-hidden rounded-full border border-white/10 bg-bg-primary/70"
                            title={getPerkName(perkId)}
                          >
                            <Image src={getPerkIcon(perkId)} alt={getPerkName(perkId)} fill className="object-cover" unoptimized />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 구분선 */}
                    <div className="mt-5 h-8 w-px shrink-0 bg-white/10" />

                    {/* 보조 트리 */}
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="relative h-5 w-5 overflow-hidden rounded-full" title={getPerkName(combo.subStyle)}>
                          <Image src={getPerkIcon(combo.subStyle)} alt={getPerkName(combo.subStyle)} fill className="object-cover" unoptimized />
                        </div>
                        <span className="text-[10px] font-semibold text-text-tertiary">{getPerkName(combo.subStyle)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {combo.subSelections.map((perkId) => (
                          <div
                            key={perkId}
                            className="relative h-6 w-6 overflow-hidden rounded-full border border-white/10 bg-bg-primary/70"
                            title={getPerkName(perkId)}
                          >
                            <Image src={getPerkIcon(perkId)} alt={getPerkName(perkId)} fill className="object-cover" unoptimized />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 통계 */}
                    <div className="ml-auto flex flex-col items-end gap-0.5">
                      <p className="text-sm font-bold text-accent-success">{formatRate(combo.winRate)}</p>
                      <p className="text-xs text-text-tertiary">{combo.games}게임</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* 장인 명단 */}
      <Card className="border-white/10 bg-bg-secondary/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-accent-gold" />
            {detail.championNameKorean} 장인
          </CardTitle>
          <CardDescription>
            {mastery?.appliedCriteria
              ? `최소 ${mastery.appliedCriteria.minGames}게임 · ${mastery.appliedCriteria.minWinRate * 100}% 이상${mastery.appliedCriteria.isRelaxed ? " (기준 완화 적용)" : ""}`
              : "장인 자격 기준 적용"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {masteryLoading ? (
            <div className="flex min-h-[120px] items-center justify-center"><LoadingSpinner /></div>
          ) : !mastery || mastery.insufficient || mastery.masteries.length === 0 ? (
            <p className="text-sm text-text-secondary">
              장인 자격을 통과한 유저가 없습니다.
              {mastery && ` (전체 ${mastery.totalUniquePlayersOnChamp}명 중 0명 통과)`}
            </p>
          ) : (
            <div className="space-y-3">
              {mastery.masteries.map((entry) => (
                <Link
                  key={entry.userId}
                  href={`/users/${entry.userId}`}
                  className="flex items-center gap-4 rounded-2xl border border-white/10 bg-bg-primary/60 p-4 transition-colors hover:bg-bg-elevated"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-gold/10 text-sm font-bold text-accent-gold">
                    {entry.rank}
                  </div>
                  <div className="relative h-10 w-10 overflow-hidden rounded-full border border-white/10 bg-bg-tertiary">
                    {entry.avatar ? (
                      <Image src={entry.avatar} alt={entry.username} fill className="object-cover" unoptimized />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-bold text-text-secondary">
                        {entry.username[0]}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-text-primary">{entry.username}</p>
                      {entry.badges.map((b) => (
                        <Badge key={b} variant="secondary" size="sm">{b}</Badge>
                      ))}
                    </div>
                    <p className="text-xs text-text-tertiary">
                      {entry.champGames}게임 · 승률 {(entry.champWinRate * 100).toFixed(1)}% · KDA {entry.avgKda.toFixed(2)}
                    </p>
                    <p className="text-xs text-text-tertiary">{entry.riotTier} {entry.riotRank}</p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-accent-gold">
                      <Medal className="h-3.5 w-3.5" />
                      <span className="text-sm font-bold">{entry.masteryScore.toFixed(1)}</span>
                    </div>
                    {entry.nexusGlobalRank && (
                      <p className="mt-1 text-xs text-text-tertiary">전체 #{entry.nexusGlobalRank}</p>
                    )}
                  </div>
                </Link>
              ))}
              <p className="text-xs text-text-tertiary">
                전체 {mastery.totalUniquePlayersOnChamp}명 중 {mastery.qualifiedCount}명 통과
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
