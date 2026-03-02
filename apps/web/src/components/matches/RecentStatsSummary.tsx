"use client";

import { useQuery } from "@tanstack/react-query";
import { statsApi } from "@/lib/api-client";
import { getChampionIcon, formatKDA } from "./match-utils";
import type { NexusMatchHistory } from "./match-utils";
import WinLossTrendChart from "./WinLossTrendChart";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { useState, useMemo } from "react";

interface RecentStatsSummaryProps {
  gameName?: string;
  tagLine?: string;
  puuid?: string;
  nexusMatches?: NexusMatchHistory[];
}

interface SummaryStats {
  wins: number;
  losses: number;
  winRate: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgKDA: string;
  avgCsPerMin?: number;
  mostChampions: {
    championName: string;
    games: number;
    wins: number;
    winRate: number;
    playRate: number;
  }[];
  games: { win: boolean; championName: string; kills: number; deaths: number; assists: number; damage: number }[];
}

function computeRiotStats(matches: any[], puuid: string): SummaryStats {
  const games: SummaryStats["games"] = [];
  const champMap = new Map<string, { games: number; wins: number }>();
  let totalKills = 0, totalDeaths = 0, totalAssists = 0, totalCs = 0, totalDuration = 0;

  for (const m of matches) {
    if (!m?.info?.participants) continue;
    const p = m.info.participants.find((pp: any) => pp.puuid === puuid);
    if (!p) continue;
    games.push({ win: p.win, championName: p.championName, kills: p.kills, deaths: p.deaths, assists: p.assists, damage: p.totalDamageDealtToChampions || 0 });
    totalKills += p.kills;
    totalDeaths += p.deaths;
    totalAssists += p.assists;
    totalCs += (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0);
    totalDuration += m.info.gameDuration || 0;

    const prev = champMap.get(p.championName) || { games: 0, wins: 0 };
    prev.games++;
    if (p.win) prev.wins++;
    champMap.set(p.championName, prev);
  }

  const total = games.length;
  const wins = games.filter(g => g.win).length;
  const losses = total - wins;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  const mostChampions = Array.from(champMap.entries())
    .map(([name, s]) => ({
      championName: name,
      games: s.games,
      wins: s.wins,
      winRate: Math.round((s.wins / s.games) * 100),
      playRate: total > 0 ? Math.round((s.games / total) * 100) : 0,
    }))
    .sort((a, b) => b.games - a.games)
    .slice(0, 5);

  return {
    wins, losses, winRate,
    avgKills: total > 0 ? totalKills / total : 0,
    avgDeaths: total > 0 ? totalDeaths / total : 0,
    avgAssists: total > 0 ? totalAssists / total : 0,
    avgKDA: total > 0 ? formatKDA(totalKills, totalDeaths, totalAssists) : "0.00",
    avgCsPerMin: totalDuration > 0 ? totalCs / (totalDuration / 60) : 0,
    mostChampions,
    games,
  };
}

function computeNexusStats(matches: NexusMatchHistory[]): SummaryStats {
  const games: SummaryStats["games"] = [];
  const champMap = new Map<string, { games: number; wins: number }>();
  let totalKills = 0, totalDeaths = 0, totalAssists = 0;

  for (const m of matches) {
    const p = m.participant;
    games.push({ win: p.win, championName: p.championName, kills: p.kills, deaths: p.deaths, assists: p.assists, damage: 0 });
    totalKills += p.kills;
    totalDeaths += p.deaths;
    totalAssists += p.assists;

    const prev = champMap.get(p.championName) || { games: 0, wins: 0 };
    prev.games++;
    if (p.win) prev.wins++;
    champMap.set(p.championName, prev);
  }

  const total = games.length;
  const wins = games.filter(g => g.win).length;

  const mostChampions = Array.from(champMap.entries())
    .map(([name, s]) => ({
      championName: name,
      games: s.games,
      wins: s.wins,
      winRate: Math.round((s.wins / s.games) * 100),
      playRate: total > 0 ? Math.round((s.games / total) * 100) : 0,
    }))
    .sort((a, b) => b.games - a.games)
    .slice(0, 5);

  return {
    wins, losses: total - wins,
    winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
    avgKills: total > 0 ? totalKills / total : 0,
    avgDeaths: total > 0 ? totalDeaths / total : 0,
    avgAssists: total > 0 ? totalAssists / total : 0,
    avgKDA: total > 0 ? formatKDA(totalKills, totalDeaths, totalAssists) : "0.00",
    mostChampions,
    games,
  };
}

function WinRateDonut({ winRate, size = 64 }: { winRate: number; size?: number }) {
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  const winArc = (winRate / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="6" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={winRate >= 60 ? "#22c55e" : winRate >= 50 ? "#6366f1" : "#ef4444"}
          strokeWidth="6"
          strokeDasharray={`${winArc} ${circumference - winArc}`}
          strokeDashoffset={circumference / 4}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold text-text-primary">{winRate}%</span>
      </div>
    </div>
  );
}

function KDATrendChart({ games }: { games: SummaryStats["games"] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const kdaValues = games.map(g => {
    const d = Math.max(g.deaths, 1);
    return (g.kills + g.assists) / d;
  });

  const maxKda = Math.max(...kdaValues, 1);
  const W = 300, H = 80;
  const padL = 28, padR = 8, padT = 8, padB = 16;
  const cW = W - padL - padR, cH = H - padT - padB;

  const toX = (i: number) => padL + (games.length > 1 ? (i / (games.length - 1)) * cW : cW / 2);
  const toY = (v: number) => padT + cH - (v / maxKda) * cH;

  const pathD = kdaValues.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
  const areaD = `${pathD} L${toX(games.length - 1).toFixed(1)},${(padT + cH).toFixed(1)} L${toX(0).toFixed(1)},${(padT + cH).toFixed(1)} Z`;

  return (
    <div className="relative bg-bg-tertiary/30 rounded-lg p-2">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible cursor-crosshair"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const svgX = ((e.clientX - rect.left) / rect.width) * W;
          const idx = Math.round(((svgX - padL) / cW) * (games.length - 1));
          setHoverIdx(Math.max(0, Math.min(games.length - 1, idx)));
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Y axis labels */}
        {[0, maxKda / 2, maxKda].map((v, i) => (
          <text key={i} x={padL - 4} y={toY(v) + 3} textAnchor="end" fontSize="7" fill="currentColor" fillOpacity="0.4">
            {v.toFixed(1)}
          </text>
        ))}
        {/* Grid line */}
        <line x1={padL} x2={padL + cW} y1={toY(maxKda / 2)} y2={toY(maxKda / 2)} stroke="currentColor" strokeOpacity="0.06" strokeWidth="1" />
        {/* Area + Line */}
        <path d={areaD} fill="#6366f1" fillOpacity="0.08" />
        <path d={pathD} fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinejoin="round" />
        {/* Dots */}
        {kdaValues.map((v, i) => (
          <circle key={i} cx={toX(i)} cy={toY(v)} r={hoverIdx === i ? 3.5 : 1.5}
            fill="#6366f1" fillOpacity={hoverIdx === i ? 1 : 0.5}
            stroke={hoverIdx === i ? 'white' : 'none'} strokeWidth="1" />
        ))}
        {/* Hover line */}
        {hoverIdx !== null && (
          <line x1={toX(hoverIdx)} x2={toX(hoverIdx)} y1={padT} y2={padT + cH}
            stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" strokeDasharray="2,2" />
        )}
      </svg>
      {hoverIdx !== null && (
        <div className="absolute top-0 z-20 pointer-events-none"
          style={{ left: `${Math.max(10, Math.min(85, ((toX(hoverIdx)) / W) * 100))}%`, transform: 'translateX(-50%)' }}
        >
          <div className="bg-bg-secondary/95 backdrop-blur-sm border border-bg-elevated rounded-lg shadow-xl px-2.5 py-1.5 text-[10px]">
            <div className="text-text-tertiary">{games[hoverIdx].championName}</div>
            <div className="font-bold text-accent-primary">KDA {kdaValues[hoverIdx].toFixed(2)}</div>
            <div className="text-text-secondary">{games[hoverIdx].kills}/{games[hoverIdx].deaths}/{games[hoverIdx].assists}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function DamageTrendChart({ games }: { games: SummaryStats["games"] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const damages = games.map(g => g.damage);
  const maxDmg = Math.max(...damages, 1);
  const W = 300, H = 80;
  const padL = 28, padR = 8, padT = 4, padB = 16;
  const cW = W - padL - padR, cH = H - padT - padB;
  const barGap = 2;
  const barW = Math.max(4, (cW / games.length) - barGap);

  return (
    <div className="relative bg-bg-tertiary/30 rounded-lg p-2">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible cursor-crosshair"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const svgX = ((e.clientX - rect.left) / rect.width) * W;
          const idx = Math.floor(((svgX - padL) / cW) * games.length);
          setHoverIdx(Math.max(0, Math.min(games.length - 1, idx)));
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Y axis */}
        <text x={padL - 4} y={padT + 6} textAnchor="end" fontSize="7" fill="currentColor" fillOpacity="0.4">
          {(maxDmg / 1000).toFixed(0)}k
        </text>
        <text x={padL - 4} y={padT + cH + 3} textAnchor="end" fontSize="7" fill="currentColor" fillOpacity="0.4">0</text>
        {/* Bars */}
        {damages.map((dmg, i) => {
          const barH = (dmg / maxDmg) * cH;
          const x = padL + (i / games.length) * cW + barGap / 2;
          const y = padT + cH - barH;
          const isHovered = hoverIdx === i;
          return (
            <rect key={i} x={x} y={y} width={barW} height={barH} rx={1.5}
              fill={games[i].win ? '#22c55e' : '#ef4444'}
              fillOpacity={isHovered ? 0.9 : 0.6}
            />
          );
        })}
      </svg>
      {hoverIdx !== null && (
        <div className="absolute top-0 z-20 pointer-events-none"
          style={{ left: `${Math.max(10, Math.min(85, ((padL + (hoverIdx / games.length) * cW + barW / 2) / W) * 100))}%`, transform: 'translateX(-50%)' }}
        >
          <div className="bg-bg-secondary/95 backdrop-blur-sm border border-bg-elevated rounded-lg shadow-xl px-2.5 py-1.5 text-[10px]">
            <div className="text-text-tertiary">{games[hoverIdx].championName}</div>
            <div className={`font-bold ${games[hoverIdx].win ? 'text-accent-success' : 'text-accent-danger'}`}>
              {games[hoverIdx].win ? '승리' : '패배'}
            </div>
            <div className="text-text-primary font-medium">{damages[hoverIdx].toLocaleString()} 딜량</div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatsDisplay({ stats, showCsPerMin }: { stats: SummaryStats; showCsPerMin: boolean }) {
  if (stats.games.length === 0) {
    return (
      <div className="text-center py-8 text-text-tertiary text-sm">
        최근 전적이 없습니다
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Win/Loss Trend Chart */}
      <div>
        <p className="text-xs text-text-tertiary mb-1 font-medium">승패 추이 (최근 {stats.games.length}게임)</p>
        <WinLossTrendChart games={stats.games} />
      </div>

      {/* Summary Stats Row */}
      <div className="flex items-center gap-4">
        {/* Win Rate Donut */}
        <WinRateDonut winRate={stats.winRate} />

        {/* Win/Loss + KDA */}
        <div className="flex-1 space-y-1">
          <div className="text-sm">
            <span className="text-accent-success font-bold">{stats.wins}승</span>
            <span className="text-text-tertiary mx-1">/</span>
            <span className="text-accent-danger font-bold">{stats.losses}패</span>
          </div>
          <div className="text-sm">
            <span className="text-text-secondary">평균 </span>
            <span className="font-bold text-text-primary">
              {stats.avgKills.toFixed(1)} / <span className="text-accent-danger">{stats.avgDeaths.toFixed(1)}</span> / {stats.avgAssists.toFixed(1)}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-text-tertiary">
            <span>KDA <span className="font-bold text-text-secondary">{stats.avgKDA}</span></span>
            {showCsPerMin && stats.avgCsPerMin != null && stats.avgCsPerMin > 0 && (
              <span>CS/분 <span className="font-bold text-text-secondary">{stats.avgCsPerMin.toFixed(1)}</span></span>
            )}
          </div>
        </div>
      </div>

      {/* KDA Trend Chart */}
      {stats.games.length >= 2 && (
        <div>
          <p className="text-xs text-text-tertiary mb-1 font-medium">KDA 추세 (최근 {stats.games.length}게임)</p>
          <KDATrendChart games={stats.games} />
        </div>
      )}

      {/* Damage Trend Chart */}
      {stats.games.length >= 2 && stats.games.some(g => g.damage > 0) && (
        <div>
          <p className="text-xs text-text-tertiary mb-1 font-medium">딜량 추세 (최근 {stats.games.length}게임)</p>
          <DamageTrendChart games={stats.games} />
        </div>
      )}

      {/* Most Champions */}
      {stats.mostChampions.length > 0 && (
        <div>
          <p className="text-xs text-text-tertiary mb-2 font-medium">모스트 챔피언</p>
          <div className="space-y-1.5">
            {stats.mostChampions.map((champ) => (
              <div key={champ.championName} className="flex items-center gap-2.5">
                <Image
                  src={getChampionIcon(champ.championName)}
                  alt={champ.championName}
                  width={28}
                  height={28}
                  className="w-7 h-7 rounded-full flex-shrink-0"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
                <span className="text-xs text-text-primary w-16 truncate font-medium">{champ.championName}</span>
                <span className="text-[11px] text-text-tertiary w-10">{champ.games}게임</span>
                <span className={`text-[11px] font-bold w-10 ${
                  champ.winRate >= 60 ? "text-accent-success" : champ.winRate >= 50 ? "text-text-primary" : "text-accent-danger"
                }`}>
                  {champ.winRate}%
                </span>
                {/* Play rate bar */}
                <div className="flex-1 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent-primary/60"
                    style={{ width: `${champ.playRate}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RecentStatsSummary({
  gameName,
  tagLine,
  puuid,
  nexusMatches,
}: RecentStatsSummaryProps) {
  const [activeTab, setActiveTab] = useState<"all" | "ranked" | "normal" | "nexus">("all");

  const hasRiot = !!(gameName && tagLine && puuid);

  // Fetch all queues recent 20 games
  const { data: allMatches, isLoading: isLoadingAll } = useQuery<any[]>({
    queryKey: ["recentAllStats", gameName, tagLine],
    queryFn: () => statsApi.getSummonerRiotMatches(gameName!, tagLine!, 20),
    staleTime: 3 * 60 * 1000,
    retry: false,
    enabled: hasRiot,
  });

  // Fetch ranked (solo queue) recent 20 games — 탭 선택 시에만 요청
  const { data: rankedMatches, isLoading: isLoadingRanked } = useQuery<any[]>({
    queryKey: ["recentRankedStats", gameName, tagLine],
    queryFn: () => statsApi.getSummonerRiotMatches(gameName!, tagLine!, 20, 420),
    staleTime: 3 * 60 * 1000,
    retry: false,
    enabled: hasRiot && activeTab === "ranked",
  });

  // Fetch normal (blind+draft) recent 20 games
  const { data: normalMatches, isLoading: isLoadingNormal } = useQuery<any[]>({
    queryKey: ["recentNormalStats", gameName, tagLine],
    queryFn: () => statsApi.getSummonerRiotMatches(gameName!, tagLine!, 20, 430),
    staleTime: 3 * 60 * 1000,
    retry: false,
    enabled: hasRiot && activeTab === "normal",
  });

  const allStats = useMemo(
    () => (allMatches && puuid ? computeRiotStats(allMatches, puuid) : null),
    [allMatches, puuid]
  );

  const rankedStats = useMemo(
    () => (rankedMatches && puuid ? computeRiotStats(rankedMatches, puuid) : null),
    [rankedMatches, puuid]
  );

  const normalStats = useMemo(
    () => (normalMatches && puuid ? computeRiotStats(normalMatches, puuid) : null),
    [normalMatches, puuid]
  );

  const nexusStats = useMemo(
    () => (nexusMatches ? computeNexusStats(nexusMatches) : null),
    [nexusMatches]
  );

  // If no riot account, default to nexus tab
  const effectiveTab = hasRiot ? activeTab : "nexus";

  return (
    <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-text-primary">최근 전적 요약</h2>
        <div className="flex gap-1 bg-bg-tertiary/50 rounded-lg p-0.5">
          {hasRiot && (
            <>
              <button
                onClick={() => setActiveTab("all")}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  effectiveTab === "all"
                    ? "bg-accent-primary text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                전체
              </button>
              <button
                onClick={() => setActiveTab("ranked")}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  effectiveTab === "ranked"
                    ? "bg-accent-primary text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                랭크
              </button>
              <button
                onClick={() => setActiveTab("normal")}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  effectiveTab === "normal"
                    ? "bg-accent-primary text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                일반
              </button>
            </>
          )}
          <button
            onClick={() => setActiveTab("nexus")}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              effectiveTab === "nexus"
                ? "bg-accent-primary text-white"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            넥서스 내전
          </button>
        </div>
      </div>

      {effectiveTab === "all" ? (
        isLoadingAll ? (
          <div className="flex items-center justify-center py-12 gap-2 text-text-tertiary text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            전적 불러오는 중...
          </div>
        ) : allStats ? (
          <StatsDisplay stats={allStats} showCsPerMin />
        ) : (
          <div className="text-center py-8 text-text-tertiary text-sm">
            최근 전적이 없습니다
          </div>
        )
      ) : effectiveTab === "normal" ? (
        isLoadingNormal ? (
          <div className="flex items-center justify-center py-12 gap-2 text-text-tertiary text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            일반 게임 전적 불러오는 중...
          </div>
        ) : normalStats ? (
          <StatsDisplay stats={normalStats} showCsPerMin />
        ) : (
          <div className="text-center py-8 text-text-tertiary text-sm">
            일반 게임 전적이 없습니다
          </div>
        )
      ) : effectiveTab === "ranked" ? (
        isLoadingRanked ? (
          <div className="flex items-center justify-center py-12 gap-2 text-text-tertiary text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            랭크 전적 불러오는 중...
          </div>
        ) : rankedStats ? (
          <StatsDisplay stats={rankedStats} showCsPerMin />
        ) : (
          <div className="text-center py-8 text-text-tertiary text-sm">
            랭크 전적을 불러올 수 없습니다
          </div>
        )
      ) : (
        nexusStats ? (
          <StatsDisplay stats={nexusStats} showCsPerMin={false} />
        ) : (
          <div className="text-center py-8 text-text-tertiary text-sm">
            넥서스 내전 전적이 없습니다
          </div>
        )
      )}
    </div>
  );
}
