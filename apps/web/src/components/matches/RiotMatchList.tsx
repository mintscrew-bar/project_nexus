"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { statsApi, matchApi } from "@/lib/api-client";
import {
  QUEUE_TABS,
  getChampionIcon,
  getQueueTypeName,
  getSummonerSpellName,
  calculateTimeAgo,
} from "./match-utils";
import { getDdragonVersion, itemIconUrl, runeIconUrl, fallbackTo } from "@/lib/ddragon";
import { ItemTooltip } from "@/components/ItemTooltip";
import { RuneTooltip } from "@/components/RuneTooltip";
import {
  TimelineGraphs,
  GoldDiffChart,
  ObjectEventTimeline,
} from "./MatchTimelineCharts";
import Image from "next/image";
import {
  Loader2,
  Gamepad2,
  Target,
  ChevronDown,
  ChevronUp,
  Shield,
  Crosshair,
} from "lucide-react";
import { Button } from "@/components/ui";
import { getChampionKoreanName } from "@nexus/types";


// ─── Main Component ──────────────────────────────────

interface RiotMatchListProps {
  gameName: string;
  tagLine: string;
  puuid: string;
  navigateToSummoner: (gameName: string, tagLine: string) => void;
  /** Nexus 유저 ID. 있으면 내전 여부를 대조해 "내전" 배지를 붙인다. */
  nexusUserId?: string | null;
}

const RIOT_MATCH_COUNT = 10;

export default function RiotMatchList({
  gameName,
  tagLine,
  puuid,
  navigateToSummoner,
  nexusUserId,
}: RiotMatchListProps) {
  // Nexus 내전으로 확인된 Riot 매치 ID 전체.
  // 화면용 매치 히스토리는 페이지네이션되지만 Riot 전적은 무한 스크롤되므로,
  // 그 목록을 재사용하면 오래된 내전이 "사용자 지정"으로 잘못 표시된다.
  // ID만 담은 전용 엔드포인트로 전체를 받아 대조한다.
  const { data: nexusRiotMatchIdList } = useQuery<string[]>({
    queryKey: ["nexusRiotMatchIds", nexusUserId],
    queryFn: () => matchApi.getUserRiotMatchIds(nexusUserId!),
    staleTime: 5 * 60 * 1000,
    enabled: !!nexusUserId,
  });

  const nexusRiotMatchIds = useMemo(
    () => new Set(nexusRiotMatchIdList ?? []),
    [nexusRiotMatchIdList],
  );
  const [selectedQueueId, setSelectedQueueId] = useState<number | undefined>(undefined);
  const [expandedMatches, setExpandedMatches] = useState<Set<string>>(new Set());
  const mountedMatchesRef = useRef(new Set<string>());
  const [matchDetailTabs, setMatchDetailTabs] = useState<Map<string, 'teams' | 'build' | 'stats' | 'timeline'>>(new Map());
  const [statsSubTabs, setStatsSubTabs] = useState<Map<string, 'combat' | 'farm' | 'vision'>>(new Map());
  const [timelineData, setTimelineData] = useState<Map<string, any>>(new Map());
  const [timelineLoading, setTimelineLoading] = useState<Set<string>>(new Set());
  // 아이템 아이콘 CDN 폴백용 ddragon 버전 (패치 자동 추적, ~1h 캐시)
  const [ddragonVersion, setDdragonVersion] = useState<string>("");
  useEffect(() => {
    getDdragonVersion().then(setDdragonVersion).catch(() => {});
  }, []);

  const {
    data: riotMatchPages,
    isLoading: isLoadingRiotMatches,
    isError: isRiotMatchError,
    refetch: refetchRiotMatches,
    isFetchingNextPage: isLoadingMoreRiotMatches,
    fetchNextPage: loadMoreRiotMatches,
    hasNextPage: hasMoreRiotMatches,
  } = useInfiniteQuery({
    queryKey: ["riotMatches", gameName, tagLine, selectedQueueId],
    queryFn: ({ pageParam = 0 }) =>
      statsApi.getSummonerRiotMatches(gameName, tagLine, RIOT_MATCH_COUNT, selectedQueueId, pageParam),
    getNextPageParam: (lastPage: any[], _allPages: any[][], lastPageParam: number) => {
      // 반환된 항목이 요청 수보다 적으면 마지막 페이지
      if (lastPage.length < RIOT_MATCH_COUNT) return undefined;
      return lastPageParam + RIOT_MATCH_COUNT;
    },
    initialPageParam: 0,
    staleTime: 3 * 60 * 1000,
    retry: false,
    enabled: !!gameName && !!tagLine,
  });

  const riotMatches = riotMatchPages?.pages.flat() ?? [];

  // 큐 탭 변경 시 카드 확장·탭·타임라인 상태 초기화
  const handleQueueChange = (queueId: number | undefined) => {
    setSelectedQueueId(queueId);
    setExpandedMatches(new Set());
    setMatchDetailTabs(new Map());
    setStatsSubTabs(new Map());
    setTimelineData(new Map());
    mountedMatchesRef.current = new Set();
  };

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

  const MAX_TIMELINE_CACHE = 5; // 최대 캐시 매치 수 (메모리 누수 방지)

  const loadTimeline = async (matchId: string) => {
    if (timelineData.has(matchId) || timelineLoading.has(matchId)) return;
    setTimelineLoading(prev => new Set(prev).add(matchId));
    try {
      const data = await statsApi.getMatchTimeline(matchId);
      setTimelineData(prev => {
        const next = new Map(prev).set(matchId, data);
        // 캐시 한도 초과 시 가장 오래된 항목 제거
        if (next.size > MAX_TIMELINE_CACHE) {
          const oldestKey = next.keys().next().value as string | undefined;
          if (oldestKey) next.delete(oldestKey);
        }
        return next;
      });
    } catch (err) {
      console.error("Failed to load timeline:", err);
    } finally {
      setTimelineLoading(prev => { const s = new Set(prev); s.delete(matchId); return s; });
    }
  };

  return (
    <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-3 sm:p-6">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h2 className="text-sm sm:text-xl font-bold text-text-primary flex items-center gap-2">
          <Gamepad2 className="h-4 w-4 sm:h-5 sm:w-5 text-accent-primary" />
          Riot 게임 전적
        </h2>
      </div>

      {/* Queue Type Tabs */}
      <div className="flex gap-0.5 sm:gap-1 bg-bg-tertiary/50 rounded-lg p-0.5 sm:p-1 mb-3 sm:mb-4 overflow-x-auto">
        {QUEUE_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleQueueChange(tab.queueId)}
            className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap ${
              selectedQueueId === tab.queueId
                ? "bg-accent-primary text-white"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-elevated"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Match List */}
      {isLoadingRiotMatches ? (
        <div className="text-center py-16">
          <Loader2 className="h-16 w-16 text-text-tertiary mx-auto mb-4 animate-spin" />
          <p className="text-text-secondary">Riot 전적을 불러오는 중...</p>
        </div>
      ) : isRiotMatchError ? (
        <div className="text-center py-16">
          <Gamepad2 className="h-16 w-16 text-text-tertiary mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">전적 불러오기 실패</h3>
          <p className="text-text-secondary mb-4">Riot 전적을 불러올 수 없습니다</p>
          <Button onClick={() => refetchRiotMatches()}>다시 시도</Button>
        </div>
      ) : riotMatches.length === 0 ? (
        <div className="text-center py-16">
          <Target className="h-16 w-16 text-text-tertiary mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">최근 전적이 없습니다</h3>
          <p className="text-text-secondary">최근 플레이한 게임이 없습니다</p>
        </div>
      ) : (
        <div className="divide-y divide-bg-tertiary/30">
          {riotMatches.map((match) => {
            const participant = match.info.participants.find(
              (p: any) => p.puuid === puuid
            );
            if (!participant) return null;

            const matchId = match.metadata.matchId;
            const isExpanded = expandedMatches.has(matchId);

            const kda = participant.deaths === 0
              ? "Perfect"
              : ((participant.kills + participant.assists) / participant.deaths).toFixed(2);

            const duration = match.info.gameDuration || 1;
            const gameDurationMin = Math.floor(duration / 60);
            const gameDurationSec = duration % 60;
            const csPerMin = ((participant.totalMinionsKilled + participant.neutralMinionsKilled) / (duration / 60)).toFixed(1);

            const timeAgo = calculateTimeAgo(match.info.gameEndTimestamp);

            const team = match.info.teams.find((t: any) => t.teamId === participant.teamId);
            const teamKills = team?.objectives?.champion?.kills || 1;
            const killParticipation = ((participant.kills + participant.assists) / teamKills * 100).toFixed(0);

            const myTeam = match.info.participants.filter((p: any) => p.teamId === participant.teamId);
            const enemyTeam = match.info.participants.filter((p: any) => p.teamId !== participant.teamId);
            const myTeamWon = participant.win;

            // 캐리 점수: KDA 기반 + 딜량 가중 (MVP/ACE 판정에 공통 사용)
            const getCarryScore = (p: any) =>
              (p.kills * 3 + p.assists * 1.5) / Math.max(p.deaths, 1) + p.totalDamageDealtToChampions / 10000;
            const winningTeam = myTeamWon ? myTeam : enemyTeam;
            const losingTeam = myTeamWon ? enemyTeam : myTeam;
            const mvpPuuid = [...winningTeam].sort((a, b) => getCarryScore(b) - getCarryScore(a))[0]?.puuid ?? null;
            const acePuuid = [...losingTeam].sort((a, b) => getCarryScore(b) - getCarryScore(a))[0]?.puuid ?? null;

            // ─── 특수 태그 계산 ───
            const fmtKill = (label: string, count: number) =>
              count > 1 ? `${label} x${count}` : label;
            const achievementTags: { label: string; cls: string }[] = [];
            if (participant.pentaKills > 0)
              achievementTags.push({ label: fmtKill('펜타킬', participant.pentaKills),  cls: 'bg-red-500/20 border-red-400/50 text-red-300' });
            if (participant.quadraKills > 0)
              achievementTags.push({ label: fmtKill('쿼드라킬', participant.quadraKills), cls: 'bg-orange-500/20 border-orange-400/50 text-orange-300' });
            if (participant.tripleKills > 0)
              achievementTags.push({ label: fmtKill('트리플킬', participant.tripleKills), cls: 'bg-yellow-500/20 border-yellow-400/50 text-yellow-300' });
            if (participant.doubleKills > 0)
              achievementTags.push({ label: fmtKill('더블킬', participant.doubleKills),  cls: 'bg-green-500/20 border-green-400/50 text-green-300' });
            // 리메이크: 3분 30초 미만 게임 (LP 변동 없음)
            const isRemake = duration < 210;
            if (participant.deaths === 0 && !isRemake)
              achievementTags.push({ label: '무결점', cls: 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300' });
            if (participant.firstBloodKill)
              achievementTags.push({ label: '퍼스트 블러드', cls: 'bg-rose-500/20 border-rose-400/50 text-rose-300' });
            if (participant.firstTowerKill)
              achievementTags.push({ label: '퍼스트 타워', cls: 'bg-slate-500/20 border-slate-400/50 text-slate-300' });

            return (
              <div
                key={matchId}
                className={`overflow-hidden transition-all ${isExpanded ? 'bg-bg-secondary/60' : isRemake ? 'bg-bg-tertiary/30' : participant.win ? 'bg-accent-success/[0.06]' : 'bg-accent-danger/[0.06]'}`}
              >
                {/* Match Header */}
                <div
                  className="px-3 sm:px-6 pt-3 sm:pt-5 pb-3 sm:pb-4 cursor-pointer hover:bg-bg-tertiary/30 transition-colors"
                  onClick={() => toggleMatchExpand(matchId)}
                >
                  <div className="flex items-center gap-2 sm:gap-4">
                    <Image
                      src={getChampionIcon(participant.championName)}
                      alt={participant.championName}
                      width={48}
                      height={48}
                      className="w-9 h-9 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex-shrink-0"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />

                    <div className="min-w-0 flex-shrink-0">
                      <div className="flex items-center gap-1 sm:gap-1.5 mb-0.5">
                        <span className={`font-bold text-xs sm:text-sm ${isRemake ? "text-text-tertiary" : participant.win ? "text-accent-success" : "text-accent-danger"}`}>
                          {isRemake ? "리메이크" : participant.win ? "승리" : "패배"}
                        </span>
                        <span className="text-[10px] sm:text-xs text-text-secondary truncate hidden sm:inline">{getQueueTypeName(match.info.queueId, match.info.gameType, nexusRiotMatchIds.has(matchId))}</span>
                      </div>
                      <div className="text-[10px] sm:text-xs text-text-tertiary">{gameDurationMin}:{gameDurationSec.toString().padStart(2, '0')} · {timeAgo}</div>
                      <div className="text-[10px] sm:text-xs text-text-tertiary truncate">{getChampionKoreanName(participant.championName)}</div>

                      {/* 데스크탑: 소환사 주문 + 룬 (sm 이상) */}
                      <div className="hidden sm:flex gap-0.5 items-center mt-1">
                        <Image
                          src={`/icons/spells/Summoner${getSummonerSpellName(participant.summoner1Id)}.png`}
                          alt="spell1"
                          width={14}
                          height={14}
                          className="w-3.5 h-3.5 rounded"
                          title="소환사 주문"
                          onError={(e) => { e.currentTarget.style.opacity = '0.3'; }}
                        />
                        <Image
                          src={`/icons/spells/Summoner${getSummonerSpellName(participant.summoner2Id)}.png`}
                          alt="spell2"
                          width={14}
                          height={14}
                          className="w-3.5 h-3.5 rounded"
                          title="소환사 주문"
                          onError={(e) => { e.currentTarget.style.opacity = '0.3'; }}
                        />
                        {participant.perks?.styles?.[0]?.selections?.[0]?.perk && (
                          <RuneTooltip runeId={participant.perks.styles[0].selections[0].perk}>
                            <Image
                              src={runeIconUrl({ runeId: participant.perks.styles[0].selections[0].perk })}
                                unoptimized
                              alt="keystone"
                              width={14}
                              height={14}
                              className="w-3.5 h-3.5 rounded-full bg-bg-tertiary cursor-help hover:opacity-80 transition-opacity"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          </RuneTooltip>
                        )}
                      </div>
                    </div>

                    <div className="text-center flex-shrink-0">
                      <div className="text-xs sm:text-sm font-bold text-text-primary">
                        {participant.kills}/<span className="text-accent-danger">{participant.deaths}</span>/{participant.assists}
                      </div>
                      <div className="text-[10px] sm:text-xs text-text-secondary">{kda} KDA</div>
                    </div>

                    {/* CS/킬관여 — 모바일 숨김 */}
                    <div className="hidden md:flex items-center gap-3 flex-shrink-0">
                      <div className="text-center">
                        <div className="text-sm font-medium text-text-primary">{participant.totalMinionsKilled + participant.neutralMinionsKilled}</div>
                        <div className="text-xs text-text-tertiary">CS</div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-medium text-text-primary">{killParticipation}%</div>
                        <div className="text-xs text-text-tertiary">킬관여</div>
                      </div>
                    </div>

                    {/* 아이템 — 모바일에서 축소 표시 */}
                    <div className="hidden sm:flex gap-1 flex-shrink-0 items-center">
                      {[participant.item0, participant.item1, participant.item2, participant.item3, participant.item4, participant.item5].map((item: number, idx: number) => (
                        <div key={idx} className="w-6 h-6 lg:w-8 lg:h-8 rounded-md bg-bg-tertiary border border-bg-elevated">
                          {item !== 0 && (
                            <ItemTooltip itemId={String(item)}>
                              <Image
                                src={ddragonVersion ? itemIconUrl(item, ddragonVersion) : "/icons/items/" + item + ".png"}
                                unoptimized
                                alt="item"
                                width={32}
                                height={32}
                                className="w-full h-full rounded-md"
                                onError={fallbackTo("/icons/items/" + item + ".png")}
                              />
                            </ItemTooltip>
                          )}
                        </div>
                      ))}
                      {/* 장신구 — 툴팁 적용 */}
                      <div className="w-6 h-6 lg:w-8 lg:h-8 rounded-full bg-bg-tertiary border border-bg-elevated">
                        {participant.item6 !== 0 && (
                          <ItemTooltip itemId={String(participant.item6)}>
                            <Image
                              src={ddragonVersion ? itemIconUrl(participant.item6, ddragonVersion) : "/icons/items/" + participant.item6 + ".png"}
                                unoptimized
                              alt="trinket"
                              width={32}
                              height={32}
                              className="w-full h-full rounded-full"
                              onError={fallbackTo("/icons/items/" + participant.item6 + ".png")}
                            />
                          </ItemTooltip>
                        )}
                      </div>
                      {participant.item7 != null && participant.item7 !== 0 && (
                        <div className="w-6 h-6 lg:w-8 lg:h-8 rounded-md bg-bg-tertiary border border-amber-500/40">
                          <ItemTooltip itemId={String(participant.item7)}>
                            <Image
                              src={ddragonVersion ? itemIconUrl(participant.item7, ddragonVersion) : "/icons/items/" + participant.item7 + ".png"}
                                unoptimized
                              alt="quest"
                              width={32}
                              height={32}
                              className="w-full h-full rounded-md"
                              onError={fallbackTo("/icons/items/" + participant.item7 + ".png")}
                            />
                          </ItemTooltip>
                        </div>
                      )}
                    </div>

                    <div className="flex-1" />

                    {/* 참가자 목록 — 모바일 숨김 */}
                    <div className="hidden lg:flex gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <div className="flex flex-col justify-center gap-0.5 w-24">
                        {myTeam.map((p: any) => {
                          const isMvp = p.puuid === mvpPuuid;
                          const isAce = p.puuid === acePuuid;
                          const isMe = p.puuid === puuid;
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
                      <div className="w-px bg-bg-tertiary/50 self-stretch" />
                      <div className="flex flex-col justify-center gap-0.5 w-24 min-w-0">
                        {enemyTeam.map((p: any) => {
                          const isMvp = p.puuid === mvpPuuid;
                          const isAce = p.puuid === acePuuid;
                          const name = p.riotIdGameName || p.summonerName || p.championName;
                          return (
                            <div
                              key={p.puuid}
                              className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity text-xs text-text-tertiary"
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

                    <div className="text-text-tertiary flex-shrink-0">
                      {isExpanded ? <ChevronUp className="h-4 w-4 sm:h-5 sm:w-5" /> : <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5" />}
                    </div>
                  </div>

                  {/* 모바일 전용 2행: 아이템 + CS · 킬관여 · 딜량 */}
                  <div className="flex items-center gap-2 mt-1.5 sm:hidden">
                    {/* 아이템 (item0~item5 + 장신구) */}
                    <div className="flex gap-0.5 items-center flex-shrink-0">
                      {[participant.item0, participant.item1, participant.item2, participant.item3, participant.item4, participant.item5].map((item: number, idx: number) => (
                        <div key={idx} className="w-5 h-5 rounded bg-bg-tertiary border border-bg-elevated">
                          {item !== 0 && (
                            <ItemTooltip itemId={String(item)}>
                              <Image
                                src={ddragonVersion ? itemIconUrl(item, ddragonVersion) : "/icons/items/" + item + ".png"}
                                unoptimized
                                alt="item"
                                width={20}
                                height={20}
                                className="w-full h-full rounded"
                                onError={fallbackTo("/icons/items/" + item + ".png")}
                              />
                            </ItemTooltip>
                          )}
                        </div>
                      ))}
                      <div className="w-5 h-5 rounded-full bg-bg-tertiary border border-bg-elevated">
                        {participant.item6 !== 0 && (
                          <ItemTooltip itemId={String(participant.item6)}>
                            <Image
                              src={ddragonVersion ? itemIconUrl(participant.item6, ddragonVersion) : "/icons/items/" + participant.item6 + ".png"}
                                unoptimized
                              alt="trinket"
                              width={20}
                              height={20}
                              className="w-full h-full rounded-full"
                              onError={fallbackTo("/icons/items/" + participant.item6 + ".png")}
                            />
                          </ItemTooltip>
                        )}
                      </div>
                    </div>

                    {/* CS */}
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <span className="text-[10px] text-text-tertiary">CS</span>
                      <span className="text-[10px] font-medium text-text-secondary">
                        {participant.totalMinionsKilled + participant.neutralMinionsKilled}
                      </span>
                      <span className="text-[9px] text-text-tertiary">({csPerMin}/분)</span>
                    </div>

                    {/* 킬관여 */}
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <span className="text-[10px] text-text-tertiary">킬관여</span>
                      <span className="text-[10px] font-medium text-text-secondary">{killParticipation}%</span>
                    </div>

                    {/* 딜량 */}
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <span className="text-[10px] text-text-tertiary">딜</span>
                      <span className="text-[10px] font-medium text-text-secondary">
                        {(participant.totalDamageDealtToChampions / 1000).toFixed(1)}k
                      </span>
                    </div>
                  </div>

                  {/* 특수 태그 행 (멀티킬·무결점·퍼스트) — 태그 있을 때만 표시 */}
                  {achievementTags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {achievementTags.map((tag) => (
                        <span
                          key={tag.label}
                          className={`text-[9px] font-bold px-1.5 py-px rounded border ${tag.cls}`}
                        >
                          {tag.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Expanded Content */}
                {mountedMatchesRef.current.has(matchId) && (
                  <div style={{ display: 'grid', gridTemplateRows: isExpanded ? '1fr' : '0fr', transition: 'grid-template-rows 0.2s ease' }}>
                  <div className="overflow-hidden"><div className="border-t border-bg-tertiary/40">
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
                      const allParticipants = match.info.participants;
                      // 캐리 랭킹 — 공통 getCarryScore 사용
                      const sortedByCarry = [...allParticipants].sort((a: any, b: any) =>
                        getCarryScore(b) - getCarryScore(a)
                      );
                      const carryRanks = new Map(sortedByCarry.map((p: any, idx: number) => [p.puuid, idx + 1]));
                      const maxDamage = Math.max(...allParticipants.map((p: any) => p.totalDamageDealtToChampions));

                      const renderPlayerRow = (p: any, isMe: boolean, teamWon: boolean, index: number) => {
                        const pKda = p.deaths === 0 ? p.kills + p.assists : ((p.kills + p.assists) / p.deaths).toFixed(2);
                        const pCs = p.totalMinionsKilled + p.neutralMinionsKilled;
                        const pCsPerMin = (pCs / (duration / 60)).toFixed(1);
                        const carryRank = carryRanks.get(p.puuid) || 10;
                        const damagePercent = (p.totalDamageDealtToChampions / maxDamage) * 100;
                        const pKillParticipation = ((p.kills + p.assists) / Math.max(teamKills, 1) * 100).toFixed(0);
                        // 승리팀 1등 = MVP, 패자팀 1등 = ACE (팀별 판정)
                        const isMvpRow = p.puuid === mvpPuuid;
                        const isAceRow = p.puuid === acePuuid;

                        return (
                          <div
                            key={p.puuid}
                            className={`py-1.5 lg:py-2 px-2 lg:px-4 transition-all text-xs ${
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
                            {/* 1행: 챔피언 + 이름 + 배지 + KDA + 딜량 + CS + 아이템 */}
                            <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-4">
                              {/* 챔피언 아이콘 + 스펠/룬 */}
                              <div className="flex items-center gap-0.5 flex-shrink-0">
                                <div className="relative">
                                  <Image
                                    src={getChampionIcon(p.championName)}
                                    alt={p.championName}
                                    width={48}
                                    height={48}
                                    className="w-8 h-8 sm:w-10 sm:h-10 xl:w-12 xl:h-12 rounded"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                  />
                                  <span className="absolute -bottom-0.5 -right-0.5 bg-bg-primary/90 text-[8px] px-0.5 rounded text-text-primary font-bold border border-bg-elevated">
                                    {p.champLevel}
                                  </span>
                                </div>
                                <div className="hidden lg:flex gap-0.5">
                                  <div className="flex flex-col gap-0.5">
                                    <Image
                                      src={`/icons/spells/Summoner${getSummonerSpellName(p.summoner1Id)}.png`}
                                      alt="spell1"
                                      width={20}
                                      height={20}
                                      className="w-5 h-5 rounded"
                                      onError={(e) => { e.currentTarget.style.opacity = '0.3'; }}
                                    />
                                    <Image
                                      src={`/icons/spells/Summoner${getSummonerSpellName(p.summoner2Id)}.png`}
                                      alt="spell2"
                                      width={20}
                                      height={20}
                                      className="w-5 h-5 rounded"
                                      onError={(e) => { e.currentTarget.style.opacity = '0.3'; }}
                                    />
                                  </div>
                                  <div className="flex flex-col gap-0.5">
                                    {p.perks?.styles?.[0]?.selections?.[0]?.perk && (
                                      <RuneTooltip runeId={p.perks.styles[0].selections[0].perk}>
                                        <Image
                                          src={runeIconUrl({ runeId: p.perks.styles[0].selections[0].perk })}
                                unoptimized
                                          alt="primary rune"
                                          width={20}
                                          height={20}
                                          className="w-5 h-5 rounded-full bg-bg-primary cursor-help hover:opacity-80 transition-opacity"
                                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                        />
                                      </RuneTooltip>
                                    )}
                                    {p.perks?.styles?.[1]?.style && (
                                      <RuneTooltip runeId={p.perks.styles[1].style}>
                                        <Image
                                          src={runeIconUrl({ runeId: p.perks.styles[1].style })}
                                unoptimized
                                          alt="secondary rune"
                                          width={14}
                                          height={14}
                                          className="w-3.5 h-3.5 rounded-full bg-bg-primary opacity-60 cursor-help hover:opacity-100 transition-opacity"
                                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                        />
                                      </RuneTooltip>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* 이름 + 배지 */}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1">
                                  <span className={`truncate text-[11px] sm:text-xs ${isMe ? "text-accent-primary font-medium" : "text-text-primary"}`}>
                                    {p.riotIdGameName || p.summonerName || "Unknown"}
                                    {p.riotIdTagline && <span className="text-text-tertiary text-[10px]">#{p.riotIdTagline}</span>}
                                  </span>
                                  {isMvpRow && (
                                    <span className="flex-shrink-0 px-1.5 py-px bg-gradient-to-r from-yellow-500/30 to-amber-500/30 border border-yellow-400/50 text-yellow-300 text-[9px] font-bold rounded">MVP</span>
                                  )}
                                  {isAceRow && (
                                    <span className="flex-shrink-0 px-1.5 py-px bg-gradient-to-r from-purple-500/30 to-violet-500/30 border border-purple-400/50 text-purple-300 text-[9px] font-bold rounded">ACE</span>
                                  )}
                                </div>
                              </div>

                              {/* 캐리 순위 - xl에서만 표시 */}
                              <div className="hidden xl:flex items-center gap-2 w-16">
                                <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${
                                  carryRank === 1 ? "bg-amber-500/40 text-amber-200 border border-amber-400/50" :
                                  carryRank === 2 ? "bg-gray-400/40 text-gray-200 border border-gray-400/50" :
                                  carryRank === 3 ? "bg-orange-400/40 text-orange-200 border border-orange-400/50" :
                                  "bg-bg-elevated text-text-tertiary"
                                }`}>
                                  {carryRank}
                                </div>
                                <div className="text-[11px] font-medium text-text-secondary">{pKillParticipation}%</div>
                              </div>

                              {/* KDA */}
                              <div className="w-16 sm:w-20 lg:w-28 text-center flex-shrink-0">
                                <div className="font-bold text-[11px] sm:text-sm">{p.kills}/<span className="text-accent-danger">{p.deaths}</span>/{p.assists}</div>
                                <div className="text-[9px] sm:text-xs text-text-tertiary">{pKda} KDA</div>
                              </div>

                              {/* 딜량 바 - lg에서만 표시 */}
                              <div className="hidden lg:block w-32 flex-shrink-0">
                                <div className="flex justify-between text-xs mb-0.5">
                                  <span className="text-text-tertiary">딜량</span>
                                  <span className="text-accent-danger font-semibold">{(p.totalDamageDealtToChampions / 1000).toFixed(1)}k</span>
                                </div>
                                <div className="h-2 bg-bg-elevated rounded-full overflow-hidden">
                                  <div className="h-full bg-gradient-to-r from-red-600 to-orange-500" style={{ width: `${damagePercent}%` }} />
                                </div>
                              </div>

                              {/* CS - lg에서만 표시 */}
                              <div className="hidden lg:block w-20 text-center flex-shrink-0">
                                <div className="font-medium text-sm">{pCs}</div>
                                <div className="text-xs text-text-tertiary">{pCsPerMin}/m</div>
                              </div>

                              {/* 아이템 */}
                              <div className="flex gap-0.5 lg:gap-1 flex-shrink-0 items-center">
                                {[p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6].map((item: number, idx: number) => (
                                  <div key={idx} className={`w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 ${idx === 6 ? 'rounded-full' : 'rounded'} bg-bg-primary border border-bg-tertiary`}>
                                    {item !== 0 && (
                                      <ItemTooltip itemId={String(item)}>
                                        <Image
                                          src={ddragonVersion ? itemIconUrl(item, ddragonVersion) : "/icons/items/" + item + ".png"}
                                unoptimized
                                          alt="item"
                                          width={24}
                                          height={24}
                                          className={`w-full h-full ${idx === 6 ? 'rounded-full' : 'rounded'}`}
                                          onError={fallbackTo("/icons/items/" + item + ".png")}
                                        />
                                      </ItemTooltip>
                                    )}
                                  </div>
                                ))}
                                {p.item7 != null && p.item7 !== 0 && (
                                  <div className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 rounded bg-bg-primary border border-amber-500/40">
                                    <ItemTooltip itemId={String(p.item7)}>
                                      <Image
                                        src={ddragonVersion ? itemIconUrl(p.item7, ddragonVersion) : "/icons/items/" + p.item7 + ".png"}
                                unoptimized
                                        alt="quest"
                                        width={24}
                                        height={24}
                                        className="w-full h-full rounded"
                                        onError={fallbackTo("/icons/items/" + p.item7 + ".png")}
                                      />
                                    </ItemTooltip>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* 2행: 모바일 전용 - 스펠/룬 + CS + 딜량 */}
                            <div className="flex items-center gap-2 mt-1 pl-[calc(2rem+6px)] sm:pl-[calc(2.5rem+6px)] lg:hidden">
                              {/* 소환사 주문 */}
                              <div className="flex gap-0.5 items-center flex-shrink-0">
                                <Image
                                  src={`/icons/spells/Summoner${getSummonerSpellName(p.summoner1Id)}.png`}
                                  alt="spell1"
                                  width={16}
                                  height={16}
                                  className="w-4 h-4 rounded"
                                  onError={(e) => { e.currentTarget.style.opacity = '0.3'; }}
                                />
                                <Image
                                  src={`/icons/spells/Summoner${getSummonerSpellName(p.summoner2Id)}.png`}
                                  alt="spell2"
                                  width={16}
                                  height={16}
                                  className="w-4 h-4 rounded"
                                  onError={(e) => { e.currentTarget.style.opacity = '0.3'; }}
                                />
                                {p.perks?.styles?.[0]?.selections?.[0]?.perk && (
                                  <Image
                                    src={runeIconUrl({ runeId: p.perks.styles[0].selections[0].perk })}
                                unoptimized
                                    alt="rune"
                                    width={16}
                                    height={16}
                                    className="w-4 h-4 rounded-full bg-bg-primary"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                  />
                                )}
                              </div>
                              <span className="text-[10px] text-text-secondary">{pCs} CS ({pCsPerMin}/m)</span>
                              <span className="text-[10px] text-accent-danger">{(p.totalDamageDealtToChampions / 1000).toFixed(1)}k 딜량</span>
                              <span className="text-[10px] text-text-tertiary">킬관여 {pKillParticipation}%</span>
                            </div>
                          </div>
                        );
                      };

                      return (
                        <div className="overflow-x-auto">
                        <div className="min-w-0 w-full p-2 sm:p-3">
                          <div className={`mb-1.5 rounded ${myTeamWon ? "bg-accent-success/[0.06]" : "bg-accent-danger/[0.06]"}`}>
                            <div className={`flex items-center gap-2 text-[11px] font-bold px-3 py-1 ${myTeamWon ? "text-accent-success" : "text-accent-danger"}`}>
                              <Shield className="h-3 w-3" />
                              <span>{myTeamWon ? "승리" : "패배"}</span>
                              <span className="text-text-tertiary font-normal text-[10px]">(아군)</span>
                              <span className="text-text-secondary font-normal text-[10px] ml-auto">
                                {myTeam.reduce((sum: number, p: any) => sum + p.kills, 0)} / {myTeam.reduce((sum: number, p: any) => sum + p.deaths, 0)} / {myTeam.reduce((sum: number, p: any) => sum + p.assists, 0)}
                              </span>
                            </div>
                            <div>{myTeam.map((p: any, idx: number) => renderPlayerRow(p, p.puuid === puuid, myTeamWon, idx))}</div>
                          </div>
                          <div className={`rounded ${!myTeamWon ? "bg-accent-success/[0.06]" : "bg-accent-danger/[0.06]"}`}>
                            <div className={`flex items-center gap-2 text-[11px] font-bold px-3 py-1 ${!myTeamWon ? "text-accent-success" : "text-accent-danger"}`}>
                              <Crosshair className="h-3 w-3" />
                              <span>{!myTeamWon ? "승리" : "패배"}</span>
                              <span className="text-text-tertiary font-normal text-[10px]">(적군)</span>
                              <span className="text-text-secondary font-normal text-[10px] ml-auto">
                                {enemyTeam.reduce((sum: number, p: any) => sum + p.kills, 0)} / {enemyTeam.reduce((sum: number, p: any) => sum + p.deaths, 0)} / {enemyTeam.reduce((sum: number, p: any) => sum + p.assists, 0)}
                              </span>
                            </div>
                            <div>{enemyTeam.map((p: any, idx: number) => renderPlayerRow(p, false, !myTeamWon, idx))}</div>
                          </div>
                        </div></div>
                      );
                    })()}

                    {/* Build Tab */}
                    {matchDetailTabs.get(matchId) === 'build' && (() => {
                      const tl = timelineData.get(matchId);
                      const isLoadingTl = timelineLoading.has(matchId);

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
                            <div className="text-xs text-text-tertiary bg-bg-tertiary/50 p-3 rounded">타임라인 데이터를 불러올 수 없습니다.</div>
                          ) : itemEvents.length === 0 ? (
                            <div className="text-xs text-text-tertiary bg-bg-tertiary/50 p-3 rounded">아이템 구매 기록이 없습니다.</div>
                          ) : (
                            <div className="overflow-x-auto pb-1">
                              <div className="flex items-end gap-0 min-w-max relative">
                                <div className="absolute left-4 right-4 h-px bg-bg-elevated/80" style={{ bottom: '22px' }} />
                                {minutes.map((min) => (
                                  <div key={min} className="flex flex-col items-center px-2.5" style={{ minWidth: '52px' }}>
                                    <div className="flex flex-col gap-0.5 items-center mb-1.5">
                                      {byMinute.get(min)!.map((itemId, i) => (
                                        <ItemTooltip key={i} itemId={String(itemId)}>
                                          <Image
                                            src={ddragonVersion ? itemIconUrl(itemId, ddragonVersion) : "/icons/items/" + itemId + ".png"}
                                unoptimized
                                            alt={`item ${itemId}`}
                                            width={28}
                                            height={28}
                                            className="w-7 h-7 rounded border border-bg-tertiary/80"
                                            onError={fallbackTo("/icons/items/" + itemId + ".png")}
                                          />
                                        </ItemTooltip>
                                      ))}
                                    </div>
                                    <div className="w-2 h-2 rounded-full bg-bg-secondary border-2 border-text-tertiary/50 z-10 mb-1" />
                                    <span className="text-[9px] text-text-tertiary">{min}분</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <h3 className="text-sm font-bold text-text-primary mb-3 mt-6">최종 빌드</h3>
                          <div className="flex gap-2 items-center">
                            {[participant.item0, participant.item1, participant.item2, participant.item3, participant.item4, participant.item5, participant.item6].map((item: number, idx: number) => (
                              <div key={idx} className={`${idx === 6 ? 'rounded-full' : 'rounded'} bg-bg-tertiary`}>
                                {item !== 0 ? (
                                  <ItemTooltip itemId={String(item)}>
                                    <Image
                                      src={ddragonVersion ? itemIconUrl(item, ddragonVersion) : "/icons/items/" + item + ".png"}
                                unoptimized
                                      alt="item"
                                      width={48}
                                      height={48}
                                      className={`w-12 h-12 ${idx === 6 ? 'rounded-full' : 'rounded'} border-2 border-bg-elevated`}
                                      onError={fallbackTo("/icons/items/" + item + ".png")}
                                    />
                                  </ItemTooltip>
                                ) : (
                                  <div className={`w-12 h-12 ${idx === 6 ? 'rounded-full' : 'rounded'} border-2 border-bg-elevated bg-bg-secondary`} />
                                )}
                              </div>
                            ))}
                            {participant.item7 != null && participant.item7 !== 0 && (
                              <div className="rounded bg-bg-tertiary">
                                <ItemTooltip itemId={String(participant.item7)}>
                                  <Image
                                    src={ddragonVersion ? itemIconUrl(participant.item7, ddragonVersion) : "/icons/items/" + participant.item7 + ".png"}
                                unoptimized
                                    alt="quest"
                                    width={48}
                                    height={48}
                                    className="w-12 h-12 rounded border-2 border-amber-500/40"
                                    onError={fallbackTo("/icons/items/" + participant.item7 + ".png")}
                                  />
                                </ItemTooltip>
                              </div>
                            )}
                          </div>

                          {/* 룬 섹션 */}
                          {participant.perks?.styles?.length > 0 && (() => {
                            const primaryStyle = participant.perks.styles[0];
                            const secondaryStyle = participant.perks.styles[1];
                            const statPerks = participant.perks.statPerks;

                            return (
                              <div className="mt-6">
                                <h3 className="text-sm font-bold text-text-primary mb-3">룬</h3>
                                <div className="flex gap-6 flex-wrap">
                                  {/* 주 특성 */}
                                  <div className="flex flex-col gap-2">
                                    <div className="text-[10px] text-text-tertiary uppercase tracking-wide mb-1">주 특성</div>
                                    <div className="flex items-center gap-2">
                                      {/* 스타일 아이콘 */}
                                      {primaryStyle?.style && (
                                        <RuneTooltip runeId={primaryStyle.style}>
                                          <Image
                                            src={runeIconUrl({ runeId: primaryStyle.style })}
                                unoptimized
                                            alt="primary style"
                                            width={28}
                                            height={28}
                                            className="w-7 h-7 opacity-60"
                                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                          />
                                        </RuneTooltip>
                                      )}
                                      {/* 키스톤 + 일반 룬 */}
                                      {primaryStyle?.selections?.map((sel: any, i: number) => (
                                        <RuneTooltip key={sel.perk} runeId={sel.perk}>
                                          <Image
                                            src={runeIconUrl({ runeId: sel.perk })}
                                unoptimized
                                            alt={`perk ${sel.perk}`}
                                            width={i === 0 ? 36 : 24}
                                            height={i === 0 ? 36 : 24}
                                            className={`${i === 0 ? 'w-9 h-9' : 'w-6 h-6'} rounded-full bg-bg-tertiary`}
                                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                          />
                                        </RuneTooltip>
                                      ))}
                                    </div>
                                  </div>

                                  {/* 보조 특성 */}
                                  {secondaryStyle && (
                                    <div className="flex flex-col gap-2">
                                      <div className="text-[10px] text-text-tertiary uppercase tracking-wide mb-1">보조 특성</div>
                                      <div className="flex items-center gap-2">
                                        {secondaryStyle.style && (
                                          <RuneTooltip runeId={secondaryStyle.style}>
                                            <Image
                                              src={runeIconUrl({ runeId: secondaryStyle.style })}
                                unoptimized
                                              alt="secondary style"
                                              width={24}
                                              height={24}
                                              className="w-6 h-6 opacity-60"
                                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                            />
                                          </RuneTooltip>
                                        )}
                                        {secondaryStyle.selections?.map((sel: any) => (
                                          <RuneTooltip key={sel.perk} runeId={sel.perk}>
                                            <Image
                                              src={runeIconUrl({ runeId: sel.perk })}
                                unoptimized
                                              alt={`perk ${sel.perk}`}
                                              width={24}
                                              height={24}
                                              className="w-6 h-6 rounded-full bg-bg-tertiary"
                                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                            />
                                          </RuneTooltip>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* 스탯 파편 */}
                                  {statPerks && (
                                    <div className="flex flex-col gap-2">
                                      <div className="text-[10px] text-text-tertiary uppercase tracking-wide mb-1">스탯 파편</div>
                                      <div className="flex items-center gap-2">
                                        {[statPerks.offense, statPerks.flex, statPerks.defense].map((perkId: number, i: number) => perkId ? (
                                          <RuneTooltip key={i} runeId={perkId}>
                                            <Image
                                              src={runeIconUrl({ runeId: perkId })}
                                unoptimized
                                              alt={`stat shard ${perkId}`}
                                              width={20}
                                              height={20}
                                              className="w-5 h-5 rounded-full bg-bg-tertiary"
                                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                            />
                                          </RuneTooltip>
                                        ) : null)}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })()}

                    {/* Stats Tab */}
                    {matchDetailTabs.get(matchId) === 'stats' && (() => {
                      const allP = match.info.participants;
                      const activeStatSub = statsSubTabs.get(matchId) || 'combat';

                      // 카테고리별 통계 정의
                      const statCategories = {
                        combat: [
                          { label: '총 피해량',   getValue: (p: any) => p.totalDamageDealtToChampions || 0, format: (v: number) => v.toLocaleString(),      color: 'from-red-600 to-orange-500' },
                          { label: '받은 피해량', getValue: (p: any) => p.totalDamageTaken || 0,             format: (v: number) => v.toLocaleString(),      color: 'from-blue-600 to-cyan-500' },
                          { label: '치유량',      getValue: (p: any) => p.totalHeal || 0,                   format: (v: number) => v.toLocaleString(),      color: 'from-green-600 to-emerald-500' },
                          { label: 'CC 시간',     getValue: (p: any) => p.timeCCingOthers || 0,             format: (v: number) => `${v.toFixed(0)}초`,    color: 'from-purple-600 to-violet-500' },
                        ],
                        farm: [
                          { label: 'CS',      getValue: (p: any) => (p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0),                                           format: (v: number) => String(Math.round(v)), color: 'from-teal-600 to-cyan-500' },
                          { label: '분당 CS', getValue: (p: any) => ((p.totalMinionsKilled || 0) + (p.neutralMinionsKilled || 0)) / Math.max(duration / 60, 1),            format: (v: number) => v.toFixed(1),          color: 'from-teal-600 to-cyan-500' },
                          { label: '획득 골드', getValue: (p: any) => p.goldEarned || 0,                                                                                   format: (v: number) => v.toLocaleString(),    color: 'from-yellow-600 to-amber-500' },
                          { label: '분당 골드', getValue: (p: any) => (p.goldEarned || 0) / Math.max(duration / 60, 1),                                                    format: (v: number) => v.toFixed(0),          color: 'from-yellow-600 to-amber-500' },
                        ],
                        vision: [
                          { label: '시야 점수',     getValue: (p: any) => p.visionScore || 0,          format: (v: number) => String(Math.round(v)), color: 'from-indigo-600 to-blue-500' },
                          { label: '와드 설치',     getValue: (p: any) => p.wardsPlaced || 0,           format: (v: number) => `${Math.round(v)}개`,  color: 'from-indigo-600 to-blue-500' },
                          { label: '와드 제거',     getValue: (p: any) => p.wardsKilled || 0,           format: (v: number) => `${Math.round(v)}개`,  color: 'from-violet-600 to-purple-500' },
                          { label: '제어 와드',     getValue: (p: any) => p.detectorWardsPlaced || 0,   format: (v: number) => `${Math.round(v)}개`,  color: 'from-violet-600 to-purple-500' },
                        ],
                      } as const;

                      const SUB_TABS: { key: keyof typeof statCategories; label: string }[] = [
                        { key: 'combat', label: '전투' },
                        { key: 'farm',   label: '파밍' },
                        { key: 'vision', label: '시야' },
                      ];

                      const activeDefs = statCategories[activeStatSub];

                      return (
                        <div className="p-3 sm:p-4">
                          {/* 서브탭 */}
                          <div className="flex gap-1 mb-3 bg-bg-elevated/50 rounded-lg p-0.5 w-fit">
                            {SUB_TABS.map(({ key, label }) => (
                              <button
                                key={key}
                                onClick={() => {
                                  const next = new Map(statsSubTabs);
                                  next.set(matchId, key);
                                  setStatsSubTabs(next);
                                }}
                                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                                  activeStatSub === key
                                    ? 'bg-accent-primary text-white'
                                    : 'text-text-secondary hover:text-text-primary'
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>

                          {/* 통계 그리드 */}
                          <div className="grid grid-cols-2 gap-3">
                            {activeDefs.map((stat) => {
                              const values = allP.map((p: any) => ({ puuid: p.puuid, name: p.riotIdGameName || p.championName, val: stat.getValue(p) }));
                              const sorted = [...values].sort((a, b) => b.val - a.val);
                              const maxVal = sorted[0]?.val || 1;
                              const myVal = stat.getValue(participant);
                              const myRank = sorted.findIndex(v => v.puuid === participant.puuid) + 1;

                              return (
                                <div key={stat.label} className="bg-bg-tertiary/50 rounded-lg p-2.5">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs text-text-secondary font-medium">{stat.label}</span>
                                    <div className="flex items-center gap-1.5">
                                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                        myRank === 1 ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30' :
                                        myRank <= 3 ? 'bg-accent-primary/15 text-accent-primary border border-accent-primary/30' :
                                        'bg-bg-elevated text-text-tertiary'
                                      }`}>
                                        #{myRank}
                                      </span>
                                      <span className="text-xs font-bold text-text-primary">{stat.format(myVal)}</span>
                                    </div>
                                  </div>
                                  <div className="space-y-0.5">
                                    {sorted.map((v) => {
                                      const isMe = v.puuid === participant.puuid;
                                      const pct = maxVal > 0 ? (v.val / maxVal) * 100 : 0;
                                      return (
                                        <div key={v.puuid} className="flex items-center gap-1.5 group">
                                          <span className={`text-[9px] w-[52px] truncate ${isMe ? 'text-accent-primary font-bold' : 'text-text-tertiary'}`}>
                                            {v.name}
                                          </span>
                                          <div className="flex-1 h-[6px] bg-bg-elevated rounded-full overflow-hidden">
                                            <div
                                              className={`h-full rounded-full transition-all ${isMe ? `bg-gradient-to-r ${stat.color}` : 'bg-text-tertiary/20'}`}
                                              style={{ width: `${pct}%` }}
                                            />
                                          </div>
                                          <span className={`text-[9px] w-10 text-right ${isMe ? 'text-text-primary font-medium' : 'text-text-tertiary/60'}`}>
                                            {stat.format(v.val)}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

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
                            <>
                              <TimelineGraphs tl={tl} match={match} participant={participant} />
                              <GoldDiffChart tl={tl} participant={participant} match={match} />
                              <ObjectEventTimeline tl={tl} participant={participant} />
                            </>
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

      {/* 같이 플레이한 사람 */}
      {riotMatches.length >= 3 && (() => {
        // 팀 동료 빈도 집계 (리메이크 제외)
        const duoMap = new Map<string, { gameName: string; tagLine: string; games: number; wins: number }>();
        for (const match of riotMatches) {
          const me = match.info.participants.find((p: any) => p.puuid === puuid);
          if (!me) continue;
          const gameDur = match.info.gameDuration || 0;
          if (gameDur < 210) continue; // 리메이크 제외
          const teammates = match.info.participants.filter(
            (p: any) => p.teamId === me.teamId && p.puuid !== puuid
          );
          for (const p of teammates) {
            if (!p.riotIdGameName || !p.riotIdTagline) continue;
            const key = `${p.riotIdGameName}#${p.riotIdTagline}`;
            const prev = duoMap.get(key) ?? { gameName: p.riotIdGameName, tagLine: p.riotIdTagline, games: 0, wins: 0 };
            duoMap.set(key, {
              ...prev,
              games: prev.games + 1,
              wins: prev.wins + (me.win ? 1 : 0),
            });
          }
        }
        // 2판 이상 같이 플레이한 사람만 표시, 최대 8명
        const duos = Array.from(duoMap.values())
          .filter(d => d.games >= 2)
          .sort((a, b) => b.games - a.games)
          .slice(0, 8);

        if (!duos.length) return null;

        return (
          <div className="mt-6 pt-6 border-t border-bg-tertiary/50">
            <h3 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-accent-primary" />
              같이 플레이한 사람
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {duos.map((duo) => {
                const winRate = Math.round((duo.wins / duo.games) * 100);
                return (
                  <div
                    key={`${duo.gameName}#${duo.tagLine}`}
                    className="flex items-center gap-2 p-2 bg-bg-tertiary/40 rounded-lg cursor-pointer hover:bg-bg-tertiary/70 transition-colors"
                    onClick={() => navigateToSummoner(duo.gameName, duo.tagLine)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-text-primary truncate">{duo.gameName}</div>
                      <div className="text-[10px] text-text-tertiary">#{duo.tagLine}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs font-bold text-text-primary">{duo.games}판</div>
                      <div className={`text-[10px] font-medium ${winRate >= 60 ? 'text-accent-success' : winRate >= 50 ? 'text-blue-400' : 'text-text-tertiary'}`}>
                        {winRate}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Load More Button */}
      {riotMatches.length > 0 && hasMoreRiotMatches && (
        <div className="mt-4 text-center">
          <button
            onClick={() => loadMoreRiotMatches()}
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
  );
}
