"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Star } from "lucide-react";
import { Avatar, Badge } from "@/components/ui";
import { TierBadge } from "./TierBadge";
import { cn, getTierColor } from "@/lib/utils";
import { userApi } from "@/lib/api-client";
import { useCurrentGame } from "@/hooks/useCurrentGame";
import {
  ChampionIcon,
  PositionIcon,
  POSITION_LABELS,
} from "@/app/[game]/tournaments/[id]/lobby/_components/icons";
import type { RoleTier } from "@/lib/role-tier";

/** 경매 페이로드로 이미 받은 매물 정보. 프로필 조회 전에도 이것만으로 카드를 그린다. */
export interface AuctionLotPlayer {
  id: string;
  username: string;
  tier: string;
  rank?: string;
  mainRole?: string;
  subRole?: string;
  avatar?: string;
  champions?: string[];
  roleTiers?: RoleTier[];
}

const ROLE_ORDER = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
const APEX_TIERS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);
/** 라인 한 줄에 보여줄 선호 챔피언 수. 카드 폭(약 420px)에 맞춘 값 */
const CHAMPIONS_PER_ROLE = 5;

/** "DIAMOND" + "II" → "DIAMOND II", 마스터 이상은 LP 로 */
function tierText(
  tier?: string | null,
  rank?: string | null,
  lp?: number | null,
) {
  if (!tier || tier === "UNRANKED") return "언랭";
  if (APEX_TIERS.has(tier)) return lp != null ? `${tier} ${lp}LP` : tier;
  return rank ? `${tier} ${rank}` : tier;
}

/** 지표 한 칸 */
function StatCell({
  label,
  value,
  sub,
  valueClassName,
  large = false,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  valueClassName?: string;
  /** 화면이 충분히 높을 때(900px 이상) 값을 키운다. 왼쪽 빈 공간을 채우는 용도 */
  large?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-md bg-bg-tertiary/60 px-2.5 py-1.5",
        large && "[@media(min-height:900px)]:py-2.5",
      )}
    >
      <p className="text-[10px] font-medium text-text-tertiary">{label}</p>
      <p
        className={cn(
          "truncate text-sm font-bold tabular-nums text-text-primary",
          large && "[@media(min-height:900px)]:text-xl",
          valueClassName,
        )}
      >
        {value}
      </p>
      {sub && (
        <p className="truncate text-[10px] tabular-nums text-text-muted">
          {sub}
        </p>
      )}
    </div>
  );
}

/**
 * 경매 매물 카드의 상단(선수 정보). 좌우 2단 + 타이머.
 *
 * - 왼쪽: 누구인가 — 아바타·이름·클랜·라이엇 ID·현재/최고 티어·주/부라인·내전 승률·평판
 * - 오른쪽: 어떻게 쓰나 — 라인별 [티어 · 선호 챔피언]
 * - 아래(전체 폭): 내전 평균 KDA·피해량·CS·시야·골드
 *
 * "현재 선두" 블록을 없애고 남은 세로 공간을 쓴다. FHD(배율 100%)에서 매물 영역
 * 전체가 약 950×785px 이고 입찰 패널을 뺀 카드 몫이 약 400px 이다
 * (2026-10-01 운영자와 합의한 구성).
 *
 * 라이엇 ID·최고 티어·전적·평판은 경매 페이로드에 없어 호버 카드와 같은
 * hover-profile 을 조회한다. 쿼리 키를 호버 카드와 맞춰 캐시를 같이 쓴다.
 * 조회 전·실패 시에는 페이로드 값만으로 그리고 빈 칸은 "—" 로 둔다.
 */
export function AuctionLotDetails({
  player,
  timeLeft,
  yuchalCount,
}: {
  player: AuctionLotPlayer;
  timeLeft: number;
  yuchalCount: number;
}) {
  const currentGame = useCurrentGame();
  const isLol = currentGame === "LOL";
  const { data: profile } = useQuery({
    queryKey: ["hoverProfile", player.id, currentGame],
    queryFn: () => userApi.getHoverProfile(player.id, currentGame),
    staleTime: 10 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: Boolean(player.id),
  });

  const riot = profile?.riotAccount ?? null;
  const mainRole = riot?.mainRole ?? player.mainRole ?? null;
  const subRole = riot?.subRole ?? player.subRole ?? null;
  const stats = profile?.stats;
  const kda = profile?.kda ?? null;
  const reputation = profile?.reputation;
  const games = stats ? stats.wins + stats.losses : 0;

  // 라인별 [티어 · 선호 챔피언]. 주 → 부 → 나머지 순으로 다섯 라인을 모두 세운다.
  // 비어 있는 라인도 남긴다 — 줄이 빠지면 "그 라인은 안 한다"는 정보가 사라진다
  // (2026-10-01 운영자 요청: 원딜 줄이 안 보였다).
  const roleTiers = riot?.roleTiers ?? player.roleTiers ?? [];
  const prefs = riot?.championPreferences ?? [];
  const roleRows = (() => {
    const ordered = [
      ...(mainRole ? [mainRole] : []),
      ...(subRole && subRole !== mainRole ? [subRole] : []),
      ...ROLE_ORDER.filter((r) => r !== mainRole && r !== subRole),
    ];
    return ordered.map((role) => {
      const roleTier = roleTiers.find((t) => t.role === role) ?? null;
      // 프로필 조회 전에는 페이로드의 주 역할 선호 픽으로 채운다.
      const champions =
        prefs.length > 0
          ? prefs
              .filter((p) => p.role === role)
              .sort((a, b) => a.order - b.order)
              .map((p) => p.championId)
          : role === mainRole
            ? (player.champions ?? [])
            : [];
      return {
        role,
        roleTier,
        champions: champions.slice(0, CHAMPIONS_PER_ROLE),
        kind: role === mainRole ? "main" : role === subRole ? "sub" : "other",
      } as const;
    });
  })();

  const kdaRatio =
    kda && kda.deaths > 0
      ? ((kda.kills + kda.assists) / kda.deaths).toFixed(2)
      : kda
        ? "Perfect"
        : null;

  const winRateCell = (
    <StatCell
      large
      label="내전 승률"
      value={games > 0 ? `${Math.round(stats!.winRate)}%` : "—"}
      sub={games > 0 ? `${stats!.wins}승 ${stats!.losses}패` : "기록 없음"}
      valueClassName={
        games > 0 && stats!.winRate >= 60 ? "text-accent-success" : undefined
      }
    />
  );
  const reputationCell = (
    <StatCell
      large
      label="평판"
      value={
        reputation && reputation.totalRatings > 0 ? (
          <span className="inline-flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-accent-gold text-accent-gold" />
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
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)_auto] gap-x-5 gap-y-3 px-5 py-4">
      {/*
        ── 왼쪽: 누구인가 ──
        좌우 두 단은 그리드 행 높이(둘 중 큰 쪽)에 맞춰 늘어난다. 왼쪽은 위아래로
        벌리고(승률·평판이 바닥에 붙음), 오른쪽은 라인 줄이 나눠 채워 두 단의
        윗선·아랫선을 맞춘다(2026-10-01 운영자 요청).
      */}
      <div className="flex min-w-0 flex-col justify-between gap-2.5">
        <div className="flex items-center gap-3">
          <Avatar
            src={player.avatar}
            alt={player.username}
            fallback={player.username[0]}
            size="lg"
            className="flex-shrink-0 ring-2 ring-accent-primary/60"
          />
          <div className="min-w-0">
            <div className="mb-0.5 flex items-center gap-1.5">
              <Badge variant="primary" className="px-1.5 py-0.5 text-[10px]">
                현재 매물
              </Badge>
              {profile?.clan && (
                <span
                  className="truncate rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] font-semibold text-text-secondary"
                  title={`클랜 ${profile.clan.name}`}
                >
                  {profile.clan.tag ? `[${profile.clan.tag}] ` : ""}
                  {profile.clan.name}
                </span>
              )}
            </div>
            <h2 className="truncate text-2xl font-bold leading-tight text-text-primary [@media(min-height:900px)]:text-[28px]">
              {player.username}
            </h2>
            {riot && (
              <p className="truncate text-xs text-text-tertiary">
                {riot.gameName}
                <span className="text-text-muted">#{riot.tagLine}</span>
              </p>
            )}
          </div>
        </div>

        {isLol && (
          <>
            {/* 현재 티어 + 최고 티어 */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <TierBadge
                tier={riot?.tier ?? player.tier}
                rank={riot?.rank ?? player.rank}
                size="sm"
              />
              {riot &&
                !APEX_TIERS.has(riot.tier) &&
                riot.tier !== "UNRANKED" && (
                  <span className="text-xs tabular-nums text-text-secondary">
                    {riot.lp}LP
                  </span>
                )}
              {riot?.peakTier && (
                <span className="text-xs text-text-tertiary">
                  최고{" "}
                  <span
                    className={cn("font-semibold", getTierColor(riot.peakTier))}
                  >
                    {tierText(riot.peakTier, riot.peakRank, riot.peakLp)}
                  </span>
                </span>
              )}
            </div>

            {/* 주/부라인 */}
            {(mainRole || subRole) && (
              <div className="flex items-center gap-3 text-xs">
                {mainRole && (
                  <span className="flex items-center gap-1 font-semibold text-text-primary">
                    <span className="text-[10px] font-medium text-text-tertiary">
                      주
                    </span>
                    <PositionIcon position={mainRole} className="!h-4 !w-4" />
                    {POSITION_LABELS[mainRole] ?? mainRole}
                  </span>
                )}
                {subRole && subRole !== mainRole && (
                  <span className="flex items-center gap-1 text-text-secondary">
                    <span className="text-[10px] font-medium text-text-tertiary">
                      부
                    </span>
                    <PositionIcon
                      position={subRole}
                      className="!h-4 !w-4"
                      opacity={0.7}
                    />
                    {POSITION_LABELS[subRole] ?? subRole}
                  </span>
                )}
              </div>
            )}
          </>
        )}

        {/* 내전 승률 + 평판. 낮은 화면에선 아래 지표 줄로 옮긴다 */}
        <div className="grid grid-cols-2 gap-2 [@media(max-height:820px)]:hidden">
          {winRateCell}
          {reputationCell}
        </div>
      </div>

      {/* ── 오른쪽: 라인별 티어·선호 챔피언 ── */}
      <div className="flex min-w-0 flex-col">
        {isLol && (
          <div className="flex flex-1 flex-col gap-1">
            {roleRows.length === 0 && (
              <p className="py-2 text-xs text-text-muted">
                라인·선호 픽 정보 없음
              </p>
            )}
            {roleRows.map((row) => (
              <div
                key={row.role}
                className={cn(
                  "flex flex-1 items-center gap-2 rounded-md px-2 py-1",
                  row.kind === "main"
                    ? "bg-accent-primary/10"
                    : "bg-bg-tertiary/40",
                  // 화면이 낮으면(배율 125% 등) 주·부 외 라인은 접는다.
                  row.kind === "other" && "[@media(max-height:820px)]:hidden",
                )}
              >
                <span className="flex w-[64px] flex-shrink-0 items-center gap-1 text-xs font-semibold text-text-secondary">
                  <PositionIcon
                    position={row.role}
                    className="!h-3.5 !w-3.5"
                    opacity={row.kind === "other" ? 0.6 : 1}
                  />
                  {POSITION_LABELS[row.role] ?? row.role}
                </span>
                <span
                  className={cn(
                    "w-[92px] flex-shrink-0 truncate text-[11px] font-bold",
                    row.roleTier
                      ? getTierColor(row.roleTier.tier)
                      : "text-text-muted",
                  )}
                  title="라인별 티어 (본인 입력)"
                >
                  {row.roleTier
                    ? tierText(
                        row.roleTier.tier,
                        row.roleTier.rank,
                        row.roleTier.lp,
                      )
                    : "—"}
                </span>
                <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                  {row.champions.length > 0 ? (
                    row.champions.map((championId, index) => (
                      // 좁은 화면(FHD 배율 125% 등)에선 앞 3개만 — 반쯤 잘린 아이콘을 안 남긴다.
                      <span
                        key={championId}
                        className={cn(index >= 3 && "max-[1700px]:hidden")}
                      >
                        <ChampionIcon championId={championId} size={28} />
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-text-muted">
                      선호 픽 없음
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 타이머 ── */}
      <div className="flex w-[76px] flex-col items-center pt-1">
        <div
          className={cn(
            "text-4xl font-bold tabular-nums leading-none transition-[text-shadow] duration-200",
            timeLeft <= 5
              ? "animate-pulse text-accent-danger [text-shadow:0_0_22px_rgba(239,68,68,0.8),0_0_8px_rgba(239,68,68,0.6)]"
              : "text-text-primary",
          )}
        >
          {timeLeft}
        </div>
        <p className="mt-1.5 text-[11px] text-text-tertiary">남은 시간(초)</p>
        {yuchalCount > 0 && (
          <div className="mt-1.5 flex items-center gap-1 text-xs font-medium text-accent-warning">
            <AlertTriangle className="h-3 w-3" />
            유찰 {yuchalCount}회
          </div>
        )}
      </div>

      {/*
        ── 아래: 내전 평균 지표 (좌우 컬럼 전체 폭) ──
        오른쪽 라인 목록 밑에 두면 좌우 높이가 어긋나고 칸이 좁았다.
        카드 전체 폭에 한 줄로 깔아 좌우 두 단을 받친다(2026-10-01 운영자 요청).
      */}
      <div className="col-span-3">
        <p className="mb-1 text-[10px] font-medium text-text-tertiary">
          {/*
            판수는 KDA 집계 판수(스탯이 수집된 판)가 아니라 사이트에 저장된
            내전 전체 승패로 보여준다(2026-10-01 운영자 요청).
          */}
          {games > 0
            ? `내전 ${stats!.wins}승 ${stats!.losses}패 · 승률 ${Math.round(stats!.winRate)}%`
            : "내전 기록 없음"}
          {/*
            아래 지표는 스탯이 수집된 판만의 평균이다(토너먼트 코드 없는 판은
            기록이 없다). 전체 판수와 다르면 몇 판 기준인지 밝힌다.
          */}
          {kda && kda.games !== games && (
            <span className="text-text-muted">
              {" "}
              · 지표는 {kda.games}판 기준
            </span>
          )}
        </p>
        <div className="grid grid-cols-5 gap-2 [@media(max-height:820px)]:grid-cols-7">
          <StatCell
            label="KDA"
            value={kdaRatio ?? "—"}
            sub={kda ? `${kda.kills}/${kda.deaths}/${kda.assists}` : undefined}
            valueClassName={
              kda &&
              kda.deaths > 0 &&
              (kda.kills + kda.assists) / kda.deaths >= 3
                ? "text-accent-gold"
                : undefined
            }
          />
          <StatCell
            label="피해량"
            value={kda?.damage != null ? kda.damage.toLocaleString() : "—"}
          />
          <StatCell label="CS" value={kda?.cs != null ? kda.cs : "—"} />
          <StatCell
            label="시야"
            value={kda?.vision != null ? kda.vision : "—"}
          />
          <StatCell
            label="골드"
            value={kda?.gold != null ? kda.gold.toLocaleString() : "—"}
          />
          {/* 낮은 화면에서만: 왼쪽에서 옮겨 온 승률·평판 */}
          <div className="hidden [@media(max-height:820px)]:contents">
            {winRateCell}
            {reputationCell}
          </div>
        </div>
      </div>
    </div>
  );
}
