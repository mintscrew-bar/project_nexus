"use client";

/**
 * 대진표 판(무대)과 판 안쪽 경기 바.
 *
 * - BracketStage: 대진을 담는 판. 뒤에서 끊김 없이 흐르는 사선 띠, 위쪽 빛,
 *   오른쪽 아래 단계 워터마크("SEMI FINAL" 등)를 깐다. 장식 층은 모두
 *   pointer-events-none 이라 카드 클릭을 막지 않는다.
 * - BracketLiveBar: 판 아래쪽에 붙는(sticky) 경기 바. 보는 사람 입장에 따라 내용이 다르다.
 *   · 선수: 내 경기 한 줄 + 경기 열기
 *   · 운영자(방장): 손이 필요한 경기(시작 대기)를 앞에, 진행 중 경기는 뒤에
 *   · 관전자: 진행 중 경기만 나란히
 *
 * 판은 overflow-hidden 이 아니라 overflow-clip 을 쓴다. hidden 은 스크롤 상자라서
 * 키보드 포커스나 scrollIntoView 로 장식 층만큼 옆으로 밀려 내용이 잘려 보인다.
 */

import React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Match } from "./BracketView";

// ── 단계 이름 ───────────────────────────────────────────

/** 더블 엘리미네이션 섹션 → 워터마크 이름 */
const DE_STAGE: Record<string, string> = {
  WB_R1: "UPPER ROUND 1",
  WB_R2: "UPPER SEMI FINAL",
  WB_R3: "UPPER QUARTER FINAL",
  WB_F: "UPPER FINAL",
  LB_R1: "LOWER ROUND 1",
  LB_R2: "LOWER ROUND 2",
  LB_R3: "LOWER ROUND 3",
  LB_SEMI: "LOWER SEMI FINAL",
  LB_F: "LOWER FINAL",
  GF: "GRAND FINAL",
};

/** 싱글 엘리미네이션 라운드 → 워터마크 이름 (마지막 라운드부터 거꾸로) */
function singleElimStage(round: number, rounds: number): string {
  const fromEnd = rounds - round;
  if (fromEnd === 0) return "FINAL";
  if (fromEnd === 1) return "SEMI FINAL";
  if (fromEnd === 2) return "QUARTER FINAL";
  return `ROUND ${round}`;
}

export interface StageInfo {
  /** 워터마크 큰 글자 */
  title: string;
  /** 위 작은 줄 — "STAGE 1 / 2" 등 */
  eyebrow: string;
}

/**
 * 지금 진행 단계. 아직 안 끝난 경기 중 가장 앞선 라운드(섹션)를 단계로 본다.
 * 모두 끝났으면 마지막 단계 이름을 그대로 둔다.
 */
export function getStageInfo(matches: Match[], rounds: number): StageInfo {
  const isDE = matches.some(
    (m) => m.bracketSection?.startsWith("LB") || m.bracketSection === "GF",
  );
  const pending = matches.filter((m) => m.status !== "COMPLETED");

  if (isDE) {
    // 섹션 순서대로 처음 안 끝난 곳. 승자조·패자조가 동시에 돌 수 있어 승자조를 우선한다.
    const order = Object.keys(DE_STAGE);
    const current =
      order.find((sec) => pending.some((m) => m.bracketSection === sec)) ??
      "GF";
    return { title: DE_STAGE[current], eyebrow: "Double elimination" };
  }

  // 리그(라운드 1개짜리 여러 경기)
  if (rounds === 1 && matches.length > 1) {
    return { title: "LEAGUE", eyebrow: "Round robin" };
  }

  const round = pending.length
    ? Math.min(...pending.map((m) => m.round))
    : rounds;
  return {
    title: singleElimStage(round, rounds),
    eyebrow: `Stage ${round} / ${rounds}`,
  };
}

// ── 판 ─────────────────────────────────────────────────

export function BracketStage({
  stage,
  infoLine,
  children,
}: {
  stage: StageInfo;
  /** 워터마크 아래 대회 정보 한 줄 — "4 TEAMS · BO3 · 2026.11.09" */
  infoLine?: string;
  children: React.ReactNode;
}) {
  // 긴 이름은 단어마다 줄을 바꾼다 ("SEMI FINAL" → SEMI / FINAL)
  const words = stage.title.split(" ");
  return (
    <div className="relative overflow-clip rounded-2xl border border-bg-elevated/40 bg-bg-secondary/60">
      {/* 흐르는 사선 띠 — globals.css 의 bracket-stage-bands */}
      <div className="pointer-events-none absolute inset-0 overflow-clip">
        <div className="bracket-stage-bands absolute inset-y-0 -left-[480px] -right-[480px]" />
      </div>
      {/* 위에서 내려오는 메인색 빛 + 아래로 갈수록 어두워짐 */}
      <div className="bracket-stage-glow pointer-events-none absolute inset-0" />
      {/* 단계 워터마크 — 좁은 화면에선 대진을 가려서 숨긴다 */}
      <div className="pointer-events-none absolute bottom-6 right-8 hidden select-none text-right lg:block">
        <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-white/[0.07]">
          {stage.eyebrow}
        </p>
        <p className="text-[96px] font-black italic leading-[0.95] tracking-[-0.04em] text-white/[0.04] xl:text-[120px]">
          {words.map((w, i) => (
            <React.Fragment key={i}>
              {i > 0 && <br />}
              {w}
            </React.Fragment>
          ))}
        </p>
        {infoLine && (
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/[0.09]">
            {infoLine}
          </p>
        )}
      </div>
      <div className="relative p-3 md:p-4">{children}</div>
    </div>
  );
}

// ── 판 안쪽 경기 바 ──────────────────────────────────────

/** 지금 세트가 진행 중인가 */
export function isLiveMatch(m: Match): boolean {
  if (m.status === "COMPLETED") return false;
  return (m.currentGameStatus ?? m.status) === "IN_PROGRESS";
}

/** 두 팀이 다 있고 다음 세트를 시작해야 하는가 (방장 손이 필요) */
export function isReadyToStart(m: Match): boolean {
  if (m.status === "COMPLETED" || !m.team1 || !m.team2) return false;
  return (m.currentGameStatus ?? m.status) === "PENDING";
}

/** 이 회원이 뛰는 경기인가 — 팀장 id 또는 팀원 userId 로 판별 */
export function isUserInMatch(m: Match, userId?: string | null): boolean {
  if (!userId) return false;
  return [m.team1, m.team2].some(
    (t) =>
      t?.captain?.id === userId ||
      t?.members?.some((member) => member.userId === userId),
  );
}

/** 바에서는 칸이 좁아 " 팀" 을 떼고 팀장 이름만 쓴다 */
function shortName(team?: Match["team1"]): string {
  if (!team) return "TBD";
  return team.captain?.username ?? team.name.replace(/ 팀$/, "");
}

function ScoreLine({ m, size = "sm" }: { m: Match; size?: "sm" | "md" }) {
  const big = size === "md";
  return (
    <span
      className={cn(
        "flex min-w-0 items-center justify-center gap-1.5 font-bold tracking-[-0.02em] text-text-primary",
        big ? "gap-2 text-sm" : "text-xs",
      )}
    >
      <span className="truncate">
        {big ? `${shortName(m.team1)} 팀` : shortName(m.team1)}
      </span>
      <span className="shrink-0 font-black tabular-nums">
        {m.team1?.score ?? 0} : {m.team2?.score ?? 0}
      </span>
      <span className="truncate">
        {big ? `${shortName(m.team2)} 팀` : shortName(m.team2)}
      </span>
    </span>
  );
}

function setLabel(m: Match): string {
  return (m.bestOf ?? 1) > 1 ? `${m.currentGameNumber ?? 1}세트` : "단판";
}

function LiveDot() {
  return (
    <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent-primary" />
  );
}

export function BracketLiveBar({
  matches,
  userId,
  isHost,
  getLabel,
  onOpen,
}: {
  matches: Match[];
  userId?: string | null;
  isHost: boolean;
  /** 카드 머리글과 같은 경기 이름 — "준결승 2" 등 */
  getLabel: (m: Match) => string;
  onOpen: (m: Match) => void;
}) {
  const mine = matches.find(
    (m) => isUserInMatch(m, userId) && (isLiveMatch(m) || isReadyToStart(m)),
  );

  // 선수(방장이 아님): 내 경기 한 줄
  if (!isHost && mine) {
    const live = isLiveMatch(mine);
    return (
      <div className="mx-auto flex w-fit max-w-full items-center gap-3 rounded-xl border border-accent-primary/50 bg-bg-secondary px-3 py-2 shadow-lg shadow-black/30">
        <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-primary">
          <LiveDot />내 경기
        </span>
        <span className="hidden shrink-0 text-xs text-text-secondary sm:inline">
          {getLabel(mine)} · {live ? `${setLabel(mine)} 진행 중` : "시작 대기"}
        </span>
        <ScoreLine m={mine} size="md" />
        <button
          type="button"
          onClick={() => onOpen(mine)}
          className="flex shrink-0 items-center gap-0.5 rounded-xl bg-accent-primary px-3 py-1.5 text-xs font-bold text-accent-on transition-colors hover:bg-accent-hover"
        >
          경기 열기 <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // 운영자: 시작 대기(손이 필요) → 진행 중. 관전자: 진행 중만.
  const rows = isHost
    ? [
        ...matches.filter(isReadyToStart),
        ...matches.filter((m) => isLiveMatch(m) && !isReadyToStart(m)),
      ]
    : matches.filter(isLiveMatch);
  if (rows.length === 0) return null;

  return (
    <div className="mx-auto flex w-fit max-w-full items-stretch gap-1.5 overflow-x-auto rounded-xl border border-bg-elevated/40 bg-bg-secondary p-1.5 shadow-lg shadow-black/30">
      <span className="flex shrink-0 flex-col justify-center px-2">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-primary">
          <LiveDot />
          {isHost ? "운영" : "진행 중"}
        </span>
        <span className="text-[10px] text-text-tertiary">
          {rows.length}경기
        </span>
      </span>
      {rows.map((m) => {
        const needs = isHost && isReadyToStart(m);
        const isMine = isUserInMatch(m, userId);
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onOpen(m)}
            className={cn(
              "flex w-[300px] shrink-0 items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
              needs
                ? "border-accent-warning/50 bg-accent-warning/[0.08] hover:bg-accent-warning/[0.14]"
                : isMine
                  ? "border-accent-primary/50 bg-accent-primary/[0.08] hover:bg-accent-primary/[0.14]"
                  : "border-bg-elevated/30 bg-bg-elevated/20 hover:bg-bg-elevated/40",
            )}
          >
            <div className="w-[68px] shrink-0">
              <p className="truncate text-[11px] font-semibold text-text-secondary">
                {getLabel(m)}
              </p>
              <p
                className={cn(
                  "truncate text-[10px]",
                  needs
                    ? "font-bold text-accent-warning"
                    : isMine
                      ? "font-bold text-accent-primary"
                      : "text-text-tertiary",
                )}
              >
                {needs
                  ? `${setLabel(m)} 시작 대기`
                  : isMine
                    ? "내 경기"
                    : `${setLabel(m)} 진행 중`}
              </p>
            </div>
            <span className="min-w-0 flex-1">
              <ScoreLine m={m} />
            </span>
            <span
              className={cn(
                "flex shrink-0 items-center gap-0.5 rounded-lg px-2.5 py-1 text-[11px]",
                needs
                  ? "bg-accent-warning font-bold text-bg-primary"
                  : "border border-bg-elevated/60 font-semibold text-text-secondary",
              )}
            >
              {isHost ? (needs ? "시작" : "관리") : "보기"}
              <ChevronRight className="h-3 w-3" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
