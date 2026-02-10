"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { riotApi, matchApi, statsApi } from "@/lib/api-client";
import { LoadingSpinner, Button, Badge } from "@/components/ui";
import { ArrowLeft, Trophy, TrendingUp, Target, Sword, ExternalLink, Loader2, Gamepad2, RefreshCw, Search, ChevronDown, ChevronUp, Shield, Crosshair } from "lucide-react";
import Link from "next/link";

interface SummonerData {
  puuid: string;
  gameName: string;
  tagLine: string;
  summonerLevel: number;
  profileIconId: number;
  tier?: string;
  rank?: string;
  leaguePoints?: number;
  wins?: number;
  losses?: number;
}

interface MatchParticipant {
  id: string;
  matchId: string;
  userId: string;
  championId: number;
  championName: string;
  position: string;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  goldEarned: number;
  totalDamageDealtToChampions: number;
  win: boolean;
  createdAt: string;
  match: {
    id: string;
    teamA: { id: string; name: string };
    teamB: { id: string; name: string };
    winner: { id: string; name: string };
    completedAt: string;
  };
  team: {
    id: string;
    name: string;
    color: string;
  };
}

interface ChampionStats {
  championId: number;
  championName: string;
  games: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
}

// Summoner Spell ID to Name mapping
const getSummonerSpellName = (spellId: number): string => {
  const spellMap: Record<number, string> = {
    1: 'Boost', // Cleanse
    3: 'Exhaust',
    4: 'Flash',
    6: 'Haste', // Ghost
    7: 'Heal',
    11: 'Smite',
    12: 'Teleport',
    13: 'Mana', // Clarity
    14: 'Dot', // Ignite
    21: 'Barrier',
    30: 'PoroRecall',
    31: 'PoroThrow',
    32: 'Mark', // Snowball
    39: 'UltBook', // Placeholder
    54: 'Summoner_UltBookSmitePlaceholder',
    55: 'Summoner_UltBookFlashPlaceholder',
  };
  return spellMap[spellId] || 'Flash';
};

interface ParticipantSeries {
  participantId: number;
  teamId: number;
  championName: string;
  summonerName: string;
  data: { min: number; value: number }[];
}

function MultiLineChart({
  series, myParticipantId, myTeamId, label, formatVal,
}: {
  series: ParticipantSeries[];
  myParticipantId: number;
  myTeamId: number;
  label: string;
  formatVal: (v: number) => string;
}) {
  const [hoverMin, setHoverMin] = useState<number | null>(null);
  const [hiddenPlayers, setHiddenPlayers] = useState<Set<number>>(new Set());
  if (!series.length || !series[0]?.data.length) return null;

  const togglePlayer = (pid: number) => {
    setHiddenPlayers(prev => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  const visibleSeries = series.filter(s => !hiddenPlayers.has(s.participantId));
  const allMins = Array.from(new Set(series.flatMap(s => s.data.map(d => d.min)))).sort((a, b) => a - b);
  const maxMin = allMins[allMins.length - 1] || 1;
  const visibleValues = visibleSeries.flatMap(s => s.data.map(d => d.value));
  const maxVal = Math.max(...(visibleValues.length ? visibleValues : [1]));
  const minVal = Math.min(...(visibleValues.length ? visibleValues : [0]));
  const range = maxVal - minVal || 1;

  const W = 500, H = 180;
  const padL = 44, padR = 8, padT = 10, padB = 24;
  const cW = W - padL - padR, cH = H - padT - padB;
  const toX = (m: number) => padL + (m / maxMin) * cW;
  const toY = (v: number) => padT + cH - ((v - minVal) / range) * cH;

  const xTicks: number[] = [];
  for (let m = 0; m <= maxMin; m += 5) xTicks.push(m);
  const yTicks = [minVal, minVal + range * 0.5, maxVal];

  const mySeries = series.find(s => s.participantId === myParticipantId);
  const myVisible = !hiddenPlayers.has(myParticipantId);
  const findNearest = (s: ParticipantSeries, targetMin: number) =>
    s.data.reduce((prev, curr) =>
      Math.abs(curr.min - targetMin) < Math.abs(prev.min - targetMin) ? curr : prev, s.data[0]);

  const hoverValues = hoverMin !== null
    ? visibleSeries.map(s => ({ ...s, value: findNearest(s, hoverMin)?.value ?? 0 })).sort((a, b) => b.value - a.value)
    : [];

  const tooltipLeft = hoverMin !== null ? Math.max(8, Math.min(68, (toX(hoverMin) / W) * 100)) : 50;
  const myTeamPlayers = series.filter(s => s.teamId === myTeamId);
  const enemyTeamPlayers = series.filter(s => s.teamId !== myTeamId);

  return (
    <div className="mt-5">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-medium text-text-secondary">{label}</span>
        {mySeries && myVisible && (
          <span className="text-xs text-text-tertiary ml-auto">
            최종: {formatVal(mySeries.data[mySeries.data.length - 1]?.value ?? 0)}
          </span>
        )}
      </div>
      {/* Player Toggle Legend - grouped by team */}
      <div className="mb-2 space-y-1">
        {([
          { players: myTeamPlayers, label: '아군', labelClr: '#22c55e' },
          { players: enemyTeamPlayers, label: '적군', labelClr: '#ef4444' },
        ] as const).map(({ players, label, labelClr }) => (
          <div key={label} className="flex items-center gap-1 flex-wrap">
            <span className="text-[9px] font-medium w-5 shrink-0" style={{ color: labelClr }}>{label}</span>
            {players.map((s: ParticipantSeries) => {
              const isMe = s.participantId === myParticipantId;
              const isEnemy = s.teamId !== myTeamId;
              const isHidden = hiddenPlayers.has(s.participantId);
              const clr = isMe ? '#6366f1' : isEnemy ? '#ef4444' : '#22c55e';
              return (
                <button
                  key={s.participantId}
                  onClick={() => togglePlayer(s.participantId)}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-all ${
                    isHidden
                      ? 'text-text-tertiary opacity-30'
                      : isMe
                      ? 'text-accent-primary bg-accent-primary/10'
                      : 'text-text-secondary hover:bg-bg-elevated/40'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: isHidden ? '#555' : clr, display: 'inline-block' }} />
                  <span className="max-w-[58px] truncate">{s.summonerName}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="relative select-none">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible cursor-crosshair"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const svgX = ((e.clientX - rect.left) / rect.width) * W;
            const dataMin = ((svgX - padL) / cW) * maxMin;
            const nearest = allMins.reduce((prev, curr) =>
              Math.abs(curr - dataMin) < Math.abs(prev - dataMin) ? curr : prev);
            setHoverMin(nearest);
          }}
          onMouseLeave={() => setHoverMin(null)}
        >
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={padL} x2={padL + cW} y1={toY(t)} y2={toY(t)} stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" />
              <text x={padL - 4} y={toY(t) + 3} textAnchor="end" fontSize="8" fill="currentColor" fillOpacity="0.4">{formatVal(t)}</text>
            </g>
          ))}
          {xTicks.map(m => (
            <text key={m} x={toX(m)} y={H - 4} textAnchor="middle" fontSize="8" fill="currentColor" fillOpacity="0.4">{m}m</text>
          ))}
          {visibleSeries.filter(s => s.teamId !== myTeamId).map(s => {
            const d = s.data.map((pt, i) => `${i === 0 ? 'M' : 'L'}${toX(pt.min).toFixed(1)},${toY(pt.value).toFixed(1)}`).join(' ');
            return <path key={s.participantId} d={d} fill="none" stroke="#ef4444" strokeWidth="1" strokeOpacity={hoverMin !== null ? 0.5 : 0.3} />;
          })}
          {visibleSeries.filter(s => s.teamId === myTeamId && s.participantId !== myParticipantId).map(s => {
            const d = s.data.map((pt, i) => `${i === 0 ? 'M' : 'L'}${toX(pt.min).toFixed(1)},${toY(pt.value).toFixed(1)}`).join(' ');
            return <path key={s.participantId} d={d} fill="none" stroke="#22c55e" strokeWidth="1" strokeOpacity={hoverMin !== null ? 0.6 : 0.4} />;
          })}
          {mySeries && myVisible && (() => {
            const pts = mySeries.data;
            const pathD = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'}${toX(pt.min).toFixed(1)},${toY(pt.value).toFixed(1)}`).join(' ');
            const areaD = `${pathD} L${toX(pts[pts.length - 1].min).toFixed(1)},${(padT + cH).toFixed(1)} L${toX(pts[0].min).toFixed(1)},${(padT + cH).toFixed(1)} Z`;
            return (<><path d={areaD} fill="#6366f1" fillOpacity="0.07" /><path d={pathD} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" /></>);
          })()}
          {hoverMin !== null && (<>
            <line x1={toX(hoverMin)} x2={toX(hoverMin)} y1={padT} y2={padT + cH}
              stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" strokeDasharray="3,2" />
            {visibleSeries.map(s => {
              const pt = findNearest(s, hoverMin);
              if (!pt) return null;
              const isMe = s.participantId === myParticipantId;
              const clr = isMe ? '#6366f1' : s.teamId === myTeamId ? '#22c55e' : '#ef4444';
              return <circle key={s.participantId} cx={toX(pt.min)} cy={toY(pt.value)} r={isMe ? 4 : 2.5}
                fill={clr} fillOpacity={isMe ? 1 : 0.8} stroke="white" strokeWidth={isMe ? 1.5 : 0.5} strokeOpacity="0.4" />;
            })}
          </>)}
        </svg>
        {hoverMin !== null && hoverValues.length > 0 && (
          <div className="absolute top-0 z-20 pointer-events-none" style={{ left: `${tooltipLeft}%`, transform: 'translateX(-50%)' }}>
            <div className="bg-bg-secondary/95 backdrop-blur-sm border border-bg-elevated rounded-lg shadow-xl p-2 text-[11px] min-w-[130px]">
              <div className="text-text-tertiary font-medium mb-1.5 border-b border-bg-tertiary pb-1">{hoverMin}분</div>
              <div className="space-y-0.5">
                {hoverValues.map((v, rank) => {
                  const isMe = v.participantId === myParticipantId;
                  const clr = isMe ? '#6366f1' : v.teamId === myTeamId ? '#22c55e' : '#ef4444';
                  return (
                    <div key={v.participantId} className={`flex items-center gap-1.5 ${isMe ? 'font-bold' : ''}`}>
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: clr }} />
                      <span className={`truncate w-[70px] ${isMe ? 'text-accent-primary' : 'text-text-secondary'}`}>
                        {rank === 0 && <span className="text-[9px] text-accent-gold mr-0.5">①</span>}
                        {v.summonerName}
                      </span>
                      <span className="ml-auto text-text-primary shrink-0 font-medium">{formatVal(v.value)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TimelineGraphs({
  tl, match, participant,
}: {
  tl: any;
  match: any;
  participant: any;
}) {
  const [activeTab, setActiveTab] = useState<'gold' | 'cs' | 'xp'>('gold');

  if (!tl?.info?.frames) return null;

  const buildSeries = (getVal: (f: any) => number): ParticipantSeries[] => {
    const map = new Map<number, ParticipantSeries>();
    for (const p of match.info.participants) {
      map.set(p.participantId, {
        participantId: p.participantId,
        teamId: p.teamId,
        championName: p.championName,
        summonerName: p.riotIdGameName || p.summonerName || p.championName,
        data: [],
      });
    }
    for (const frame of tl.info.frames) {
      const min = Math.round(frame.timestamp / 60000);
      for (const [pid, s] of map) {
        const pf = frame.participantFrames?.[String(pid)];
        if (pf) s.data.push({ min, value: getVal(pf) });
      }
    }
    return Array.from(map.values());
  };

  const tabs = [
    { key: 'gold' as const, label: '골드', series: buildSeries(f => f.totalGold), formatVal: (v: number) => `${(v / 1000).toFixed(1)}k` },
    { key: 'cs' as const, label: 'CS', series: buildSeries(f => f.minionsKilled + (f.jungleMinionsKilled || 0)), formatVal: (v: number) => String(Math.round(v)) },
    { key: 'xp' as const, label: '경험치', series: buildSeries(f => f.xp), formatVal: (v: number) => `${(v / 1000).toFixed(1)}k` },
  ];

  const active = tabs.find(t => t.key === activeTab)!;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-text-primary">타임라인 그래프</h3>
        <div className="flex gap-1 bg-bg-tertiary/50 rounded-lg p-0.5">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === t.key
                  ? 'bg-accent-primary text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-bg-tertiary/30 rounded-lg p-3">
        <MultiLineChart
          series={active.series}
          myParticipantId={participant.participantId}
          myTeamId={participant.teamId}
          label={active.label}
          formatVal={active.formatVal}
        />
      </div>
    </div>
  );
}

export default function SummonerStatsPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  // useParams()에서 받은 값을 명시적으로 디코딩
  const gameName = decodeURIComponent(params.gameName as string);
  const tagLine = decodeURIComponent(params.tagLine as string);

  const [summoner, setSummoner] = useState<SummonerData | null>(null);
  const [matches, setMatches] = useState<MatchParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nexusUserId, setNexusUserId] = useState<string | null>(null);
  const [showRiotMatches, setShowRiotMatches] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [expandedMatches, setExpandedMatches] = useState<Set<string>>(new Set());
  const mountedMatchesRef = useRef(new Set<string>());
  const [matchDetailTabs, setMatchDetailTabs] = useState<Map<string, 'teams' | 'build' | 'stats' | 'timeline'>>(new Map());
  const [timelineData, setTimelineData] = useState<Map<string, any>>(new Map());
  const [timelineLoading, setTimelineLoading] = useState<Set<string>>(new Set());

  const toggleMatchExpand = (matchId: string) => {
    if (!expandedMatches.has(matchId)) {
      mountedMatchesRef.current.add(matchId);
    }
    setExpandedMatches(prev => {
      const newSet = new Set(prev);
      if (newSet.has(matchId)) newSet.delete(matchId);
      else newSet.add(matchId);
      return newSet;
    });
  };

  const loadTimeline = async (matchId: string) => {
    if (timelineData.has(matchId) || timelineLoading.has(matchId)) return;
    setTimelineLoading(prev => new Set(prev).add(matchId));
    try {
      const data = await statsApi.getMatchTimeline(matchId);
      setTimelineData(prev => new Map(prev).set(matchId, data));
    } catch (err) {
      console.error("Failed to load timeline:", err);
    } finally {
      setTimelineLoading(prev => { const s = new Set(prev); s.delete(matchId); return s; });
    }
  };

  const navigateToSummoner = (riotIdGameName: string, riotIdTagline: string) => {
    if (riotIdGameName && riotIdTagline) {
      router.push(`/matches/summoner/${encodeURIComponent(riotIdGameName)}/${encodeURIComponent(riotIdTagline)}`);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const input = searchInput.trim();
    if (!input) return;

    // Parse gameName#tagLine format
    const hashIndex = input.lastIndexOf("#");
    if (hashIndex === -1) {
      alert("소환사명#태그 형식으로 입력해주세요 (예: Hide on bush#KR1)");
      return;
    }

    const searchGameName = input.substring(0, hashIndex).trim();
    const searchTagLine = input.substring(hashIndex + 1).trim();

    if (!searchGameName || !searchTagLine) {
      alert("소환사명#태그 형식으로 입력해주세요 (예: Hide on bush#KR1)");
      return;
    }

    router.push(`/matches/summoner/${encodeURIComponent(searchGameName)}/${encodeURIComponent(searchTagLine)}`);
  };

  useEffect(() => {
    fetchSummonerData();
  }, [gameName, tagLine]);

  const fetchSummonerData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch summoner info from Riot API
      const summonerData = await riotApi.getSummoner(gameName, tagLine);
      setSummoner(summonerData);

      // Try to find Nexus user with this Riot account
      try {
        const userResult = await statsApi.findUserByRiotAccount(gameName, tagLine);
        if (userResult.found && userResult.userId) {
          setNexusUserId(userResult.userId);

          // Fetch match history for this user
          const matchHistory = await matchApi.getUserMatchHistory(userResult.userId, 20, 0);
          setMatches(matchHistory);
        }
      } catch (err) {
        console.log("No Nexus user found for this summoner");
        setMatches([]);
      }

      setShowRiotMatches(true);
    } catch (err: any) {
      console.error("Failed to fetch summoner data:", err);
      setError(err.response?.data?.message || "소환사 정보를 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const RIOT_MATCH_COUNT = 10;

  const {
    data: riotMatchPages,
    isLoading: isLoadingRiotMatches,
    isError: isRiotMatchError,
    refetch: refetchRiotMatches,
    isFetchingNextPage: isLoadingMoreRiotMatches,
    fetchNextPage: loadMoreRiotMatches,
    hasNextPage: hasMoreRiotMatches,
  } = useInfiniteQuery({
    queryKey: ["riotMatches", gameName, tagLine],
    queryFn: ({ pageParam = 0 }) =>
      statsApi.getSummonerRiotMatches(gameName, tagLine, RIOT_MATCH_COUNT, undefined, pageParam),
    getNextPageParam: (lastPage: any[], _allPages: any[][], lastPageParam: number) => {
      if (lastPage.length === 0) return undefined;
      return lastPageParam + RIOT_MATCH_COUNT;
    },
    initialPageParam: 0,
    staleTime: 3 * 60 * 1000,
    enabled: !!gameName && !!tagLine,
  });

  const riotMatches = riotMatchPages?.pages.flat() ?? [];

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Re-fetch summoner data
      const summonerData = await riotApi.getSummoner(gameName, tagLine);
      setSummoner(summonerData);

      // Re-fetch Riot matches (invalidate cache)
      if (showRiotMatches) {
        await queryClient.invalidateQueries({ queryKey: ["riotMatches", gameName, tagLine] });
      }
    } catch (err: any) {
      console.error("Failed to refresh data:", err);
      alert("데이터 새로고침에 실패했습니다.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const getProfileIconUrl = (iconId: number) => {
    const version = process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1";
    return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${iconId}.png`;
  };

  const getTierImage = (tier?: string) => {
    if (!tier) return null;
    const version = process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1";
    return `https://raw.communitydragon.org/${version}/plugins/rcp-fe-lol-shared-components/global/default/${tier.toLowerCase()}.png`;
  };

  const getChampionIcon = (championName: string) => {
    const version = process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1";
    return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championName}.png`;
  };

  const getQueueTypeName = (queueId: number) => {
    const queueTypes: { [key: number]: string } = {
      420: "솔로 랭크",
      440: "자유 랭크",
      450: "칼바람 나락",
      400: "일반 게임",
      430: "일반 게임",
      900: "URF",
      1020: "단일 챔피언",
      1700: "아레나",
    };
    return queueTypes[queueId] || "기타 게임";
  };

  const calculateWinRate = () => {
    if (!summoner || (!summoner.wins && !summoner.losses)) return 0;
    const total = (summoner.wins || 0) + (summoner.losses || 0);
    if (total === 0) return 0;
    return Math.round(((summoner.wins || 0) / total) * 100);
  };

  const calculateChampionStats = (): ChampionStats[] => {
    const statsMap = new Map<number, ChampionStats>();

    matches.forEach((match) => {
      const existing = statsMap.get(match.championId);
      if (existing) {
        existing.games++;
        if (match.win) existing.wins++;
        else existing.losses++;
        existing.kills += match.kills;
        existing.deaths += match.deaths;
        existing.assists += match.assists;
        existing.cs += match.totalMinionsKilled + match.neutralMinionsKilled;
      } else {
        statsMap.set(match.championId, {
          championId: match.championId,
          championName: match.championName,
          games: 1,
          wins: match.win ? 1 : 0,
          losses: match.win ? 0 : 1,
          kills: match.kills,
          deaths: match.deaths,
          assists: match.assists,
          cs: match.totalMinionsKilled + match.neutralMinionsKilled,
        });
      }
    });

    return Array.from(statsMap.values()).sort((a, b) => b.games - a.games);
  };

  const calculateRankedChampionStats = (
    riotMatches: any[],
    puuid: string
  ): ChampionStats[] => {
    const statsMap = new Map<string, ChampionStats>();

    riotMatches.forEach((match) => {
        const queueId = match.info.queueId;
        // 420: Solo Rank, 440: Flex Rank
        if (queueId !== 420 && queueId !== 440) {
            return;
        }

        const participant = match.info.participants.find(
            (p: any) => p.puuid === puuid
        );
        if (!participant) {
            return;
        }

        const championName = participant.championName;
        const existing = statsMap.get(championName);

        if (existing) {
            existing.games++;
            if (participant.win) existing.wins++;
            else existing.losses++;
            existing.kills += participant.kills;
            existing.deaths += participant.deaths;
            existing.assists += participant.assists;
            existing.cs +=
                participant.totalMinionsKilled + participant.neutralMinionsKilled;
        } else {
            statsMap.set(championName, {
                championId: participant.championId,
                championName: championName,
                games: 1,
                wins: participant.win ? 1 : 0,
                losses: participant.win ? 0 : 1,
                kills: participant.kills,
                deaths: participant.deaths,
                assists: participant.assists,
                cs:
                    participant.totalMinionsKilled + participant.neutralMinionsKilled,
            });
        }
    });

    return Array.from(statsMap.values()).sort((a, b) => b.games - a.games);
  };

  if (isLoading) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="text-text-secondary mt-4">소환사 정보 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error || !summoner) {
    return (
      <div className="flex-grow flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-accent-danger mb-4">{error || "소환사를 찾을 수 없습니다."}</p>
          <Button onClick={() => router.push("/matches")}>
            전적 검색으로 돌아가기
          </Button>
        </div>
      </div>
    );
  }

  const winRate = calculateWinRate();
  const championStats = calculateChampionStats();
  const rankedChampionStats = summoner ? calculateRankedChampionStats(riotMatches, summoner.puuid) : [];

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Search Header */}
      <div className="border-b border-bg-tertiary bg-bg-secondary">
        <div className="container mx-auto px-4 py-3">
          <div className="relative flex items-center justify-center">
            <Link
              href="/matches"
              className="absolute left-0 inline-flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors text-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              전적 검색
            </Link>

            {/* Search Form */}
            <form onSubmit={handleSearch} className="w-full max-w-xl">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-text-tertiary" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="소환사명#태그 (예: Hide on bush#KR1)"
                  className="w-full pl-12 pr-4 py-3 bg-bg-tertiary border border-bg-elevated rounded-xl text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-primary transition-colors text-base"
                />
              </div>
            </form>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 py-8">
        {/* Summoner Header */}
        <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6 mb-6">
          <div className="flex items-start gap-6">
            {/* Profile Icon */}
            <div className="relative">
              <img
                src={getProfileIconUrl(summoner.profileIconId)}
                alt="Profile Icon"
                className="w-24 h-24 rounded-xl border-2 border-accent-primary"
              />
              <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 bg-bg-elevated border border-bg-tertiary rounded-full px-3 py-1">
                <span className="text-xs font-bold text-text-primary">
                  {summoner.summonerLevel}
                </span>
              </div>
            </div>

            {/* Summoner Info */}
            <div className="flex-grow">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-text-primary">
                  {summoner.gameName}
                  <span className="text-text-tertiary">#{summoner.tagLine}</span>
                </h1>
                {nexusUserId && (
                  <Link
                    href={`/matches/user/${nexusUserId}`}
                    className="text-sm text-accent-primary hover:text-accent-hover flex items-center gap-1"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Nexus 프로필
                  </Link>
                )}
              </div>

              <div className="flex items-center gap-4 mt-4">
                {summoner.tier && summoner.rank ? (
                  <>
                    {/* Tier Badge */}
                    <div className="flex items-center gap-3 bg-bg-tertiary rounded-lg p-3">
                      {getTierImage(summoner.tier) && (
                        <img
                          src={getTierImage(summoner.tier)!}
                          alt={summoner.tier}
                          className="w-12 h-12"
                        />
                      )}
                      <div>
                        <p className="font-bold text-text-primary">
                          {summoner.tier} {summoner.rank}
                        </p>
                        <p className="text-sm text-text-secondary">
                          {summoner.leaguePoints} LP
                        </p>
                      </div>
                    </div>

                    {/* Win Rate */}
                    <div className="bg-bg-tertiary rounded-lg p-3">
                      <p className="text-sm text-text-secondary mb-1">승률</p>
                      <p className="text-2xl font-bold text-accent-primary">
                        {winRate}%
                      </p>
                      <p className="text-xs text-text-tertiary">
                        {summoner.wins}승 {summoner.losses}패
                      </p>
                    </div>

                    {/* Season Tiers Placeholder */}
                    <div className="bg-bg-tertiary rounded-lg p-3">
                        <p className="text-sm text-text-secondary mb-2">시즌별 티어</p>
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1" title="Season 2023">
                                <img src={getTierImage('gold')} alt="S2023" className="w-8 h-8"/>
                                <span className="text-xs text-text-tertiary font-semibold">S23</span>
                            </div>
                            <div className="flex items-center gap-1" title="Season 2022">
                                <img src={getTierImage('platinum')} alt="S2022" className="w-8 h-8"/>
                                <span className="text-xs text-text-tertiary font-semibold">S22</span>
                            </div>
                            <div className="flex items-center gap-1" title="Season 2021">
                                <img src={getTierImage('diamond')} alt="S2021" className="w-8 h-8"/>
                                <span className="text-xs text-text-tertiary font-semibold">S21</span>
                            </div>
                        </div>
                    </div>

                    {/* Ladder Rank Placeholder */}
                    <div className="bg-bg-tertiary rounded-lg p-3 text-center">
                        <p className="text-sm text-text-secondary mb-1">래더 랭킹</p>
                        <p className="text-2xl font-bold text-text-primary">
                            -
                        </p>
                        <p className="text-xs text-text-tertiary">
                            상위 -%
                        </p>
                    </div>

                    {/* Nexus Rank Placeholder */}
                    <div className="bg-bg-tertiary rounded-lg p-3 text-center">
                        <p className="text-sm text-text-secondary mb-1">넥서스 랭킹</p>
                        <p className="text-2xl font-bold text-text-primary">
                            -
                        </p>
                        <p className="text-xs text-text-tertiary">
                            상위 -%
                        </p>
                    </div>
                  </>
                ) : (
                  <Badge variant="secondary">언랭</Badge>
                )}

                {/* Refresh Button */}
                <Button
                  onClick={handleRefresh}
                  variant="secondary"
                  size="sm"
                  disabled={isRefreshing}
                  className="ml-auto"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                  {isRefreshing ? "새로고침 중..." : "새로고침"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Match History */}
          <div className="lg:col-span-2">
            <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
              <h2 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
                <Trophy className="h-5 w-5 text-accent-primary" />
                최근 전적
              </h2>

              {matches.length === 0 ? (
                <div className="text-center py-16">
                  <Target className="h-16 w-16 text-text-tertiary mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold text-text-primary mb-2">
                    Nexus 플랫폼 매치 기록이 없습니다
                  </h3>
                  <p className="text-text-secondary mb-4">
                    이 소환사는 아직 Nexus 토너먼트에 참가하지 않았습니다.
                  </p>
                  <p className="text-sm text-text-tertiary">
                    💡 Nexus에서 토너먼트에 참가하면 여기에 전적이 표시됩니다.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {matches.map((match) => {
                    const kda = match.deaths === 0
                      ? match.kills + match.assists
                      : ((match.kills + match.assists) / match.deaths).toFixed(2);

                    return (
                      <Link
                        key={match.matchId}
                        href={`/matches/match/${match.matchId}`}
                        className={`flex items-center justify-between p-4 rounded-lg transition-colors ${
                          match.win
                            ? "bg-accent-success/10 border border-accent-success/30 hover:bg-accent-success/20"
                            : "bg-accent-danger/10 border border-accent-danger/30 hover:bg-accent-danger/20"
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          {/* Champion Icon */}
                          <img
                            src={getChampionIcon(match.championName)}
                            alt={match.championName}
                            className="w-12 h-12 rounded-lg"
                            onError={(e) => {
                              e.currentTarget.src = "/placeholder-champion.png";
                            }}
                          />

                          {/* Match Info */}
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant={match.win ? "success" : "danger"}>
                                {match.win ? "승리" : "패배"}
                              </Badge>
                              <span className="text-sm text-text-secondary">
                                {match.position}
                              </span>
                            </div>
                            <p className="text-sm font-semibold text-text-primary">
                              {match.championName}
                            </p>
                            <p className="text-xs text-text-tertiary">
                              {match.team.name}
                            </p>
                          </div>
                        </div>

                        {/* KDA */}
                        <div className="text-right">
                          <p className="font-semibold text-text-primary">
                            {match.kills} / {match.deaths} / {match.assists}
                          </p>
                          <p className="text-sm text-text-secondary">
                            {kda} KDA
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Riot Match History */}
            <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6 mt-6">
              <h2 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
                <Gamepad2 className="h-5 w-5 text-accent-primary" />
                Riot 게임 전적
              </h2>

              {isLoadingRiotMatches ? (
                <div className="text-center py-16">
                  <Loader2 className="h-16 w-16 text-text-tertiary mx-auto mb-4 animate-spin" />
                  <p className="text-text-secondary">Riot 전적을 불러오는 중...</p>
                </div>
              ) : isRiotMatchError ? (
                <div className="text-center py-16">
                  <Gamepad2 className="h-16 w-16 text-text-tertiary mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold text-text-primary mb-2">
                    전적 불러오기 실패
                  </h3>
                  <p className="text-text-secondary mb-4">
                    Riot 전적을 불러올 수 없습니다
                  </p>
                  <Button onClick={() => refetchRiotMatches()}>다시 시도</Button>
                </div>
              ) : riotMatches.length === 0 ? (
                <div className="text-center py-16">
                  <Target className="h-16 w-16 text-text-tertiary mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold text-text-primary mb-2">
                    최근 전적이 없습니다
                  </h3>
                  <p className="text-text-secondary">
                    최근 플레이한 게임이 없습니다
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-bg-tertiary/30">
                  {riotMatches.map((match) => {
                    // Find the participant data for this summoner
                    const participant = match.info.participants.find(
                      (p: any) => p.puuid === summoner?.puuid
                    );

                    if (!participant) return null;

                    const matchId = match.metadata.matchId;
                    const isExpanded = expandedMatches.has(matchId);

                    const kda = participant.deaths === 0
                      ? participant.kills + participant.assists
                      : ((participant.kills + participant.assists) / participant.deaths).toFixed(2);

                    const gameDurationMin = Math.floor(match.info.gameDuration / 60);
                    const gameDurationSec = match.info.gameDuration % 60;
                    const csPerMin = ((participant.totalMinionsKilled + participant.neutralMinionsKilled) / (match.info.gameDuration / 60)).toFixed(1);

                    // Calculate time ago
                    const gameEndTime = new Date(match.info.gameEndTimestamp);
                    const now = new Date();
                    const hoursAgo = Math.floor((now.getTime() - gameEndTime.getTime()) / (1000 * 60 * 60));
                    const daysAgo = Math.floor(hoursAgo / 24);
                    const timeAgo = daysAgo > 0 ? `${daysAgo}일 전` : `${hoursAgo}시간 전`;

                    // Calculate kill participation
                    const team = match.info.teams.find((t: any) => t.teamId === participant.teamId);
                    const teamKills = team?.objectives?.champion?.kills || 1;
                    const killParticipation = ((participant.kills + participant.assists) / teamKills * 100).toFixed(0);

                    // Split teams
                    const myTeam = match.info.participants.filter((p: any) => p.teamId === participant.teamId);
                    const enemyTeam = match.info.participants.filter((p: any) => p.teamId !== participant.teamId);
                    const myTeamWon = participant.win;

                    // MVP / ACE calculation (highest carry score per team)
                    const getCarryScore = (p: any) => p.kills * 3 + p.assists + (p.totalDamageDealtToChampions / 1000);
                    const winningTeam = myTeamWon ? myTeam : enemyTeam;
                    const losingTeam  = myTeamWon ? enemyTeam : myTeam;
                    const mvpPuuid = [...winningTeam].sort((a, b) => getCarryScore(b) - getCarryScore(a))[0]?.puuid ?? null;
                    const acePuuid  = [...losingTeam ].sort((a, b) => getCarryScore(b) - getCarryScore(a))[0]?.puuid ?? null;

                    return (
                      <div
                        key={matchId}
                        className={`overflow-hidden transition-all ${isExpanded ? 'bg-bg-secondary/60' : participant.win ? 'bg-accent-success/[0.06]' : 'bg-accent-danger/[0.06]'}`}
                      >
                        {/* Match Header - Clickable to expand */}
                        <div
                          className="px-6 pt-5 pb-4 cursor-pointer hover:bg-bg-tertiary/30 transition-colors"
                          onClick={() => toggleMatchExpand(matchId)}
                        >
                          {/* Top row: stats */}
                          <div className="flex items-center gap-4">
                            {/* Champion Icon */}
                            <img
                              src={getChampionIcon(participant.championName)}
                              alt={participant.championName}
                              className="w-12 h-12 rounded-xl flex-shrink-0"
                              onError={(e) => {
                                e.currentTarget.src = "/placeholder-champion.png";
                              }}
                            />

                            {/* Game Info */}
                            <div className="w-32 flex-shrink-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className={`font-bold text-sm ${
                                  participant.win ? "text-accent-success" : "text-accent-danger"
                                }`}>
                                  {participant.win ? "승리" : "패배"}
                                </span>
                                <span className="text-xs text-text-secondary truncate">{getQueueTypeName(match.info.queueId)}</span>
                              </div>
                              <div className="text-xs text-text-tertiary">{gameDurationMin}:{gameDurationSec.toString().padStart(2, '0')} · {timeAgo}</div>
                              <div className="text-xs text-text-tertiary truncate">{participant.championName} · {participant.teamPosition || "FILL"}</div>
                            </div>

                            {/* KDA */}
                            <div className="text-center w-20 flex-shrink-0">
                              <div className="text-sm font-bold text-text-primary">
                                {participant.kills} / <span className="text-accent-danger">{participant.deaths}</span> / {participant.assists}
                              </div>
                              <div className="text-xs text-text-secondary">{kda} KDA</div>
                            </div>

                            {/* Stats */}
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <div className="text-center">
                                <div className="text-sm font-medium text-text-primary">{participant.totalMinionsKilled + participant.neutralMinionsKilled}</div>
                                <div className="text-xs text-text-tertiary">CS</div>
                              </div>
                              <div className="text-center">
                                <div className="text-sm font-medium text-text-primary">{killParticipation}%</div>
                                <div className="text-xs text-text-tertiary">킬관여</div>
                              </div>
                            </div>

                            {/* Items (compact) */}
                            <div className="flex gap-1 flex-shrink-0">
                              {[participant.item0, participant.item1, participant.item2, participant.item3, participant.item4, participant.item5].map((item, idx) => (
                                <div
                                  key={idx}
                                  className="w-8 h-8 rounded-md bg-bg-tertiary border border-bg-elevated"
                                >
                                  {item !== 0 && (
                                    <img
                                      src={`https://ddragon.leagueoflegends.com/cdn/${process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1"}/img/item/${item}.png`}
                                      alt="item"
                                      className="w-full h-full rounded-md"
                                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                    />
                                  )}
                                </div>
                              ))}
                            </div>

                            <div className="flex-1" />

                            {/* Participants: blue team | red team (right side) */}
                            <div className="flex gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                              {/* Blue team (my team) */}
                              <div className="flex flex-col justify-center gap-0.5 w-24">
                                {myTeam.map((p: any) => {
                                  const isMvp = p.puuid === mvpPuuid;
                                  const isAce = p.puuid === acePuuid;
                                  const isMe = p.puuid === summoner?.puuid;
                                  const name = p.riotIdGameName || p.summonerName || p.championName;
                                  return (
                                    <div
                                      key={p.puuid}
                                      className={`flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity text-xs ${isMe ? 'text-accent-primary font-semibold' : 'text-text-tertiary'}`}
                                      onClick={() => { if (p.riotIdGameName && p.riotIdTagline) navigateToSummoner(p.riotIdGameName, p.riotIdTagline); }}
                                      title={`${p.riotIdGameName || p.summonerName}#${p.riotIdTagline || ''}`}
                                    >
                                      {isMvp && <span className="text-[9px] font-bold bg-yellow-500/90 text-yellow-950 px-0.5 rounded shrink-0">MVP</span>}
                                      {isAce && <span className="text-[9px] font-bold bg-purple-500/80 text-white px-0.5 rounded shrink-0">ACE</span>}
                                      <span className="truncate">{name}</span>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Divider */}
                              <div className="w-px bg-bg-tertiary/50 self-stretch" />

                              {/* Red team (enemy team) */}
                              <div className="flex flex-col justify-center gap-0.5 w-24 min-w-0">
                                {enemyTeam.map((p: any) => {
                                  const isMvp = p.puuid === mvpPuuid;
                                  const isAce = p.puuid === acePuuid;
                                  const name = p.riotIdGameName || p.summonerName || p.championName;
                                  return (
                                    <div
                                      key={p.puuid}
                                      className={`flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity text-xs text-text-tertiary`}
                                      onClick={() => { if (p.riotIdGameName && p.riotIdTagline) navigateToSummoner(p.riotIdGameName, p.riotIdTagline); }}
                                      title={`${p.riotIdGameName || p.summonerName}#${p.riotIdTagline || ''}`}
                                    >
                                      {isMvp && <span className="text-[9px] font-bold bg-yellow-500/90 text-yellow-950 px-0.5 rounded shrink-0">MVP</span>}
                                      {isAce && <span className="text-[9px] font-bold bg-purple-500/80 text-white px-0.5 rounded shrink-0">ACE</span>}
                                      <span className="truncate">{name}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Expand Icon */}
                            <div className="text-text-tertiary flex-shrink-0">
                              {isExpanded ? (
                                <ChevronUp className="h-5 w-5" />
                              ) : (
                                <ChevronDown className="h-5 w-5" />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Expanded Content - lazy mount, kept alive in DOM after first open */}
                        {mountedMatchesRef.current.has(matchId) && (
                          <div style={{ display: 'grid', gridTemplateRows: isExpanded ? '1fr' : '0fr', transition: 'grid-template-rows 0.2s ease' }}>
                          <div className="overflow-hidden"><div className="border-t border-bg-tertiary/40">
                            {/* Tab Navigation */}
                            <div className="flex border-b border-bg-tertiary bg-bg-tertiary/30">
                              {(['teams', 'build', 'stats', 'timeline'] as const).map((tab) => (
                                <button
                                  key={tab}
                                  onClick={() => {
                                    const newTabs = new Map(matchDetailTabs);
                                    newTabs.set(matchId, tab);
                                    setMatchDetailTabs(newTabs);
                                    if (tab === 'build' || tab === 'timeline') {
                                      loadTimeline(matchId);
                                    }
                                  }}
                                  className={`px-4 py-2 text-xs font-medium transition-colors relative ${
                                    (matchDetailTabs.get(matchId) || 'teams') === tab
                                      ? 'text-accent-primary'
                                      : 'text-text-secondary hover:text-text-primary'
                                  }`}
                                >
                                  {tab === 'teams' ? '팀 상세' : tab === 'build' ? '빌드' : tab === 'stats' ? '통계' : '타임라인'}
                                  {(matchDetailTabs.get(matchId) || 'teams') === tab && (
                                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary" />
                                  )}
                                </button>
                              ))}
                            </div>

                            {/* Teams Tab */}
                            {(matchDetailTabs.get(matchId) || 'teams') === 'teams' && (() => {
                              // Calculate carry scores for ranking
                              const allParticipants = match.info.participants;
                              const sortedByCarry = [...allParticipants].sort((a: any, b: any) => {
                                const scoreA = (a.kills * 3 + a.assists * 1.5) / Math.max(a.deaths, 1) + a.totalDamageDealtToChampions / 10000;
                                const scoreB = (b.kills * 3 + b.assists * 1.5) / Math.max(b.deaths, 1) + b.totalDamageDealtToChampions / 10000;
                                return scoreB - scoreA;
                              });
                              const carryRanks = new Map(sortedByCarry.map((p: any, idx: number) => [p.puuid, idx + 1]));

                              // Max damage for bar width calculation
                              const maxDamage = Math.max(...allParticipants.map((p: any) => p.totalDamageDealtToChampions));

                              const renderPlayerRow = (p: any, isMe: boolean, teamWon: boolean, index: number) => {
                                const pKda = p.deaths === 0 ? p.kills + p.assists : ((p.kills + p.assists) / p.deaths).toFixed(2);
                                const pCs = p.totalMinionsKilled + p.neutralMinionsKilled;
                                const pCsPerMin = (pCs / (match.info.gameDuration / 60)).toFixed(1);
                                const carryRank = carryRanks.get(p.puuid) || 10;
                                const damagePercent = (p.totalDamageDealtToChampions / maxDamage) * 100;
                                const killParticipation = ((p.kills + p.assists) / Math.max(teamKills, 1) * 100).toFixed(0);

                                // ACE/MVP 표시
                                const isAce = carryRank === 1;
                                const isMvp = carryRank <= 2 && teamWon;

                                return (
                                  <div
                                    key={p.puuid}
                                    className={`flex items-center gap-4 py-3 px-4 transition-all text-xs ${
                                      isMe
                                        ? "bg-accent-primary/[0.12] border-l-2 border-accent-primary"
                                        : index % 2 === 0
                                        ? (teamWon ? "bg-accent-success/[0.01]" : "bg-accent-danger/[0.01]")
                                        : (teamWon ? "bg-accent-success/[0.05]" : "bg-accent-danger/[0.05]")
                                    } ${!isMe && "hover:bg-bg-tertiary/40 cursor-pointer"}`}
                                    onClick={() => {
                                      if (!isMe && p.riotIdGameName && p.riotIdTagline) {
                                        navigateToSummoner(p.riotIdGameName, p.riotIdTagline);
                                      }
                                    }}
                                  >
                                    {/* Champion + Spells + Runes - Compact */}
                                    <div className="flex items-center gap-0.5">
                                      <div className="relative">
                                        <img
                                          src={getChampionIcon(p.championName)}
                                          alt={p.championName}
                                          className="w-12 h-12 rounded"
                                          onError={(e) => { e.currentTarget.src = "/placeholder-champion.png"; }}
                                        />
                                        <span className="absolute -bottom-0.5 -right-0.5 bg-bg-primary/90 text-[8px] px-0.5 rounded text-text-primary font-bold border border-bg-elevated">
                                          {p.champLevel}
                                        </span>
                                      </div>

                                      {/* Spells + Runes */}
                                      <div className="flex gap-0.5">
                                        <div className="flex flex-col gap-0.5">
                                          <img
                                            src={`https://ddragon.leagueoflegends.com/cdn/${process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1"}/img/spell/Summoner${getSummonerSpellName(p.summoner1Id)}.png`}
                                            alt="spell1"
                                            className="w-5 h-5 rounded"
                                            onError={(e) => { e.currentTarget.style.opacity = '0.3'; }}
                                          />
                                          <img
                                            src={`https://ddragon.leagueoflegends.com/cdn/${process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1"}/img/spell/Summoner${getSummonerSpellName(p.summoner2Id)}.png`}
                                            alt="spell2"
                                            className="w-5 h-5 rounded"
                                            onError={(e) => { e.currentTarget.style.opacity = '0.3'; }}
                                          />
                                        </div>
                                        <div className="flex flex-col gap-0.5">
                                          {p.perks?.styles?.[0]?.selections?.[0]?.perk && (
                                            <img
                                              src={`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/styles/${p.perks.styles[0].selections[0].perk}.png`}
                                              alt="primary rune"
                                              className="w-5 h-5 rounded-full bg-bg-primary"
                                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                            />
                                          )}
                                          {p.perks?.styles?.[1]?.style && (
                                            <img
                                              src={`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/perk-images/styles/${p.perks.styles[1].style}.png`}
                                              alt="secondary rune"
                                              className="w-3.5 h-3.5 rounded-full bg-bg-primary opacity-60"
                                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                            />
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Summoner Name */}
                                    <div className={`flex-1 min-w-0 ${isMe ? "text-accent-primary font-medium" : "text-text-primary"}`}>
                                      <span className="truncate block text-xs">
                                        {p.riotIdGameName || p.summonerName || "Unknown"}
                                        {p.riotIdTagline && <span className="text-text-tertiary text-[10px]">#{p.riotIdTagline}</span>}
                                      </span>
                                    </div>

                                    {/* ACE/MVP Badge - More Prominent */}
                                    <div className="flex items-center gap-1">
                                      {isAce && (
                                        <span className="flex-shrink-0 px-2 py-0.5 bg-gradient-to-r from-amber-500/30 to-yellow-500/30 border border-amber-400/50 text-amber-300 text-[10px] font-bold rounded">
                                          ACE
                                        </span>
                                      )}
                                      {isMvp && !isAce && (
                                        <span className="flex-shrink-0 px-2 py-0.5 bg-gradient-to-r from-blue-500/30 to-cyan-500/30 border border-blue-400/50 text-blue-300 text-[10px] font-bold rounded">
                                          MVP
                                        </span>
                                      )}
                                    </div>

                                    {/* Carry Rank + Kill Participation */}
                                    <div className="flex items-center gap-2 w-16">
                                      <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${
                                        carryRank === 1 ? "bg-amber-500/40 text-amber-200 border border-amber-400/50" :
                                        carryRank === 2 ? "bg-gray-400/40 text-gray-200 border border-gray-400/50" :
                                        carryRank === 3 ? "bg-orange-400/40 text-orange-200 border border-orange-400/50" :
                                        "bg-bg-elevated text-text-tertiary"
                                      }`}>
                                        {carryRank}
                                      </div>
                                      <div className="text-[11px] font-medium text-text-secondary">
                                        {killParticipation}%
                                      </div>
                                    </div>

                                    {/* KDA */}
                                    <div className="w-28 text-center">
                                      <div className="font-bold text-sm">
                                        {p.kills}/<span className="text-accent-danger">{p.deaths}</span>/{p.assists}
                                      </div>
                                      <div className="text-xs text-text-tertiary">{pKda} KDA</div>
                                    </div>

                                    {/* Damage */}
                                    <div className="w-32">
                                      <div className="flex justify-between text-xs mb-0.5">
                                        <span className="text-text-tertiary">딜량</span>
                                        <span className="text-accent-danger font-semibold">{(p.totalDamageDealtToChampions / 1000).toFixed(1)}k</span>
                                      </div>
                                      <div className="h-2 bg-bg-elevated rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-gradient-to-r from-red-600 to-orange-500"
                                          style={{ width: `${damagePercent}%` }}
                                        />
                                      </div>
                                    </div>

                                    {/* CS */}
                                    <div className="w-20 text-center">
                                      <div className="font-medium text-sm">{pCs}</div>
                                      <div className="text-xs text-text-tertiary">{pCsPerMin}/m</div>
                                    </div>

                                    {/* Items - Compact */}
                                    <div className="flex gap-1">
                                      {[p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6].map((item: number, idx: number) => (
                                        <div key={idx} className={`w-6 h-6 ${idx === 6 ? 'rounded-full' : 'rounded'} bg-bg-primary border border-bg-tertiary`}>
                                          {item !== 0 && (
                                            <img
                                              src={`https://ddragon.leagueoflegends.com/cdn/${process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1"}/img/item/${item}.png`}
                                              alt="item"
                                              className={`w-full h-full ${idx === 6 ? 'rounded-full' : 'rounded'}`}
                                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                            />
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              };

                              return (
                                <div className="overflow-x-auto">
                                <div className="min-w-[920px] p-3">
                                  {/* My Team Section */}
                                  <div className={`mb-1.5 rounded ${
                                    myTeamWon ? "bg-accent-success/[0.06]" : "bg-accent-danger/[0.06]"
                                  }`}>
                                    <div className={`flex items-center gap-2 text-[11px] font-bold px-3 py-1 ${
                                      myTeamWon ? "text-accent-success" : "text-accent-danger"
                                    }`}>
                                      <Shield className="h-3 w-3" />
                                      <span className={myTeamWon ? "text-accent-success" : "text-accent-danger"}>
                                        {myTeamWon ? "승리" : "패배"}
                                      </span>
                                      <span className="text-text-tertiary font-normal text-[10px]">(아군)</span>
                                      <span className="text-text-secondary font-normal text-[10px] ml-auto">
                                        {myTeam.reduce((sum: number, p: any) => sum + p.kills, 0)} / {myTeam.reduce((sum: number, p: any) => sum + p.deaths, 0)} / {myTeam.reduce((sum: number, p: any) => sum + p.assists, 0)}
                                      </span>
                                    </div>
                                    <div>
                                      {myTeam.map((p: any, idx: number) => renderPlayerRow(p, p.puuid === summoner?.puuid, myTeamWon, idx))}
                                    </div>
                                  </div>

                                  {/* Enemy Team Section */}
                                  <div className={`rounded ${
                                    !myTeamWon ? "bg-accent-success/[0.06]" : "bg-accent-danger/[0.06]"
                                  }`}>
                                    <div className={`flex items-center gap-2 text-[11px] font-bold px-3 py-1 ${
                                      !myTeamWon ? "text-accent-success" : "text-accent-danger"
                                    }`}>
                                      <Crosshair className="h-3 w-3" />
                                      <span className={!myTeamWon ? "text-accent-success" : "text-accent-danger"}>
                                        {!myTeamWon ? "승리" : "패배"}
                                      </span>
                                      <span className="text-text-tertiary font-normal text-[10px]">(적군)</span>
                                      <span className="text-text-secondary font-normal text-[10px] ml-auto">
                                        {enemyTeam.reduce((sum: number, p: any) => sum + p.kills, 0)} / {enemyTeam.reduce((sum: number, p: any) => sum + p.deaths, 0)} / {enemyTeam.reduce((sum: number, p: any) => sum + p.assists, 0)}
                                      </span>
                                    </div>
                                    <div>
                                      {enemyTeam.map((p: any, idx: number) => renderPlayerRow(p, false, !myTeamWon, idx))}
                                    </div>
                                  </div>
                                </div></div>
                              );
                            })()}

                            {/* Build Tab */}
                            {matchDetailTabs.get(matchId) === 'build' && (() => {
                              const tl = timelineData.get(matchId);
                              const isLoadingTl = timelineLoading.has(matchId);
                              const ddVer = process.env.NEXT_PUBLIC_DDRAGON_VERSION || "16.2.1";

                              // 아이템 구매 이벤트 추출
                              const itemEvents: { timestamp: number; itemId: number }[] = [];
                              if (tl?.info?.frames) {
                                for (const frame of tl.info.frames) {
                                  for (const ev of (frame.events || [])) {
                                    if (ev.type === 'ITEM_PURCHASED' && ev.participantId === participant.participantId) {
                                      itemEvents.push({ timestamp: ev.timestamp, itemId: ev.itemId });
                                    }
                                  }
                                }
                              }

                              // 분 단위로 그룹핑
                              const byMinute = new Map<number, number[]>();
                              for (const ev of itemEvents) {
                                const min = Math.floor(ev.timestamp / 60000);
                                if (!byMinute.has(min)) byMinute.set(min, []);
                                byMinute.get(min)!.push(ev.itemId);
                              }
                              const minutes = Array.from(byMinute.keys()).sort((a, b) => a - b);

                              return (
                                <div className="p-4">
                                  <h3 className="text-sm font-bold text-text-primary mb-3">아이템 구매 타임라인</h3>
                                  {isLoadingTl ? (
                                    <div className="flex items-center gap-2 text-xs text-text-secondary py-4">
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                      타임라인 불러오는 중...
                                    </div>
                                  ) : !tl ? (
                                    <div className="text-xs text-text-tertiary bg-bg-tertiary/50 p-3 rounded">
                                      타임라인 데이터를 불러올 수 없습니다.
                                    </div>
                                  ) : itemEvents.length === 0 ? (
                                    <div className="text-xs text-text-tertiary bg-bg-tertiary/50 p-3 rounded">
                                      아이템 구매 기록이 없습니다.
                                    </div>
                                  ) : (
                                    <div className="overflow-x-auto pb-1">
                                      <div className="flex items-end gap-0 min-w-max relative">
                                        {/* Timeline line */}
                                        <div className="absolute left-4 right-4 h-px bg-bg-elevated/80" style={{ bottom: '22px' }} />
                                        {minutes.map((min, idx) => (
                                          <div key={min} className="flex flex-col items-center px-2.5" style={{ minWidth: '52px' }}>
                                            {/* Items stacked vertically */}
                                            <div className="flex flex-col gap-0.5 items-center mb-1.5">
                                              {byMinute.get(min)!.map((itemId, i) => (
                                                <img
                                                  key={i}
                                                  src={`https://ddragon.leagueoflegends.com/cdn/${ddVer}/img/item/${itemId}.png`}
                                                  alt={`item ${itemId}`}
                                                  className="w-7 h-7 rounded border border-bg-tertiary/80"
                                                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                />
                                              ))}
                                            </div>
                                            {/* Dot */}
                                            <div className="w-2 h-2 rounded-full bg-bg-secondary border-2 border-text-tertiary/50 z-10 mb-1" />
                                            {/* Time label */}
                                            <span className="text-[9px] text-text-tertiary">{min}분</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  <h3 className="text-sm font-bold text-text-primary mb-3 mt-6">최종 빌드</h3>
                                  <div className="flex gap-2">
                                    {[participant.item0, participant.item1, participant.item2, participant.item3, participant.item4, participant.item5, participant.item6].map((item, idx) => (
                                      <div key={idx} className={`${idx === 6 ? 'rounded-full' : 'rounded'} bg-bg-tertiary`}>
                                        {item !== 0 ? (
                                          <img
                                            src={`https://ddragon.leagueoflegends.com/cdn/${ddVer}/img/item/${item}.png`}
                                            alt="item"
                                            className={`w-12 h-12 ${idx === 6 ? 'rounded-full' : 'rounded'} border-2 border-bg-elevated`}
                                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                          />
                                        ) : (
                                          <div className={`w-12 h-12 ${idx === 6 ? 'rounded-full' : 'rounded'} border-2 border-bg-elevated bg-bg-secondary`} />
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Stats Tab */}
                            {matchDetailTabs.get(matchId) === 'stats' && (
                              <div className="p-4">
                                <div className="grid grid-cols-2 gap-4">
                                  {/* Left Column - Combat Stats */}
                                  <div>
                                    <h3 className="text-sm font-bold text-text-primary mb-3">전투 통계</h3>
                                    <div className="space-y-2 text-xs">
                                      <div className="flex justify-between p-2 bg-bg-tertiary rounded">
                                        <span className="text-text-secondary">총 피해량</span>
                                        <span className="font-semibold text-text-primary">{(participant.totalDamageDealtToChampions).toLocaleString()}</span>
                                      </div>
                                      <div className="flex justify-between p-2 bg-bg-tertiary rounded">
                                        <span className="text-text-secondary">받은 피해량</span>
                                        <span className="font-semibold text-text-primary">{(participant.totalDamageTaken || 0).toLocaleString()}</span>
                                      </div>
                                      <div className="flex justify-between p-2 bg-bg-tertiary rounded">
                                        <span className="text-text-secondary">치유량</span>
                                        <span className="font-semibold text-text-primary">{(participant.totalHeal || 0).toLocaleString()}</span>
                                      </div>
                                      <div className="flex justify-between p-2 bg-bg-tertiary rounded">
                                        <span className="text-text-secondary">CC 시간</span>
                                        <span className="font-semibold text-text-primary">{(participant.timeCCingOthers || 0).toFixed(0)}초</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Right Column - Economy Stats */}
                                  <div>
                                    <h3 className="text-sm font-bold text-text-primary mb-3">경제 통계</h3>
                                    <div className="space-y-2 text-xs">
                                      <div className="flex justify-between p-2 bg-bg-tertiary rounded">
                                        <span className="text-text-secondary">획득 골드</span>
                                        <span className="font-semibold text-accent-gold">{(participant.goldEarned).toLocaleString()}</span>
                                      </div>
                                      <div className="flex justify-between p-2 bg-bg-tertiary rounded">
                                        <span className="text-text-secondary">분당 골드</span>
                                        <span className="font-semibold text-accent-gold">{(participant.goldEarned / (match.info.gameDuration / 60)).toFixed(0)}</span>
                                      </div>
                                      <div className="flex justify-between p-2 bg-bg-tertiary rounded">
                                        <span className="text-text-secondary">CS</span>
                                        <span className="font-semibold text-text-primary">{participant.totalMinionsKilled + participant.neutralMinionsKilled}</span>
                                      </div>
                                      <div className="flex justify-between p-2 bg-bg-tertiary rounded">
                                        <span className="text-text-secondary">분당 CS</span>
                                        <span className="font-semibold text-text-primary">{csPerMin}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                              </div>
                            )}

                            {/* Timeline Tab */}
                            {matchDetailTabs.get(matchId) === 'timeline' && (() => {
                              const tl = timelineData.get(matchId);
                              const isLoadingTl = timelineLoading.has(matchId);
                              return (
                                <div className="p-4">
                                  {isLoadingTl ? (
                                    <div className="flex items-center gap-2 text-xs text-text-secondary py-8 justify-center">
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                      타임라인 불러오는 중...
                                    </div>
                                  ) : !tl?.info?.frames ? (
                                    <div className="text-xs text-text-tertiary bg-bg-tertiary/50 p-3 rounded text-center py-8">
                                      타임라인 데이터를 불러올 수 없습니다.
                                    </div>
                                  ) : (
                                    <TimelineGraphs tl={tl} match={match} participant={participant} />
                                  )}
                                </div>
                              );
                            })()}
                          </div></div></div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 더보기 버튼 */}
              {riotMatches.length > 0 && hasMoreRiotMatches && (
                <div className="mt-4 text-center">
                  <button
                    onClick={loadMoreRiotMatches}
                    disabled={isLoadingMoreRiotMatches}
                    className="px-6 py-2 bg-bg-tertiary hover:bg-bg-elevated border border-bg-elevated rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoadingMoreRiotMatches ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        불러오는 중...
                      </span>
                    ) : (
                      "더보기"
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Champion Statistics */}
          <div className="space-y-6">
            {/* Champion Stats */}
            <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
              <h2 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
                <Sword className="h-5 w-5 text-accent-primary" />
                챔피언 통계
              </h2>

              {championStats.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-text-secondary text-sm">
                    챔피언 통계가 없습니다
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {championStats.slice(0, 5).map((stat) => {
                    const champWinRate = Math.round((stat.wins / stat.games) * 100);
                    const avgKDA =
                      stat.deaths === 0
                        ? stat.kills + stat.assists
                        : ((stat.kills + stat.assists) / stat.deaths).toFixed(2);

                    return (
                      <div
                        key={stat.championId}
                        className="flex items-center justify-between p-3 bg-bg-tertiary rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-bg-elevated rounded-full flex items-center justify-center">
                            <span className="text-xs font-bold text-text-primary">
                              {stat.championName.substring(0, 2)}
                            </span>
                          </div>
                          <div>
                            <p className="font-semibold text-text-primary text-sm">
                              {stat.championName}
                            </p>
                            <p className="text-xs text-text-tertiary">
                              {stat.wins}승 {stat.losses}패
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p
                            className={`font-bold text-sm ${
                              champWinRate >= 60
                                ? "text-accent-success"
                                : champWinRate >= 50
                                ? "text-accent-primary"
                                : "text-accent-danger"
                            }`}
                          >
                            {champWinRate}%
                          </p>
                          <p className="text-xs text-text-tertiary">
                            {avgKDA} KDA
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Ranked Champion Stats */}
            <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
              <h2 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
                <Sword className="h-5 w-5 text-accent-primary" />
                랭크 챔피언 통계
              </h2>

              {rankedChampionStats.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-text-secondary text-sm">
                    랭크 게임 챔피언 통계가 없습니다
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {rankedChampionStats.slice(0, 5).map((stat) => {
                    const champWinRate = Math.round((stat.wins / stat.games) * 100);
                    const avgKDA =
                      stat.deaths === 0
                        ? stat.kills + stat.assists
                        : ((stat.kills + stat.assists) / stat.deaths).toFixed(2);

                    return (
                      <div
                        key={stat.championId}
                        className="flex items-center justify-between p-3 bg-bg-tertiary rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                           <img
                              src={getChampionIcon(stat.championName)}
                              alt={stat.championName}
                              className="w-10 h-10 rounded-full"
                              onError={(e) => {
                                e.currentTarget.src = "/placeholder-champion.png";
                              }}
                            />
                          <div>
                            <p className="font-semibold text-text-primary text-sm">
                              {stat.championName}
                            </p>
                            <p className="text-xs text-text-tertiary">
                              {stat.wins}승 {stat.losses}패
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p
                            className={`font-bold text-sm ${
                              champWinRate >= 60
                                ? "text-accent-success"
                                : champWinRate >= 50
                                ? "text-accent-primary"
                                : "text-accent-danger"
                            }`}
                          >
                            {champWinRate}%
                          </p>
                          <p className="text-xs text-text-tertiary">
                            {avgKDA} KDA
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Overall Stats */}
            <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-6">
              <h2 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-accent-primary" />
                종합 통계
              </h2>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-text-secondary">총 게임</span>
                  <span className="font-bold text-text-primary">
                    {matches.length}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-text-secondary">플레이한 챔피언</span>
                  <span className="font-bold text-text-primary">
                    {championStats.length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
