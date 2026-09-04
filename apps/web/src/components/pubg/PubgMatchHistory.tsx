"use client";

import Link from "next/link";
import { Crosshair, Layers, Trophy } from "lucide-react";
import { PUBG_PLATFORM_LABELS } from "@nexus/types";
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
 * 롤과 달리 승률이 중심이 아니다. 배틀로얄은 여러 팀이 붙어 순위·킬로 점수를
 * 매기고, 킬내기만 승패가 있다. 두 종류를 시간순으로 섞어 보여준다.
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
        description="스크림이나 킬내기에 참가하면 여기에 기록이 쌓입니다."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile
          label="스크림"
          value={`${summary.scrimCount}회`}
          hint={`${summary.killMatchCount}회 킬내기`}
        />
        <SummaryTile
          label="평균 순위"
          // 판수가 적으면 평균이 크게 흔들린다. 판수를 같이 보여준다.
          value={
            summary.averageScrimRank === null
              ? "–"
              : `${summary.averageScrimRank}위`
          }
          hint={`${summary.scrimCount}회 기준`}
        />
        <SummaryTile
          label="라운드당 팀 킬"
          value={
            summary.averageKillsPerRound === null
              ? "–"
              : `${summary.averageKillsPerRound}`
          }
          hint="스크림 기준"
        />
        <SummaryTile
          label="킬내기 승"
          value={`${summary.killMatchWins}승`}
          hint={`${summary.killMatchCount}전`}
        />
      </div>

      <div className="space-y-2">
        {items.map((item) =>
          item.kind === "SCRIM" ? (
            <Card key={`scrim-${item.roomId}`}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 flex-shrink-0 text-accent-primary" />
                    <Link
                      href={roomPath(
                        { id: item.roomId, gameTitle: "PUBG" },
                        "/scrim",
                      )}
                      className="truncate font-semibold text-text-primary hover:underline"
                    >
                      {item.roomName}
                    </Link>
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
                  <span className="font-black text-text-primary">
                    {item.totalPoints}점
                  </span>
                  <Badge variant={item.finalRank === 1 ? "primary" : "secondary"}>
                    {item.finalRank === null
                      ? "기록 없음"
                      : `${item.finalRank}/${item.totalTeams}위`}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card key={`kill-${item.matchId}`}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Crosshair className="h-4 w-4 flex-shrink-0 text-accent-primary" />
                    <span className="truncate font-semibold text-text-primary">
                      {item.teamName} vs {item.opponentName}
                    </span>
                    {item.pubgPlatform && (
                      <Badge variant="secondary">
                        {PUBG_PLATFORM_LABELS[item.pubgPlatform].short}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-text-tertiary">
                    {item.roomName} · 킬내기 · {formatDate(item.completedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-text-secondary">
                    {item.teamKills} : {item.opponentKills}
                  </span>
                  {/* 개인 킬은 선택 입력이라 안 넣었으면 아예 안 보여준다. */}
                  {item.playerKills !== null && (
                    <span className="text-text-tertiary">
                      내 킬 {item.playerKills}
                    </span>
                  )}
                  <Badge variant={item.win ? "primary" : "secondary"}>
                    {item.win ? "승" : "패"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ),
        )}
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
