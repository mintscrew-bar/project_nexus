"use client";

import { useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { Crown, Medal, Star, ThumbsUp } from "lucide-react";
import { getChampionKoreanName } from "@nexus/types";
import {
  getChampionIcon,
  getTierImage,
} from "@/components/matches/match-utils";
import {
  commendationTagLabel,
  type CommendationSummary,
} from "@/lib/commendation";
import { cn } from "@/lib/utils";
import { UserName } from "@/components/cosmetics/UserName";
import { UserAvatarDecoration } from "@/components/cosmetics/UserAvatarDecoration";
import { useCosmeticLoadouts } from "@/components/cosmetics/useCosmeticLoadouts";
import {
  findCosmetic,
  useCosmeticCatalog,
} from "@/components/cosmetics/catalog";
import { LiveBanner } from "@/components/cosmetics/live-banner";
import { CosmeticEffect } from "@/components/cosmetics/effects";

/** API(GET /ranking/global) 한 행. 종합·라인별이 같은 모양이다. */
export interface LolRankingEntry {
  id: string;
  userId: string;
  globalRank: number;
  totalGames: number;
  wins: number;
  losses: number;
  winRate: number;
  /** 랭킹 점수(50 시작, 0~100) — 줄 세우는 기준 (api ranking-rating.ts) */
  score: number;
  user: {
    id: string;
    username: string;
    avatar: string | null;
    riotAccounts?: {
      gameName: string;
      tagLine: string;
      tier: string | null;
      rank: string | null;
    }[];
  };
  stats: {
    statGames: number;
    avgKills: number;
    avgDeaths: number;
    avgAssists: number;
    kda: number | null;
    /** Riot 기록으로 자동으로 정한 MVP 횟수 */
    mvpCount: number;
    /** 평판 — 경기 뒤 함께 뛴 사람들에게 받은 칭찬 */
    commendations: CommendationSummary;
    topChampions: string[];
  } | null;
}

/**
 * 표 열 배치 — 머리줄과 행이 같은 격자를 써서 열이 어긋나지 않는다.
 * 좁은 화면: 순위·플레이어·승률·점수 / sm: + KDA·MVP·칭찬 / lg: + 주력 챔피언.
 * 열 개수는 아래 hidden/block 규칙과 짝을 맞춘다.
 */
export const RANK_GRID =
  "grid items-center gap-3 grid-cols-[32px_minmax(0,1fr)_76px_52px] sm:grid-cols-[36px_minmax(0,1fr)_88px_52px_64px_112px_60px] lg:grid-cols-[40px_minmax(0,1fr)_92px_96px_56px_72px_136px_64px]";

/** 승률 색 — 60% 이상 초록, 50% 이상 포인트, 그 아래 빨강 */
function winRateColor(winRate: number) {
  if (winRate >= 60) return "text-accent-success";
  if (winRate >= 50) return "text-accent-primary";
  return "text-accent-danger";
}
function winRateFill(winRate: number) {
  if (winRate >= 60) return "bg-accent-success";
  if (winRate >= 50) return "bg-accent-primary";
  return "bg-accent-danger";
}

function Avatar({ entry, size }: { entry: LolRankingEntry; size: number }) {
  return (
    <div
      className="flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg-tertiary"
      style={{ width: size, height: size }}
    >
      {entry.user.avatar ? (
        <Image
          src={entry.user.avatar}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-sm font-bold text-text-tertiary">
          {entry.user.username.charAt(0)}
        </span>
      )}
    </div>
  );
}

/** Riot ID · 티어 한 줄 */
function RiotLine({
  entry,
  className,
}: {
  entry: LolRankingEntry;
  className?: string;
}) {
  const riot = entry.user.riotAccounts?.[0];
  if (!riot) return null;
  const tierImage = riot.tier ? getTierImage(riot.tier) : null;
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 text-xs text-text-tertiary",
        className,
      )}
    >
      {/* 좁은 화면은 칸이 좁아 Riot ID 가 잘려 보여서 티어만 */}
      <span className="hidden truncate sm:inline">
        {riot.gameName}#{riot.tagLine}
      </span>
      {riot.tier && (
        <span className="flex flex-shrink-0 items-center gap-1">
          {tierImage && (
            <Image
              src={tierImage}
              alt=""
              width={16}
              height={16}
              className="h-4 w-4"
            />
          )}
          {riot.tier} {riot.rank}
        </span>
      )}
    </div>
  );
}

function Champions({ list, size = 24 }: { list: string[]; size?: number }) {
  return (
    <div className="flex items-center gap-1">
      {list.map((champion) => (
        <Image
          key={champion}
          src={getChampionIcon(champion)}
          alt={getChampionKoreanName(champion)}
          title={getChampionKoreanName(champion)}
          width={size}
          height={size}
          className="rounded-md"
          style={{ width: size, height: size }}
        />
      ))}
    </div>
  );
}

/** 640px 미만인가 — 시상대 아바타 크기를 고른다(장식 상자 크기가 px 라 CSS 로만은 못 바꾼다) */
function useIsNarrow() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(max-width: 639px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(max-width: 639px)").matches,
    () => false,
  );
}

const DASH = <span className="text-text-muted">–</span>;

/**
 * 순위표 한 줄 (4위부터, 검색 중이면 전부).
 * 구분은 왼쪽 색 막대 대신 옅은 바탕으로만 — 내 줄은 포인트색 바탕.
 */
export function LolRankingRow({
  entry,
  href,
  mine = false,
}: {
  entry: LolRankingEntry;
  href: string;
  /** 로그인한 내 줄 — 옅은 포인트색 바탕 */
  mine?: boolean;
}) {
  const stats = entry.stats;
  const hasKda = Boolean(stats && stats.statGames > 0 && stats.kda != null);
  const top3 = entry.globalRank <= 3;

  return (
    <Link
      id={`rank-row-${entry.userId}`}
      href={href}
      className={cn(
        RANK_GRID,
        "scroll-mt-24 rounded-lg px-3 py-2.5 transition-colors sm:px-4",
        mine
          ? "bg-accent-primary/[0.12] hover:bg-accent-primary/[0.18]"
          : "bg-bg-secondary hover:bg-bg-tertiary/70",
      )}
    >
      {/* 순위 — 검색 중 보이는 1~3위만 색을 준다 */}
      <span
        className={cn(
          "text-center text-sm font-bold tabular-nums",
          entry.globalRank === 1
            ? "text-accent-gold"
            : entry.globalRank === 2
              ? "text-slate-300"
              : entry.globalRank === 3
                ? "text-orange-400"
                : "text-text-secondary",
        )}
      >
        {top3 ? (
          entry.globalRank === 1 ? (
            <Crown className="mx-auto h-4 w-4" aria-label="1위" />
          ) : (
            <Medal
              className="mx-auto h-4 w-4"
              aria-label={`${entry.globalRank}위`}
            />
          )
        ) : (
          entry.globalRank
        )}
      </span>

      {/* 플레이어 */}
      <div className="flex min-w-0 items-center gap-3">
        <Avatar entry={entry} size={36} />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-text-primary">
            <UserName userId={entry.userId}>{entry.user.username}</UserName>
            {mine && (
              <span className="rounded bg-accent-primary/20 px-1.5 py-px text-[10px] font-bold text-accent-primary">
                나
              </span>
            )}
          </p>
          <RiotLine entry={entry} />
        </div>
      </div>

      {/* 주력 챔피언 (lg) */}
      <div className="hidden lg:block">
        {stats?.topChampions.length ? (
          <Champions list={stats.topChampions} />
        ) : (
          DASH
        )}
      </div>

      {/* KDA (sm) */}
      <div className="hidden text-center sm:block">
        {hasKda && stats ? (
          <>
            <p className="text-sm font-bold tabular-nums text-text-primary">
              {stats.kda!.toFixed(2)}
            </p>
            <p className="text-[11px] tabular-nums text-text-tertiary">
              {stats.avgKills} / {stats.avgDeaths} / {stats.avgAssists}
            </p>
          </>
        ) : (
          DASH
        )}
      </div>

      {/* MVP (sm) */}
      <div className="hidden text-center sm:block">
        {stats?.mvpCount ? (
          <span className="inline-flex items-center gap-0.5 text-sm font-bold tabular-nums text-accent-gold">
            <Star className="h-3.5 w-3.5" />
            {stats.mvpCount}
          </span>
        ) : (
          DASH
        )}
      </div>

      {/* 칭찬 (sm) */}
      <div className="hidden text-center sm:block">
        {stats?.commendations.total ? (
          <>
            <p className="inline-flex items-center gap-1 text-sm font-bold tabular-nums text-text-primary">
              <ThumbsUp className="h-3.5 w-3.5 text-accent-primary" />
              {stats.commendations.total}
            </p>
            {stats.commendations.topTags[0] && (
              <p className="truncate text-[10px] text-text-tertiary">
                {commendationTagLabel(stats.commendations.topTags[0].tag)}
              </p>
            )}
          </>
        ) : (
          DASH
        )}
      </div>

      {/* 승률 — 넓은 화면은 막대까지 */}
      <div className="text-right sm:text-left">
        <div className="flex items-baseline justify-end gap-1.5 sm:justify-start">
          <span
            className={cn(
              "text-sm font-bold tabular-nums",
              winRateColor(entry.winRate),
            )}
          >
            {entry.winRate.toFixed(1)}%
          </span>
          <span className="hidden text-[11px] tabular-nums text-text-tertiary sm:inline">
            {entry.wins}승 {entry.losses}패
          </span>
        </div>
        <div className="mt-1 hidden h-1 overflow-hidden rounded-full bg-bg-tertiary sm:block">
          <div
            className={cn("h-full rounded-full", winRateFill(entry.winRate))}
            style={{ width: `${Math.min(100, entry.winRate)}%` }}
          />
        </div>
        <p className="text-[11px] tabular-nums text-text-tertiary sm:hidden">
          {entry.wins}승 {entry.losses}패
        </p>
      </div>

      {/* 점수 — 줄 세우는 기준 */}
      <p className="text-right text-base font-black tabular-nums text-text-primary">
        {entry.score.toFixed(1)}
      </p>
    </Link>
  );
}

/** 시상대 색 — 금·은·동. 왼쪽 막대 없이 옅은 바탕과 둘레 전체 테두리로만 */
const PODIUM_STYLE: Record<
  1 | 2 | 3,
  { card: string; text: string; chip: string; label: string }
> = {
  1: {
    card: "bg-accent-gold/[0.09] border-accent-gold/30",
    text: "text-accent-gold",
    chip: "bg-accent-gold/20 text-accent-gold",
    label: "1위",
  },
  2: {
    card: "bg-slate-300/[0.06] border-slate-300/20",
    text: "text-slate-300",
    chip: "bg-slate-300/15 text-slate-300",
    label: "2위",
  },
  3: {
    card: "bg-orange-400/[0.06] border-orange-400/20",
    text: "text-orange-400",
    chip: "bg-orange-400/15 text-orange-400",
    label: "3위",
  },
};

/**
 * 시상대 카드 한 장 — 1위는 크게(아바타·점수).
 * 상점에서 산 카드 장식을 장착했으면 카드 바탕에 깔고, 닉네임 글꼴·아바타 장식도 입힌다.
 */
function PodiumCard({
  entry,
  href,
  mine,
}: {
  entry: LolRankingEntry;
  href: string;
  mine: boolean;
}) {
  const rank = entry.globalRank as 1 | 2 | 3;
  const s = PODIUM_STYLE[rank];
  const first = rank === 1;
  const stats = entry.stats;
  // 좁은 화면은 작게 — 세 칸이 한 줄에 들어가게
  const isNarrow = useIsNarrow();
  const avatar = isNarrow ? (first ? 52 : 42) : first ? 76 : 60;
  // 장착한 카드 장식 — 영상 배경(cardVideo)이나 움직이는 효과(effect)를 카드 바탕에 깐다
  useCosmeticCatalog();
  const loadouts = useCosmeticLoadouts([entry.userId]);
  const frame = findCosmetic(loadouts[entry.userId]?.CARD_FRAME);
  const decorated = Boolean(frame?.cardVideo || frame?.effect);
  return (
    <Link
      id={`rank-row-${entry.userId}`}
      href={href}
      className={cn(
        "group relative flex scroll-mt-24 flex-col items-center overflow-hidden rounded-xl border px-2 text-center transition-colors hover:brightness-110 sm:px-4",
        s.card,
        first
          ? "pb-4 pt-4 sm:pb-5 sm:pt-7"
          : "mt-4 pb-3 pt-3 sm:mt-6 sm:pb-4 sm:pt-5",
      )}
    >
      {decorated && frame && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {frame.cardVideo && <LiveBanner code={frame.cardVideo} />}
          {frame.effect && (
            <CosmeticEffect code={frame.effect} px={isNarrow ? 1.5 : 2.5} />
          )}
          {/* 글자가 읽히게 아래쪽을 어둡게 — 「장식 숨기기」 설정이면 같이 빠진다 */}
          <div className="cfx-deco absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/20" />
        </div>
      )}
      <div className="relative z-10 flex w-full flex-col items-center">
        <span
          className={cn(
            "mb-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black sm:mb-3 sm:px-2.5 sm:text-xs",
            s.chip,
          )}
        >
          {first ? (
            <Crown className="h-3.5 w-3.5" />
          ) : (
            <Medal className="h-3.5 w-3.5" />
          )}
          {s.label}
          {mine && <span className="ml-0.5 opacity-80">· 나</span>}
        </span>

        {/* 아바타 — 장착한 아바타 장식까지 */}
        <UserAvatarDecoration userId={entry.userId} size={avatar}>
          <Avatar entry={entry} size={avatar} />
        </UserAvatarDecoration>

        <p
          className={cn(
            "mt-2 max-w-full truncate font-bold text-text-primary sm:mt-3",
            first ? "text-sm sm:text-lg" : "text-sm sm:text-base",
          )}
        >
          <UserName userId={entry.userId}>{entry.user.username}</UserName>
        </p>
        <RiotLine
          entry={entry}
          className="hidden max-w-full justify-center sm:flex"
        />

        <p
          className={cn(
            "mt-2 font-black leading-none tabular-nums sm:mt-3",
            s.text,
            first ? "text-2xl sm:text-4xl" : "text-xl sm:text-3xl",
          )}
        >
          {entry.score.toFixed(1)}
        </p>
        <p className="mt-1 text-[11px] text-text-tertiary">점수</p>

        {/* 좁은 화면은 승률만 */}
        <p
          className={cn(
            "mt-1.5 text-[11px] font-bold tabular-nums sm:hidden",
            winRateColor(entry.winRate),
          )}
        >
          {entry.winRate.toFixed(1)}%
        </p>
        <div className="mt-3 hidden flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs sm:flex">
          <span
            className={cn(
              "font-bold tabular-nums",
              winRateColor(entry.winRate),
            )}
          >
            {entry.winRate.toFixed(1)}%
          </span>
          <span className="tabular-nums text-text-tertiary">
            {entry.wins}승 {entry.losses}패
          </span>
          {stats?.kda != null && stats.statGames > 0 && (
            <span className="tabular-nums text-text-secondary">
              KDA {stats.kda.toFixed(2)}
            </span>
          )}
          {stats?.mvpCount ? (
            <span className="inline-flex items-center gap-0.5 font-semibold text-accent-gold">
              <Star className="h-3 w-3" />
              {stats.mvpCount}
            </span>
          ) : null}
          {stats?.commendations.total ? (
            <span className="inline-flex items-center gap-0.5 text-text-secondary">
              <ThumbsUp className="h-3 w-3 text-accent-primary" />
              {stats.commendations.total}
            </span>
          ) : null}
        </div>
        {stats?.topChampions.length ? (
          <div className="mt-3 hidden sm:block">
            <Champions list={stats.topChampions} size={first ? 28 : 24} />
          </div>
        ) : null}
      </div>
    </Link>
  );
}

/**
 * 1~3위 시상대 — 2·1·3 순서로 가운데 1위를 높게. 좁은 화면도 가로 세 칸으로 두고
 * 카드 안의 부가 정보(Riot ID·전적 칩·챔피언)만 숨긴다.
 */
export function LolPodium({
  entries,
  hrefFor,
  myUserId,
}: {
  entries: LolRankingEntry[];
  hrefFor: (entry: LolRankingEntry) => string;
  myUserId?: string;
}) {
  const byRank = (r: number) => entries.find((e) => e.globalRank === r);
  const order = [2, 1, 3]
    .map(byRank)
    .filter((e): e is LolRankingEntry => Boolean(e));
  return (
    <div className="grid grid-cols-3 items-start gap-2 sm:gap-3">
      {order.map((entry) => (
        <div key={entry.id}>
          <PodiumCard
            entry={entry}
            href={hrefFor(entry)}
            mine={entry.userId === myUserId}
          />
        </div>
      ))}
    </div>
  );
}
