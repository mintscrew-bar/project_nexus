"use client";

import React from "react";
import { getRoleIcon, getRoleLabel, ROLE_ORDER } from "@/lib/role-icon";

export interface RoleRecord {
  role: string;
  totalGames: number;
  wins: number;
  losses: number;
  winRate: number;
}

interface RoleRecordListProps {
  records?: RoleRecord[] | null;
  className?: string;
}

/** 승률에 따른 색 — 눈으로 바로 좋고 나쁨이 잡히게 한다 */
function winRateTone(winRate: number, totalGames: number): string {
  // 표본이 적으면 승률이 0/100으로 튀어서 색을 강하게 주면 오해를 부른다.
  if (totalGames < 3) return "text-text-secondary";
  if (winRate >= 60) return "text-accent-primary";
  if (winRate < 40) return "text-accent-danger";
  return "text-text-primary";
}

/**
 * 내전 라인별 승패/승률.
 *
 * 승패는 방장이 입력한 결과로 확정되므로 Riot 전적 수집 여부와 무관하게 항상
 * 값이 있다. 라인은 역할 선택 단계에서 배정된 값이라, 역할 선택을 거치지 않은
 * 방(자유 팀 선택 등)의 경기는 여기 집계되지 않는다.
 */
export const RoleRecordList: React.FC<RoleRecordListProps> = ({
  records,
  className,
}) => {
  const rows = (records ?? []).filter((record) => record.totalGames > 0);

  if (rows.length === 0) {
    return (
      <p className={`text-xs text-text-tertiary ${className ?? ""}`}>
        라인별 기록이 아직 없습니다. 역할 선택을 거친 내전을 치르면 쌓입니다.
      </p>
    );
  }

  // 경기 수가 가장 많은 라인을 막대 기준으로 삼는다 (주 라인이 한눈에 보이게).
  const maxGames = Math.max(...rows.map((row) => row.totalGames));
  const ordered = ROLE_ORDER.map((role) =>
    rows.find((row) => row.role === role),
  ).filter((row): row is RoleRecord => Boolean(row));

  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      {ordered.map((row) => {
        const icon = getRoleIcon(row.role);
        const label = getRoleLabel(row.role) ?? row.role;
        const share = maxGames > 0 ? (row.totalGames / maxGames) * 100 : 0;

        return (
          <div key={row.role} className="flex items-center gap-2.5">
            {icon && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={icon}
                alt={label}
                width={16}
                height={16}
                className="shrink-0 opacity-80 brightness-0 invert"
              />
            )}
            <span className="w-8 shrink-0 text-xs text-text-secondary">
              {label}
            </span>

            <div className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-bg-tertiary">
              <div
                className="h-full rounded-full bg-accent-primary/50"
                style={{ width: `${share}%` }}
              />
            </div>

            <span className="w-14 shrink-0 text-right text-xs tabular-nums text-text-tertiary">
              {row.wins}승 {row.losses}패
            </span>
            <span
              className={`w-9 shrink-0 text-right text-xs font-bold tabular-nums ${winRateTone(
                row.winRate,
                row.totalGames,
              )}`}
            >
              {Math.round(row.winRate)}%
            </span>
          </div>
        );
      })}
    </div>
  );
};

/** 승률 막대 색 — 글자색 규칙(winRateTone)과 같은 기준 */
function winRateBarTone(winRate: number, totalGames: number): string {
  if (totalGames < 3) return "bg-text-tertiary/60";
  if (winRate >= 60) return "bg-accent-primary";
  if (winRate < 40) return "bg-accent-danger";
  return "bg-text-secondary";
}

/**
 * 내전 라인별 승률 그래프 (세로 막대 다섯 개).
 *
 * 목록형(RoleRecordList)은 막대가 "판수"라 승률은 오른쪽 작은 숫자로만 보였다.
 * 여기서는 막대 높이가 곧 승률이고 50% 기준선을 그어, 어느 라인이 강한지가
 * 한눈에 잡히게 한다(2026-11-03 운영자 요청). 판수는 막대 아래에 적는다.
 * 기록 없는 라인도 자리를 남긴다 — 빠지면 "그 라인은 안 했다"는 정보가 사라진다.
 */
export const RoleWinRateChart: React.FC<RoleRecordListProps> = ({
  records,
  className,
}) => {
  const byRole = new Map(
    (records ?? []).map((record) => [record.role, record]),
  );
  const maxGames = Math.max(
    0,
    ...(records ?? []).map((record) => record.totalGames),
  );

  return (
    <div className={`grid grid-cols-5 gap-2 sm:gap-3 ${className ?? ""}`}>
      {ROLE_ORDER.map((role) => {
        const row = byRole.get(role);
        const games = row?.totalGames ?? 0;
        const winRate = games > 0 ? Math.round(row!.winRate) : null;
        const icon = getRoleIcon(role);
        const label = getRoleLabel(role) ?? role;
        // 가장 많이 뛴 라인 = 주 라인. 테두리로 살짝 표시한다.
        const isMost = games > 0 && games === maxGames;

        return (
          <div
            key={role}
            className={`flex min-w-0 flex-col items-center rounded-lg px-1 pb-2 pt-2.5 ${
              isMost
                ? "bg-accent-primary/10 ring-1 ring-accent-primary/40"
                : "bg-bg-tertiary/50"
            }`}
          >
            {/* 승률 숫자 */}
            <span
              className={`text-base font-black tabular-nums sm:text-lg ${
                winRate != null
                  ? winRateTone(winRate, games)
                  : "text-text-tertiary"
              }`}
            >
              {winRate != null ? `${winRate}%` : "—"}
            </span>

            {/* 막대 — 높이 = 승률, 점선 = 50% */}
            <div className="relative mt-1.5 h-24 w-6 overflow-hidden rounded-md bg-bg-primary/60 sm:h-28 sm:w-10">
              <div className="absolute inset-x-0 top-1/2 z-10 border-t border-dashed border-text-tertiary/50" />
              {winRate != null && (
                <div
                  className={`absolute inset-x-0 bottom-0 rounded-md transition-[height] duration-500 ${winRateBarTone(
                    winRate,
                    games,
                  )}`}
                  style={{ height: `${Math.max(winRate, 3)}%` }}
                />
              )}
            </div>

            {/* 라인 */}
            <div className="mt-2 flex items-center gap-1">
              {icon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={icon}
                  alt=""
                  width={14}
                  height={14}
                  className="shrink-0 opacity-80 brightness-0 invert"
                />
              )}
              <span className="text-xs font-semibold text-text-primary">
                {label}
              </span>
            </div>
            <span className="mt-0.5 text-[11px] tabular-nums text-text-tertiary">
              {games > 0 ? `${row!.wins}승 ${row!.losses}패` : "기록 없음"}
            </span>
          </div>
        );
      })}
    </div>
  );
};
