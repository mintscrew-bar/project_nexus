"use client";

// 개발용 프리뷰 — 유저 전적 화면의 "내전 지표" 카드
// 접속: http://localhost:3010/dev/custom-game-stats
//
// 실제 화면은 API 가 있어야 그려져서, 같은 카드에 가짜 집계를 넣어 확인한다.

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CustomGameStatsCard } from "@/components/matches/CustomGameStatsCard";
import { ChampionStatsCard } from "@/components/matches/ChampionStatsCard";
import { PlayerHoverCard } from "@/components/domain/PlayerHoverCard";

const RANKING = {
  totalGames: 23,
  wins: 14,
  losses: 9,
  globalRank: 3,
  byRole: [
    { role: "TOP", totalGames: 2, wins: 1, losses: 1, winRate: 50 },
    { role: "JUNGLE", totalGames: 5, wins: 2, losses: 3, winRate: 40 },
    { role: "MID", totalGames: 4, wins: 1, losses: 3, winRate: 25 },
    { role: "ADC", totalGames: 12, wins: 10, losses: 2, winRate: 83.3 },
  ],
};

// [영문명, id, 판수, 승, 패, 판당 K, D, A, 판당 CS, 판당 분]
const CHAMPIONS = [
  ["Jinx", 222, 6, 5, 1, 8.2, 3.1, 7.5, 214, 28],
  ["Kaisa", 145, 4, 2, 2, 6.5, 4.8, 6.0, 198, 30],
  ["Ezreal", 81, 3, 1, 2, 4.0, 5.3, 6.7, 176, 27],
  ["LeeSin", 64, 3, 2, 1, 5.7, 3.3, 9.3, 142, 29],
  ["Ahri", 103, 2, 0, 2, 3.5, 6.0, 4.5, 165, 26],
  ["Thresh", 412, 2, 1, 1, 1.0, 4.5, 14.0, 32, 31],
  ["Garen", 86, 1, 1, 0, 9.0, 0, 3.0, 201, 25],
  ["Lulu", 117, 1, 0, 1, 1.0, 5.0, 11.0, 28, 33],
  ["Viego", 234, 1, 1, 0, 7.0, 2.0, 6.0, 168, 27],
  ["Caitlyn", 51, 1, 0, 1, 4.0, 7.0, 3.0, 221, 32],
].map(([name, id, games, wins, losses, k, d, a, cs, min]) => {
  const g = games as number;
  return {
    championId: id as number,
    championName: name as string,
    games: g,
    wins: wins as number,
    losses: losses as number,
    kills: (k as number) * g,
    deaths: (d as number) * g,
    assists: (a as number) * g,
    timedCs: (cs as number) * g,
    timedSeconds: (min as number) * 60 * g,
  };
});

export default function CustomGameStatsPreviewPage() {
  const queryClient = useQueryClient();
  const [seeded, setSeeded] = useState(false);
  // 호버 카드는 window 크기로 자리를 잡아서 브라우저에서만 그린다
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!seeded) {
    queryClient.setQueryData(["hoverProfile", "preview-user", "LOL"], {
      username: "preview",
      avatar: null,
      riotAccount: null,
      pubgAccount: null,
      clan: null,
      streamerProfiles: [],
      streamerLinks: [],
      stats: { wins: 14, losses: 9, winRate: 60.9 },
      kda: {
        kills: 6.4,
        deaths: 4.1,
        assists: 8.7,
        games: 21,
        damage: 21450,
        cs: 187,
        vision: 24.6,
        gold: 12380,
        killParticipation: 58,
      },
      reputation: {
        overallAverage: 0,
        totalRatings: 0,
        commendations: {
          total: 7,
          topTags: [
            { tag: "MANNER", count: 4 },
            { tag: "SHOTCALL", count: 2 },
          ],
        },
      },
    });
    setSeeded(true);
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* 실제 화면과 같은 2:1 배치 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <CustomGameStatsCard userId="preview-user" ranking={RANKING} />
        </div>
        <div className="relative">
          <div className="lg:absolute lg:inset-0">
            <ChampionStatsCard stats={CHAMPIONS} fill />
          </div>
        </div>
      </div>
      {/* 같은 호버 프로필 캐시로 그린 호버 카드 — 평판(받은 칭찬) 칸 확인용 */}
      {mounted && (
        <PlayerHoverCard
          userId="preview-user"
          anchorRect={new DOMRect(0, 760, 0, 0)}
          onOpenProfile={() => {}}
          onMouseEnter={() => {}}
          onMouseLeave={() => {}}
        />
      )}
    </div>
  );
}
