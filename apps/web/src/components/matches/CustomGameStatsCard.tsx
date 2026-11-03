"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3, Star } from "lucide-react";
import { userApi } from "@/lib/api-client";
import { Skeleton } from "@/components/ui";
import {
  RoleRecordList,
  type RoleRecord,
} from "@/components/domain/RoleRecordList";
import { cn } from "@/lib/utils";

/**
 * 넥서스 유저 전적 화면의 "내전 지표" 카드.
 *
 * 경매 매물 카드(AuctionLotDetails)가 보여주는 여덟 칸과 같은 값·같은 이름이다.
 * 그 아래에 라인별 승패를 붙인다 — 따로 있던 "내전 라인별 전적" 칸을 합쳤다(2026-11-03).
 * 2026-11-03 유저 전적 화면에서 Riot 게임 전적을 빼고 그 자리에 넣었다.
 * 데이터도 같은 호버 프로필 조회를 쓰므로(같은 queryKey) 경매·호버 카드와 캐시를 나눠 쓴다.
 * 경매 카드는 화면 높이별 배치가 촘촘하게 맞춰져 있어 손대지 않고, 여기서는 칸만 따로 그린다.
 */
function StatCell({
  label,
  value,
  sub,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-bg-tertiary/60 px-3 py-2.5">
      <p className="text-xs font-medium text-text-tertiary">{label}</p>
      <p
        className={cn(
          "truncate text-lg font-bold tabular-nums text-text-primary",
          valueClassName,
        )}
      >
        {value}
      </p>
      {sub != null && (
        <p className="truncate text-[11px] text-text-tertiary">{sub}</p>
      )}
    </div>
  );
}

/** 랭킹 API(/ranking/user/:id) 가 주는 내전 전체 승패·순위·라인별 전적 */
interface CustomGameRanking {
  totalGames: number;
  wins: number;
  losses: number;
  globalRank: number | null;
  byRole?: RoleRecord[] | null;
}

export function CustomGameStatsCard({
  userId,
  ranking,
}: {
  userId: string;
  ranking?: CustomGameRanking | null;
}) {
  const { data: profile, isLoading } = useQuery({
    queryKey: ["hoverProfile", userId, "LOL"],
    queryFn: () => userApi.getHoverProfile(userId, "LOL"),
    staleTime: 10 * 60 * 1000,
    enabled: Boolean(userId),
  });

  const stats = profile?.stats;
  const kda = profile?.kda ?? null;
  const reputation = profile?.reputation;
  const games = stats ? stats.wins + stats.losses : 0;
  const kdaRatio =
    kda && kda.deaths > 0
      ? ((kda.kills + kda.assists) / kda.deaths).toFixed(2)
      : kda
        ? "Perfect"
        : null;

  return (
    <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-accent-primary" />
          내전 지표
        </h2>
        {ranking && ranking.totalGames > 0 && (
          <p className="text-sm text-text-tertiary">
            {ranking.totalGames}전 {ranking.wins}승 {ranking.losses}패
            {ranking.globalRank ? ` · 랭킹 #${ranking.globalRank}` : ""}
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-[72px] rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {/* 승률·평판은 평균이 아니라 그대로, 나머지는 판당 평균이라 "평균"을 붙인다 */}
            <StatCell
              label="내전 승률"
              value={games > 0 ? `${Math.round(stats!.winRate)}%` : "—"}
              sub={
                games > 0 ? `${stats!.wins}승 ${stats!.losses}패` : "기록 없음"
              }
              valueClassName={
                games > 0 && stats!.winRate >= 60
                  ? "text-accent-success"
                  : undefined
              }
            />
            <StatCell
              label="평판"
              value={
                reputation && reputation.totalRatings > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-4 w-4 fill-accent-gold text-accent-gold" />
                    {reputation.overallAverage.toFixed(1)}
                  </span>
                ) : (
                  "—"
                )
              }
              sub={
                reputation && reputation.totalRatings > 0
                  ? `${reputation.totalRatings}명 평가`
                  : "평가 없음"
              }
            />
            <StatCell
              label="평균 KDA"
              value={kdaRatio ?? "—"}
              sub={
                kda ? `${kda.kills}/${kda.deaths}/${kda.assists}` : undefined
              }
              valueClassName={
                kda &&
                kda.deaths > 0 &&
                (kda.kills + kda.assists) / kda.deaths >= 3
                  ? "text-accent-gold"
                  : undefined
              }
            />
            <StatCell
              label="평균 킬관여"
              value={
                kda?.killParticipation != null
                  ? `${kda.killParticipation}%`
                  : "—"
              }
            />
            <StatCell
              label="평균 피해량"
              value={kda?.damage != null ? kda.damage.toLocaleString() : "—"}
            />
            <StatCell label="평균 CS" value={kda?.cs != null ? kda.cs : "—"} />
            <StatCell
              label="평균 시야"
              value={kda?.vision != null ? kda.vision : "—"}
            />
            <StatCell
              label="평균 골드"
              value={kda?.gold != null ? kda.gold.toLocaleString() : "—"}
            />
          </div>
          {/* 평균 지표는 Riot 데이터가 붙은 판만 센다 — 승패 판수와 다를 수 있다 */}
          {kda?.games != null && kda.games > 0 && (
            <p className="mt-3 text-xs text-text-tertiary">
              평균 지표는 상세 기록이 수집된 내전 {kda.games}판 기준입니다.
            </p>
          )}

          {/* 라인별 승패 — 역할 선택을 거친 판만 집계된다(RoleRecordList 주석 참고) */}
          {ranking?.byRole?.some((record) => record.totalGames > 0) && (
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-semibold text-text-secondary">
                라인별 전적
              </h3>
              <RoleRecordList records={ranking.byRole} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
