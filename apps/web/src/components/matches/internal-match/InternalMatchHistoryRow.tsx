"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronDown, ChevronUp } from "lucide-react";
import { getChampionKoreanName } from "@nexus/types";
import { useQuery } from "@tanstack/react-query";
import {
  calculateTimeAgo,
  getChampionIcon,
  getSummonerSpellIcon,
  type NexusMatchHistory,
} from "@/components/matches/match-utils";
import {
  fallbackTo,
  getDdragonVersion,
  itemIconUrl,
  runeIconUrl,
} from "@/lib/ddragon";
import { ItemTooltip } from "@/components/ItemTooltip";
import { RuneTooltip } from "@/components/RuneTooltip";
import { InternalMatchExpand } from "./InternalMatchExpand";

/**
 * 넥서스 유저 전적의 "내전 기록" 한 줄.
 *
 * 일반(Riot) 전적 목록(RiotMatchList)의 행과 같은 모양·같은 동작으로 맞춘다.
 * 누르면 그 자리에서 펼쳐지고, 펼친 내용은 내전 상세 페이지와 같은 화면이다.
 * (예전에는 카드 모양이 달랐고 누르면 상세 페이지로 넘어갔다)
 */
/** Riot 라인 표기 → 한글 */
const POSITION_KO: Record<string, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MIDDLE: "미드",
  MID: "미드",
  BOTTOM: "원딜",
  ADC: "원딜",
  UTILITY: "서포터",
  SUPPORT: "서포터",
};

export function InternalMatchHistoryRow({
  match,
}: {
  match: NexusMatchHistory;
}) {
  const [expanded, setExpanded] = useState(false);
  // 한 번 펼친 뒤에는 접어도 내용을 남겨 다시 펼칠 때 재조회하지 않는다
  const [mounted, setMounted] = useState(false);
  const p = match.participant;
  // 아이템 아이콘 경로용 Data Dragon 버전 — 화면 전체가 한 번만 받는다
  const { data: ddragonVersion = "" } = useQuery({
    queryKey: ["ddragonVersion"],
    queryFn: getDdragonVersion,
    staleTime: Infinity,
  });
  const duration = match.match.gameDuration ?? null;
  const durationLabel = duration
    ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`
    : null;
  const csPerMin =
    duration && p.cs != null ? (p.cs / (duration / 60)).toFixed(1) : null;
  const itemSrc = (id: number) =>
    ddragonVersion ? itemIconUrl(id, ddragonVersion) : `/icons/items/${id}.png`;
  const timeAgo = match.match.completedAt
    ? calculateTimeAgo(new Date(match.match.completedAt).getTime())
    : "";

  return (
    <div
      // 줄마다 떨어진 둥근 칸 — 테두리·막대 없이 승패 색을 옅게 깐 바탕과 간격으로 구분
      className={`overflow-hidden rounded-xl transition-colors ${
        expanded
          ? "bg-bg-tertiary/40"
          : p.win
            ? "bg-accent-success/[0.08]"
            : "bg-accent-danger/[0.08]"
      }`}
    >
      <button
        type="button"
        onClick={() => {
          setMounted(true);
          setExpanded((v) => !v);
        }}
        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 text-left hover:bg-bg-tertiary/30 transition-colors"
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <Image
            src={getChampionIcon(p.championName)}
            alt={p.championName}
            width={48}
            height={48}
            className="w-9 h-9 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex-shrink-0"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <div className="min-w-[150px] flex-1 whitespace-nowrap">
            {/* 1줄 — 승패 · 내전 · 라인 · 경기 시간 · 언제 */}
            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-text-tertiary">
              <span
                className={`font-bold text-xs sm:text-sm ${
                  p.win ? "text-accent-success" : "text-accent-danger"
                }`}
              >
                {p.win ? "승리" : "패배"}
              </span>
              <span className="text-text-secondary">내전</span>
              {p.position && (
                <span>· {POSITION_KO[p.position] ?? p.position}</span>
              )}
              {durationLabel && <span>· {durationLabel}</span>}
              {timeAgo && <span className="truncate">· {timeAgo}</span>}
            </div>
            {/* 2줄 — 챔피언 이름·레벨, 이어서 소환사 주문 2개 + 핵심 룬 (한 줄) */}
            <div className="mt-1 flex items-center gap-1.5">
              <span className="truncate text-xs sm:text-sm font-semibold text-text-primary">
                {getChampionKoreanName(p.championName)}
              </span>
              {p.champLevel ? (
                <span className="text-[10px] sm:text-xs text-text-tertiary">
                  Lv.{p.champLevel}
                </span>
              ) : null}
              <span className="hidden sm:flex items-center gap-0.5">
                {[p.summoner1Id, p.summoner2Id].map((id, i) =>
                  id ? (
                    <Image
                      key={i}
                      src={getSummonerSpellIcon(id)}
                      alt="소환사 주문"
                      width={18}
                      height={18}
                      className="w-[18px] h-[18px] rounded"
                      onError={(e) => {
                        e.currentTarget.style.opacity = "0.3";
                      }}
                    />
                  ) : null,
                )}
                {p.keystone && (
                  <RuneTooltip runeId={p.keystone}>
                    <Image
                      src={runeIconUrl({ runeId: p.keystone })}
                      unoptimized
                      alt="핵심 룬"
                      width={18}
                      height={18}
                      className="w-[18px] h-[18px] rounded-full bg-bg-tertiary"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </RuneTooltip>
                )}
              </span>
            </div>
          </div>
          <div className="text-center flex-shrink-0">
            <div className="text-xs sm:text-sm font-bold text-text-primary">
              {p.kills}/<span className="text-accent-danger">{p.deaths}</span>/
              {p.assists}
            </div>
            <div className="text-[10px] sm:text-xs text-text-secondary">
              {p.kda.toFixed(2)} KDA
            </div>
          </div>
          {/* CS·킬관여 — 모바일 숨김 */}
          {p.cs != null && (
            <div className="hidden 2xl:flex items-center gap-3 flex-shrink-0">
              <div className="text-center">
                <div className="text-sm font-medium text-text-primary">
                  {p.cs}
                </div>
                <div className="text-xs text-text-tertiary">
                  CS{csPerMin && ` (${csPerMin})`}
                </div>
              </div>
              {p.killParticipation != null && (
                <div className="text-center">
                  <div className="text-sm font-medium text-text-primary">
                    {p.killParticipation}%
                  </div>
                  <div className="text-xs text-text-tertiary">킬관여</div>
                </div>
              )}
            </div>
          )}
          {/* 아이템 6칸 + 장신구 — 일반 전적 줄과 같은 모양 */}
          {p.items && (
            <div className="hidden sm:flex gap-1 flex-shrink-0 items-center">
              {p.items.map((item, idx) => (
                <div
                  key={idx}
                  className="w-6 h-6 xl:w-7 xl:h-7 rounded-md bg-bg-tertiary border border-bg-elevated"
                >
                  {item !== 0 && (
                    <ItemTooltip itemId={String(item)}>
                      <Image
                        src={itemSrc(item)}
                        unoptimized
                        alt="아이템"
                        width={32}
                        height={32}
                        className="w-full h-full rounded-md"
                        onError={fallbackTo(`/icons/items/${item}.png`)}
                      />
                    </ItemTooltip>
                  )}
                </div>
              ))}
              <div className="w-6 h-6 xl:w-7 xl:h-7 rounded-full bg-bg-tertiary border border-bg-elevated">
                {!!p.trinket && (
                  <ItemTooltip itemId={String(p.trinket)}>
                    <Image
                      src={itemSrc(p.trinket)}
                      unoptimized
                      alt="장신구"
                      width={32}
                      height={32}
                      className="w-full h-full rounded-full"
                      onError={fallbackTo(`/icons/items/${p.trinket}.png`)}
                    />
                  </ItemTooltip>
                )}
              </div>
            </div>
          )}
          <div className="text-text-tertiary flex-shrink-0">
            {expanded ? (
              <ChevronUp className="h-4 w-4 sm:h-5 sm:w-5" />
            ) : (
              <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5" />
            )}
          </div>
        </div>
      </button>

      {mounted && (
        <div
          style={{
            display: "grid",
            gridTemplateRows: expanded ? "1fr" : "0fr",
            transition: "grid-template-rows 0.2s ease",
          }}
        >
          <div className="overflow-hidden">
            <div className="border-t border-bg-tertiary/40 p-3 sm:p-4">
              <InternalMatchExpand matchId={match.matchId} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
