"use client";

// 개발용 프리뷰 — 경매 화면 데스크톱 레이아웃 확인 페이지
// 접속: http://localhost:3010/dev/auction-layout
//
// 실제 경매는 로그인 + 진행 중인 경매가 있어야 보여서 화면 크기별 배치를
// 확인하기 어렵다. 경매 페이지와 같은 컴포넌트(AuctionDesktopLayout·패널·
// AuctionBoard)에 가짜 데이터를 넣어 그린다. AppShell 은 이 경로를 대시보드
// 화면으로 다뤄 실제 경매와 같은 높이 예산(헤더 + 뷰포트 고정)을 준다.

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AuctionBoard } from "@/components/domain";
import { Badge, Button } from "@/components/ui";
import {
  AuctionDesktopLayout,
  RemainingPlayersPanel,
  TeamSummaryPanel,
} from "@/app/[game]/auction/[id]/_components/AuctionPanels";

const ROLES = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const;
const TIERS = ["SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND"] as const;
const CHAMPIONS: Record<string, string[]> = {
  TOP: ["Aatrox", "Darius", "Garen", "Camille", "Fiora"],
  JUNGLE: ["LeeSin", "Viego", "Kindred", "Nidalee", "Graves"],
  MID: ["Ahri", "Syndra", "Yasuo", "Akali", "Orianna"],
  ADC: ["Jinx", "Kaisa", "Ezreal", "Caitlyn", "Ashe"],
  SUPPORT: ["Thresh", "Lulu", "Nautilus", "Leona", "Nami"],
};

function mockPlayer(index: number) {
  const mainRole = ROLES[index % 5];
  const subRole = ROLES[(index + 2) % 5];
  return {
    id: `bot-${index}`,
    username: `testbot_${String(index).padStart(2, "0")}`,
    tier: TIERS[index % TIERS.length],
    rank: "II",
    mmr: 900 + ((index * 137) % 1300),
    mainRole,
    subRole,
    champions: CHAMPIONS[mainRole],
  };
}

const CURRENT = mockPlayer(9);
const REMAINING = Array.from({ length: 15 }, (_, i) => mockPlayer(i + 9));

const TEAM_COLORS = ["#ef4444", "#22c55e", "#eab308", "#3b82f6", "#a855f7"];

function mockTeams(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const captain = mockPlayer(40 + i);
    const extra = i === 1 ? [mockPlayer(60)] : [];
    return {
      id: `team-${i}`,
      name: `${captain.username} 팀`,
      captainId: captain.id,
      captainName: captain.username,
      color: TEAM_COLORS[i % TEAM_COLORS.length],
      members: [captain, ...extra],
      remainingGold: i === 1 ? 150 : 1000,
    };
  });
}

/** AuctionLotDetails 가 여는 프로필 조회를 가짜 응답으로 채운다 (API 없이 그림) */
function useSeedHoverProfile() {
  const queryClient = useQueryClient();
  const [seeded, setSeeded] = useState(false);
  if (!seeded) {
    queryClient.setQueryData(["hoverProfile", CURRENT.id, "LOL"], {
      username: CURRENT.username,
      avatar: null,
      riotAccount: {
        gameName: CURRENT.username,
        tagLine: "BOT",
        tier: "PLATINUM",
        rank: "IV",
        lp: 92,
        peakTier: null,
        peakRank: null,
        peakLp: null,
        mainRole: "ADC",
        subRole: "SUPPORT",
        roleTiers: [
          { role: "ADC", tier: "PLATINUM", rank: "IV", lp: 0 },
          { role: "SUPPORT", tier: "EMERALD", rank: "III", lp: 0 },
          { role: "TOP", tier: "PLATINUM", rank: "III", lp: 0 },
          { role: "JUNGLE", tier: "EMERALD", rank: "II", lp: 0 },
          { role: "MID", tier: "DIAMOND", rank: "I", lp: 0 },
        ],
        balanceScores: null,
        championPreferences: ROLES.flatMap((role) =>
          CHAMPIONS[role].map((championId, order) => ({
            role,
            championId,
            order,
          })),
        ),
      },
      pubgAccount: null,
      clan: null,
      streamerProfiles: [],
      streamerLinks: [],
      stats: { wins: 0, losses: 0, winRate: 0 },
      kda: null,
      reputation: { overallAverage: 0, totalRatings: 0 },
    });
    setSeeded(true);
  }
}

export default function AuctionLayoutPreviewPage() {
  useSeedHoverProfile();
  // ?teams=5 처럼 팀 수를 바꿔 볼 수 있다. 서버 렌더와 어긋나지 않게 마운트 뒤에 읽는다.
  const [teamCount, setTeamCount] = useState(4);
  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get("teams"));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (n >= 2 && n <= 8) setTeamCount(n);
  }, []);
  const teams = mockTeams(teamCount);
  const auctionState = {
    currentPlayer: CURRENT,
    currentPlayerIndex: 0,
    currentHighestBid: 0,
    currentHighestBidder: null,
    timerEnd: Date.now() + 27_000,
    status: "IN_PROGRESS" as const,
    yuchalCount: 0,
    maxYuchalCycles: 2,
    bidIncrement: 50,
  };

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      <div className="mx-auto flex w-full max-w-[1720px] flex-1 flex-col min-h-0">
        {/* 헤더 — 경매 페이지와 같은 높이 */}
        <div className="mb-3 flex h-12 shrink-0 items-center justify-between">
          <h1 className="flex items-center gap-2 text-xl font-bold text-text-primary">
            경매 진행 중
            <span className="text-sm font-normal text-text-secondary ml-2">
              ({REMAINING.length}명 남음)
            </span>
          </h1>
          <div className="flex items-center gap-2">
            <Badge variant="success">● 연결됨</Badge>
            <Button variant="danger" size="sm">
              내전 종료
            </Button>
          </div>
        </div>

        <AuctionDesktopLayout
          teams={
            <TeamSummaryPanel
              teams={teams}
              currentUserId="team-0"
              auctionState={auctionState}
            />
          }
          board={
            <AuctionBoard
              auctionState={auctionState}
              teams={teams}
              players={REMAINING}
              currentUserId={teams[0].captainId}
              onPlaceBid={() => undefined}
              bidHistory={[]}
              hideTeams
              className="flex-1"
              onVoteItemSkip={() => undefined}
            />
          }
          players={
            <RemainingPlayersPanel
              players={REMAINING}
              currentPlayerId={CURRENT.id}
              onExpandPlayers={() => undefined}
            />
          }
          // 채팅은 소켓이 필요해 같은 크기의 빈 패널로 대신한다
          chat={
            <div className="flex h-full flex-col rounded-lg border border-bg-tertiary bg-bg-secondary">
              <div className="flex h-10 shrink-0 items-center border-b border-bg-tertiary px-3 text-sm font-semibold text-text-primary">
                채팅
              </div>
              <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
                아직 메시지가 없습니다
              </div>
              <div className="h-14 shrink-0 border-t border-bg-tertiary" />
            </div>
          }
        />
      </div>
    </div>
  );
}
