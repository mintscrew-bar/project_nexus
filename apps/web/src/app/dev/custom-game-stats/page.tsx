"use client";

// 개발용 프리뷰 — 유저 전적 화면의 "내전 지표" 카드
// 접속: http://localhost:3010/dev/custom-game-stats
//
// 실제 화면은 API 가 있어야 그려져서, 같은 카드에 가짜 집계를 넣어 확인한다.

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CustomGameStatsCard } from "@/components/matches/CustomGameStatsCard";
import { ChampionStatsCard } from "@/components/matches/ChampionStatsCard";

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

const CHAMPIONS = [
  ["Jinx", 222, 6, 5, 1],
  ["Kaisa", 145, 4, 2, 2],
  ["Ezreal", 81, 3, 1, 2],
  ["LeeSin", 64, 3, 2, 1],
  ["Ahri", 103, 2, 0, 2],
  ["Thresh", 412, 2, 1, 1],
  ["Garen", 86, 1, 1, 0],
].map(([name, id, games, wins, losses]) => {
  const g = games as number;
  return {
    championId: id as number,
    championName: name as string,
    games: g,
    wins: wins as number,
    losses: losses as number,
    kills: 7 * g,
    deaths: name === "Garen" ? 0 : 4 * g,
    assists: 8 * g,
    totalMinionsKilled: 180 * g,
    neutralMinionsKilled: 8 * g,
    totalDamageDealtToChampions: 21000 * g,
  };
});

export default function CustomGameStatsPreviewPage() {
  const queryClient = useQueryClient();
  const [seeded, setSeeded] = useState(false);
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
      reputation: { overallAverage: 4.3, totalRatings: 12 },
    });
    setSeeded(true);
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      {/* 실제 화면과 같은 2:1 배치 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CustomGameStatsCard userId="preview-user" ranking={RANKING} />
        </div>
        <div className="relative">
          <div className="lg:absolute lg:inset-0">
            <ChampionStatsCard stats={CHAMPIONS} fill />
          </div>
        </div>
      </div>
    </div>
  );
}
