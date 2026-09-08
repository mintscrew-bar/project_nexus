"use client";

import Link from "next/link";
import { Crosshair, Skull, Trophy } from "lucide-react";
import { PUBG_PLATFORM_LABELS, getPubgGameMode } from "@nexus/types";
import type { PubgHistoryResponse } from "@/lib/api-client";
import { Badge, Card, CardContent, EmptyState } from "@/components/ui";
import { roomPath } from "@/lib/room-links";

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/**
 * 배그 전적.
 *
 * 배틀로얄과 킬내기가 같은 스크림 모델을 쓴다 — 둘 다 라운드를 반복하며
 * 포인트를 누적한다. 갈리는 건 팀 수(킬내기는 2팀)와 점수 규칙뿐이라
 * 카드 모양도 하나로 둔다.
 */
export function PubgMatchHistory({
  history,
}: {
  history: PubgHistoryResponse;
}) {
  const { items, summary } = history;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Trophy}
        title="배그 내전 기록이 없습니다"
        description="배틀로얄 스크림이나 킬내기에 참가하면 여기에 기록이 쌓입니다."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile
          label="배틀로얄"
          value={`${summary.scrimCount}회`}
          hint={`킬내기 ${summary.killMatchCount}회`}
        />
        <SummaryTile
          label="평균 순위"
          // 판수가 적으면 평균이 크게 흔들린다. 판수를 같이 보여준다.
          value={
            summary.averageScrimRank === null
              ? "–"
              : `${summary.averageScrimRank}위`
          }
          hint={`배틀로얄 ${summary.scrimCount}회 기준`}
        />
        <SummaryTile
          label="라운드당 팀 킬"
          value={
            summary.averageKillsPerRound === null
              ? "–"
              : `${summary.averageKillsPerRound}`
          }
          hint="두 모드 합산"
        />
        <SummaryTile
          label="킬내기 승"
          value={`${summary.killMatchWins}승`}
          hint={`${summary.killMatchCount}전`}
        />
      </div>

      <div className="space-y-2">
        {items.map((item) => {
          const isKillMatch = item.mode === "KILL_MATCH";
          return (
            <Card key={`${item.roomId}-${item.teamName}`}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={roomPath(
                        { id: item.roomId, gameTitle: "PUBG" },
                        "/scrim",
                      )}
                      className="truncate font-semibold text-text-primary hover:underline"
                    >
                      {item.roomName}
                    </Link>
                    <Badge variant="secondary">
                      {getPubgGameMode(item.mode).label}
                    </Badge>
                    {item.pubgPlatform && (
                      <Badge variant="secondary">
                        {PUBG_PLATFORM_LABELS[item.pubgPlatform].short}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-text-tertiary">
                    {item.teamName} · {item.rounds}라운드 ·{" "}
                    {formatDate(item.completedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-text-secondary">
                    <Crosshair className="mr-1 inline h-3.5 w-3.5" />
                    {item.totalKills}
                  </span>
                  {/* 사망은 킬내기에서만 점수에 들어간다. 배틀로얄에서는 숨긴다. */}
                  {isKillMatch && (
                    <span className="text-text-tertiary">
                      <Skull className="mr-1 inline h-3.5 w-3.5" />
                      {item.totalDeaths}
                    </span>
                  )}
                  <span className="font-black text-text-primary">
                    {item.totalPoints}점
                  </span>
                  <Badge
                    variant={item.finalRank === 1 ? "primary" : "secondary"}
                  >
                    {item.finalRank === null
                      ? "기록 없음"
                      : isKillMatch
                        ? // 두 팀뿐이라 순위보다 승패로 읽는 게 자연스럽다.
                          item.finalRank === 1
                          ? "승"
                          : "패"
                        : `${item.finalRank}/${item.totalTeams}위`}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-bg-tertiary bg-bg-secondary/50 p-3">
      <p className="text-xs text-text-tertiary">{label}</p>
      <p className="mt-1 text-xl font-black text-text-primary">{value}</p>
      <p className="mt-0.5 text-[11px] text-text-tertiary">{hint}</p>
    </div>
  );
}
