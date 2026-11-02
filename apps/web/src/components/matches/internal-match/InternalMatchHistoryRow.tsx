"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronDown, ChevronUp } from "lucide-react";
import { getChampionKoreanName } from "@nexus/types";
import {
  calculateTimeAgo,
  getChampionIcon,
  type NexusMatchHistory,
} from "@/components/matches/match-utils";
import { InternalMatchExpand } from "./InternalMatchExpand";

/**
 * 넥서스 유저 전적의 "내전 기록" 한 줄.
 *
 * 일반(Riot) 전적 목록(RiotMatchList)의 행과 같은 모양·같은 동작으로 맞춘다.
 * 누르면 그 자리에서 펼쳐지고, 펼친 내용은 내전 상세 페이지와 같은 화면이다.
 * (예전에는 카드 모양이 달랐고 누르면 상세 페이지로 넘어갔다)
 */
export function InternalMatchHistoryRow({
  match,
}: {
  match: NexusMatchHistory;
}) {
  const [expanded, setExpanded] = useState(false);
  // 한 번 펼친 뒤에는 접어도 내용을 남겨 다시 펼칠 때 재조회하지 않는다
  const [mounted, setMounted] = useState(false);
  const p = match.participant;
  const timeAgo = match.match.completedAt
    ? calculateTimeAgo(new Date(match.match.completedAt).getTime())
    : "";

  return (
    <div
      className={`overflow-hidden transition-all ${
        expanded
          ? "bg-bg-secondary/60"
          : p.win
            ? "bg-accent-success/[0.06]"
            : "bg-accent-danger/[0.06]"
      }`}
    >
      <button
        type="button"
        onClick={() => {
          setMounted(true);
          setExpanded((v) => !v);
        }}
        className="w-full px-3 sm:px-6 py-3 sm:py-4 text-left hover:bg-bg-tertiary/30 transition-colors"
      >
        <div className="flex items-center gap-2 sm:gap-4">
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
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span
                className={`font-bold text-xs sm:text-sm ${
                  p.win ? "text-accent-success" : "text-accent-danger"
                }`}
              >
                {p.win ? "승리" : "패배"}
              </span>
              <span className="text-[10px] sm:text-xs text-text-secondary">
                내전
              </span>
              {p.position && (
                <span className="text-[10px] sm:text-xs text-text-tertiary">
                  · {p.position}
                </span>
              )}
            </div>
            <div className="text-[10px] sm:text-xs text-text-tertiary truncate">
              {getChampionKoreanName(p.championName)} ·{" "}
              {match.team?.name ?? "팀 미배정"}
              {timeAgo && ` · ${timeAgo}`}
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
