"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { useLabStore, type LabPeriod } from "@/stores/lab-store";
import {
  labQueryOptions,
  type ChampionDetailResponse,
  type ChampionMasteryResponse,
} from "@/lib/lab-queries";
import { getChampionIconById, getItemIcon } from "@/components/matches/match-utils";
import { formatRate, formatKda, formatPosition, confidenceLabel } from "@/lib/lab-format";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  LoadingSpinner,
} from "@/components/ui";
import { ArrowLeft, Crown, Medal } from "lucide-react";

/** 기간별 승률 추이 SVG 차트 */
function TrendChart({ detail }: { detail: ChampionDetailResponse }) {
  const chart = useMemo(() => {
    const points = detail.winrateTrend;
    if (points.length < 3) return null;
    const width = 520;
    const height = 220;
    const pad = { left: 34, right: 10, top: 10, bottom: 28 };
    const chartWidth = width - pad.left - pad.right;
    const chartHeight = height - pad.top - pad.bottom;
    const xDenom = Math.max(points.length - 1, 1);
    const minRate = Math.min(...points.map((p) => p.winRate));
    const maxRate = Math.max(...points.map((p) => p.winRate));
    const yMin = Math.max(0, minRate - 0.08);
    const yMax = Math.min(1, maxRate + 0.08);
    const yRange = Math.max(yMax - yMin, 0.01);
    const toX = (idx: number) => pad.left + (idx / xDenom) * chartWidth;
    const toY = (rate: number) => pad.top + chartHeight - ((rate - yMin) / yRange) * chartHeight;
    const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p.winRate).toFixed(1)}`).join(" ");
    const area = `${path} L${toX(points.length - 1).toFixed(1)},${(pad.top + chartHeight).toFixed(1)} L${toX(0).toFixed(1)},${(pad.top + chartHeight).toFixed(1)} Z`;
    const yTicks = [yMin, (yMin + yMax) / 2, yMax];
    const xTicks = points.map((p, i) => ({
      x: toX(i),
      label: new Date(p.weekStart).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }),
    }));
    return { width, height, pad, points, yTicks, xTicks, toX, toY, path, area };
  }, [detail]);

  if (!chart) {
    return <p className="text-sm text-text-secondary">주간 데이터가 3포인트 미만이라 추이를 표시하지 않습니다.</p>;
  }

  return (
    <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="w-full">
      {chart.yTicks.map((tick, idx) => (
        <g key={idx}>
          <line x1={chart.pad.left} x2={chart.width - chart.pad.right} y1={chart.toY(tick)} y2={chart.toY(tick)} stroke="currentColor" strokeOpacity={0.12} />
          <text x={chart.pad.left - 4} y={chart.toY(tick) + 4} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity={0.6}>
            {(tick * 100).toFixed(1)}%
          </text>
        </g>
      ))}
      <path d={chart.area} fill="var(--color-accent-success, #00c853)" fillOpacity={0.1} />
      <path d={chart.path} stroke="var(--color-accent-success, #00c853)" strokeWidth="2.5" fill="none" />
      {chart.points.map((p, i) => (
        <circle key={p.weekStart} cx={chart.xTicks[i].x} cy={chart.toY(p.winRate)} r="3.5" fill="var(--color-accent-success, #00c853)" />
      ))}
      {chart.xTicks.map((tick, i) => (
        <text key={`${tick.label}-${i}`} x={tick.x} y={chart.height - 8} textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity={0.6}>
          {tick.label}
        </text>
      ))}
    </svg>
  );
}

/** 포지션 분포 파이 차트 */
function PositionPie({ detail }: { detail: ChampionDetailResponse }) {
  const slices = useMemo(() => {
    const rows = detail.positions;
    const total = rows.reduce((acc, r) => acc + r.games, 0);
    if (rows.length === 0 || total === 0) return [];
    const colors = ["#667EEA", "#0bc4e2", "#764BA2", "#ffa726", "#f472b6"];
    let startAngle = -Math.PI / 2;
    return rows.map((row, idx) => {
      const slice = (row.games / total) * Math.PI * 2;
      const endAngle = startAngle + slice;
      const largeArc = slice > Math.PI ? 1 : 0;
      const r = 76; const cx = 96; const cy = 96;
      const x1 = cx + Math.cos(startAngle) * r;
      const y1 = cy + Math.sin(startAngle) * r;
      const x2 = cx + Math.cos(endAngle) * r;
      const y2 = cy + Math.sin(endAngle) * r;
      const path = `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
      startAngle = endAngle;
      return { ...row, path, color: colors[idx % colors.length] };
    });
  }, [detail]);

  if (slices.length === 0) return <p className="text-sm text-text-secondary">포지션 분포 데이터가 없습니다.</p>;

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center">
      <svg viewBox="0 0 192 192" className="h-44 w-44 shrink-0">
        {slices.map((s) => (
          <path key={s.position} d={s.path} fill={s.color} opacity={s.confidenceLevel === "low" ? 0.6 : 1} />
        ))}
        <circle cx="96" cy="96" r="36" fill="rgba(15,23,42,0.9)" />
      </svg>
      <div className="w-full space-y-2">
        {slices.map((s) => (
          <div key={`legend-${s.position}`} className={`rounded-lg border border-white/10 bg-bg-secondary/40 px-3 py-2 text-xs ${s.confidenceLevel === "low" ? "opacity-75" : ""}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-text-primary">{formatPosition(s.position)}</span>
              <Badge variant={s.confidenceLevel === "high" ? "success" : "warning"} size="sm">
                {confidenceLabel(s.confidenceLevel)}
              </Badge>
            </div>
            <p className="mt-1 text-text-secondary">
              {s.games}게임 · {(s.pickRateWithinChampion * 100).toFixed(1)}% · 승률 {formatRate(s.winRate)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ChampionDetailPage() {
  const params = useParams<{ championId: string }>();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { period: storePeriod } = useLabStore();
  const isAdmin = user?.role === "ADMIN";
  const canFetch = !authLoading && isAuthenticated && isAdmin;

  // URL period 우선, 없으면 store
  const urlPeriod = searchParams.get("period") as LabPeriod | null;
  const activePeriod: LabPeriod =
    urlPeriod && ["30d", "90d", "all"].includes(urlPeriod)
      ? urlPeriod
      : storePeriod;

  const championId = Number(params.championId);

  const { data: detail, isLoading: detailLoading, isError: detailError } = useQuery<ChampionDetailResponse>({
    ...labQueryOptions.championDetail(championId, activePeriod),
    enabled: canFetch && championId > 0,
  });

  const { data: mastery, isLoading: masteryLoading } = useQuery<ChampionMasteryResponse>({
    ...labQueryOptions.championMastery(championId),
    enabled: canFetch && championId > 0,
  });

  if (detailLoading || authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
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
        href={`/lab/champions?period=${activePeriod}`}
        className="inline-flex items-center gap-1.5 text-sm text-text-tertiary hover:text-text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        챔피언 목록으로
      </Link>

      {/* 헤더 */}
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60">
          <Image
            src={getChampionIconById(detail.championId)}
            alt={detail.championNameKorean}
            fill
            className="object-cover"
            unoptimized
          />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{detail.championNameKorean}</h1>
          <p className="text-sm text-text-tertiary">{detail.championName}</p>
        </div>
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

      {/* 추이 + 포지션 분포 */}
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-white/10 bg-bg-secondary/80">
          <CardHeader>
            <CardTitle className="text-base">기간별 승률 추이</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart detail={detail} />
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-bg-secondary/80">
          <CardHeader>
            <CardTitle className="text-base">포지션 분포</CardTitle>
          </CardHeader>
          <CardContent>
            <PositionPie detail={detail} />
          </CardContent>
        </Card>
      </div>

      {/* 빌드 + 룬 */}
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
            <CardTitle className="text-base">최고 성과 룬 TOP 3</CardTitle>
            <CardDescription>Wilson 하한 기준</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {detail.topRuneCombos.length === 0 ? (
              <p className="text-sm text-text-secondary">조건을 만족하는 룬 조합이 없습니다.</p>
            ) : (
              detail.topRuneCombos.map((combo) => (
                <div
                  key={`${combo.primaryStyle}-${combo.subStyle}-${combo.keystonePerk}`}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-bg-primary/50 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    {[combo.keystonePerk, combo.primaryStyle, combo.subStyle].map((runeId) => (
                      <span
                        key={runeId}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-bg-primary/70 text-xs text-text-tertiary"
                      >
                        {runeId}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-text-secondary">{combo.games}게임</p>
                  <p className="text-sm font-semibold text-accent-success">{formatRate(combo.winRate)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── 장인 명단 (Task 2-4) ── */}
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
            <div className="flex min-h-[120px] items-center justify-center">
              <LoadingSpinner />
            </div>
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
                    <p className="text-xs text-text-tertiary">
                      {entry.riotTier} {entry.riotRank}
                    </p>
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
