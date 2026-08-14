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
