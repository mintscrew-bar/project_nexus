"use client";

/**
 * 대진표 페이지 머리글.
 * 왼쪽: 로비로 돌아가기 + "TOURNAMENT" 라벨(팀 구성 도움말) + 방 이름 제목.
 * 오른쪽: 경기 진행 막대, 새로고침, 내전 종료(방장에게만, 길게 눌러 실행).
 */

import React from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { HoldToEndButton } from "@/components/ui/HoldToEndButton";

export function BracketHeader({
  backHref,
  title,
  modeHelp,
  completed,
  inProgress,
  total,
  isLoading,
  onRefresh,
  isHost,
  isAborting,
  onAbort,
}: {
  backHref: string;
  title: string;
  /** 팀 구성 방식 도움말 (TeamModeHelp) */
  modeHelp?: React.ReactNode;
  completed: number;
  inProgress: number;
  total: number;
  isLoading: boolean;
  onRefresh: () => void;
  isHost: boolean;
  isAborting: boolean;
  onAbort: () => void;
}) {
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href={backHref}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-bg-elevated/40 bg-bg-secondary text-text-secondary transition-colors hover:border-bg-elevated hover:text-text-primary"
          aria-label="로비로 돌아가기"
          title="로비로 돌아가기"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          {/* TeamModeHelp 는 버튼·툴팁 div 라 p 가 아니라 div 로 감싼다 */}
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-primary">
            Tournament
            {modeHelp}
          </div>
          {/* 방 ID는 사용자에게 의미가 없다 — 방 이름을 제목으로 */}
          <h1 className="truncate text-2xl font-bold tracking-[-0.02em] text-text-primary">
            {title}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* 진행률 — 숫자 여러 개 대신 막대 하나. 자세한 수는 툴팁으로 */}
        {total > 0 && (
          <div
            className="min-w-[180px] rounded-xl border border-bg-elevated/40 bg-bg-secondary px-3.5 py-2"
            title={`완료 ${completed} · 진행 중 ${inProgress} · 전체 ${total}`}
          >
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="font-semibold text-text-secondary">
                경기 진행
              </span>
              <span className="font-bold tabular-nums text-text-primary">
                {completed}
                <span className="text-text-tertiary">/{total}</span>
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-bg-elevated">
              <div
                className="h-full rounded-full bg-accent-primary transition-[width] duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-bg-elevated/40 bg-bg-secondary text-text-secondary transition-colors hover:border-bg-elevated hover:text-text-primary disabled:opacity-50"
          aria-label="새로고침"
          title="대진표를 다시 불러옵니다"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </button>
        {/* 내전 종료 — 방장만 할 수 있어 방장에게만 보인다(서버도 assertHost 로 막는다).
            길게 눌러야 실행되는 버튼이라 확인 창 없이도 실수로 끝나지 않는다. */}
        {isHost && (
          <HoldToEndButton isBusy={isAborting} onConfirm={onAbort} />
        )}
      </div>
    </div>
  );
}
