"use client";

// 개발용 프리뷰 — 유저 전적 화면의 "내전 지표" 카드
// 접속: http://localhost:3010/dev/custom-game-stats
//
// 실제 화면은 API 가 있어야 그려져서, 같은 카드에 가짜 집계를 넣어 확인한다.

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CustomGameStatsCard } from "@/components/matches/CustomGameStatsCard";

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
    <div className="container mx-auto max-w-[900px] px-4 py-8">
      <CustomGameStatsCard userId="preview-user" ranking={RANKING} />
    </div>
  );
}
