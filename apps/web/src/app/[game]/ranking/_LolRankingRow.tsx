"use client";

import Image from "next/image";
import Link from "next/link";
import { Crown, Medal, Star } from "lucide-react";
import { getChampionKoreanName } from "@nexus/types";
import {
  getChampionIcon,
  getTierImage,
} from "@/components/matches/match-utils";

/** API(GET /ranking/global) 한 행. 종합·라인별이 같은 모양이다. */
export interface LolRankingEntry {
  id: string;
  userId: string;
  globalRank: number;
  totalGames: number;
  wins: number;
  losses: number;
  winRate: number;
  /** 보정 승률 점수(0~100) — 줄 세우는 기준 */
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
    /** 함께 뛴 사람들의 평가 평균(1~5). 평가가 없으면 null */
    reputation: { average: number; count: number } | null;
    topChampions: string[];
  } | null;
}

/**
 * 1~5등 강조. 1·2·3 은 금·은·동, 4·5 는 포인트색으로 왼쪽 띠와 옅은 바탕을 준다.
 * 색은 테마 토큰(accent-gold 등)과 고정 은·동색을 섞는다 — 은·동 토큰이 없다.
 */
const PODIUM: Record<
  number,
  { row: string; badge: string; text: string; label: string }
> = {
  1: {
    row: "border-l-accent-gold bg-accent-gold/[0.08]",
    badge: "bg-accent-gold/20 text-accent-gold",
    text: "text-accent-gold",
    label: "1위",
  },
  2: {
    row: "border-l-slate-300 bg-slate-300/[0.06]",
    badge: "bg-slate-300/20 text-slate-300",
    text: "text-slate-300",
    label: "2위",
  },
  3: {
    row: "border-l-orange-400 bg-orange-400/[0.06]",
    badge: "bg-orange-400/20 text-orange-400",
    text: "text-orange-400",
    label: "3위",
  },
  4: {
    row: "border-l-accent-primary/70 bg-accent-primary/[0.04]",
    badge: "bg-accent-primary/15 text-accent-primary",
    text: "text-accent-primary",
    label: "4위",
  },
  5: {
    row: "border-l-accent-primary/70 bg-accent-primary/[0.04]",
    badge: "bg-accent-primary/15 text-accent-primary",
    text: "text-accent-primary",
    label: "5위",
  },
};

function RankBadge({ rank }: { rank: number }) {
  const podium = PODIUM[rank];
  if (!podium) {
    return (
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center">
        <span className="text-sm font-medium text-text-secondary">{rank}</span>
      </div>
    );
  }
  return (
    <div
      className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${podium.badge}`}
      aria-label={podium.label}
    >
      {rank === 1 ? (
        <Crown className="h-5 w-5" />
      ) : rank <= 3 ? (
        <Medal className="h-5 w-5" />
      ) : (
        <span className="text-sm font-black">{rank}</span>
      )}
    </div>
  );
}

/** 승률 색 — 60% 이상 초록, 50% 이상 포인트, 그 아래 빨강 */
function winRateColor(winRate: number) {
  if (winRate >= 60) return "text-accent-success";
  if (winRate >= 50) return "text-accent-primary";
  return "text-accent-danger";
}

export function LolRankingRow({
  entry,
  href,
}: {
  entry: LolRankingEntry;
  href: string;
}) {
  const riotAccount = entry.user.riotAccounts?.[0];
  const podium = PODIUM[entry.globalRank];
  const stats = entry.stats;
  const hasStats = Boolean(stats && stats.statGames > 0);
  const tierImage = riotAccount?.tier ? getTierImage(riotAccount.tier) : null;

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-xl border border-bg-tertiary border-l-4 p-3 transition-colors hover:bg-bg-tertiary/50 sm:gap-4 sm:p-4 ${
        podium ? podium.row : "border-l-transparent bg-bg-secondary"
      }`}
    >
      <RankBadge rank={entry.globalRank} />

      {/* 아바타 — 1~5등은 한 단계 크게 */}
      <div
        className={`flex flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-bg-tertiary ${
          podium ? "h-12 w-12" : "h-10 w-10"
        }`}
      >
        {entry.user.avatar ? (
          <Image
            src={entry.user.avatar}
            alt={entry.user.username}
            width={48}
            height={48}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-sm font-bold text-text-tertiary">
            {entry.user.username.charAt(0)}
          </span>
        )}
      </div>

      {/* 이름 · Riot ID · 티어 */}
      <div className="min-w-0 flex-grow">
        <p
          className={`truncate font-semibold text-text-primary ${
            podium ? "text-base" : "text-sm"
          }`}
        >
          {entry.user.username}
        </p>
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          {riotAccount && (
            <span className="truncate">
              {riotAccount.gameName}#{riotAccount.tagLine}
            </span>
          )}
          {riotAccount?.tier && (
            <span className="flex flex-shrink-0 items-center gap-1">
              {tierImage && (
                <Image
                  src={tierImage}
                  alt={riotAccount.tier}
                  width={16}
                  height={16}
                  className="h-4 w-4"
                />
              )}
              {riotAccount.tier} {riotAccount.rank}
            </span>
          )}
        </div>
      </div>

      {/* 주력 챔피언 — 넓은 화면에서만 */}
      <div className="hidden w-[84px] flex-shrink-0 items-center gap-1 md:flex">
        {stats?.topChampions.map((champion) => (
          <Image
            key={champion}
            src={getChampionIcon(champion)}
            alt={getChampionKoreanName(champion)}
            title={getChampionKoreanName(champion)}
            width={24}
            height={24}
            className="h-6 w-6 rounded-md"
          />
        ))}
      </div>

      {/* KDA — 수집된 경기가 없으면 비운다 */}
      <div className="hidden w-[92px] flex-shrink-0 text-center sm:block">
        {hasStats && stats ? (
          <>
            <p className="text-sm font-bold text-text-primary">
              {stats.kda?.toFixed(2)}{" "}
              <span className="text-[10px] font-medium text-text-tertiary">
                KDA
              </span>
            </p>
            <p className="text-[11px] text-text-tertiary">
              {stats.avgKills} / {stats.avgDeaths} / {stats.avgAssists}
            </p>
          </>
        ) : (
          <p className="text-xs text-text-muted">KDA 기록 없음</p>
        )}
      </div>

      {/* 평판 — 경매 매물 카드와 같은 별점 평균 */}
      <div className="hidden w-[60px] flex-shrink-0 text-center sm:block">
        {stats?.reputation ? (
          <>
            <p className="flex items-center justify-center gap-0.5 text-sm font-bold text-text-primary">
              <Star className="h-3.5 w-3.5 fill-accent-gold text-accent-gold" />
              {stats.reputation.average.toFixed(1)}
            </p>
            <p className="text-[10px] text-text-tertiary">
              {stats.reputation.count}명 평가
            </p>
          </>
        ) : (
          <p className="text-xs text-text-muted">평가 없음</p>
        )}
      </div>

      {/* 승률 · 승패 */}
      <div className="w-[76px] flex-shrink-0 text-right">
        <p className={`text-sm font-bold ${winRateColor(entry.winRate)}`}>
          {entry.winRate.toFixed(1)}%
        </p>
        <p className="text-[11px] text-text-tertiary">
          {entry.wins}승 {entry.losses}패
        </p>
      </div>

      {/* 랭킹 점수 — 줄 세우는 기준이라 가장 크게 */}
      <div className="w-[64px] flex-shrink-0 text-right">
        <p
          className={`text-lg font-black leading-none ${
            podium ? podium.text : "text-text-primary"
          }`}
        >
          {entry.score.toFixed(1)}
        </p>
        <p className="mt-1 text-[10px] text-text-tertiary">점수</p>
      </div>
    </Link>
  );
}
