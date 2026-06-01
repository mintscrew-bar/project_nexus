"use client";

import { useMemo, useState } from "react";
import { AuctionBoard } from "@/components/domain/AuctionBoard";
import { Avatar, Button, Card } from "@/components/ui";
import { TierBadge } from "@/components/domain/TierBadge";
import { cn } from "@/lib/utils";
import { Coins, PackageOpen } from "lucide-react";

const currentUserId = "captain-1";

const mockPlayers = [
  { id: "p1", username: "Nexon", tier: "MASTER", rank: "I", mmr: 1830, mainRole: "MID", subRole: "ADC" },
  { id: "p2", username: "Kira", tier: "DIAMOND", rank: "IV", mmr: 1640, mainRole: "ADC", subRole: "MID" },
  { id: "p3", username: "Silv", tier: "EMERALD", rank: "I", mmr: 1510, mainRole: "JUNGLE", subRole: "TOP" },
  { id: "p4", username: "Zeph", tier: "EMERALD", rank: "III", mmr: 1440, mainRole: "SUPPORT", subRole: "JUNGLE" },
  { id: "p5", username: "Storm", tier: "DIAMOND", rank: "III", mmr: 1580, mainRole: "JUNGLE", subRole: "MID" },
  { id: "p6", username: "Echo", tier: "EMERALD", rank: "II", mmr: 1490, mainRole: "MID", subRole: "SUPPORT" },
];

const mockTeams = [
  {
    id: "team-1",
    name: "1팀",
    captainId: "captain-1",
    captainName: "Haru",
    color: "#667eea",
    remainingGold: 620,
    members: [
      { id: "captain-1", username: "Haru", tier: "DIAMOND", rank: "II", mmr: 1690, mainRole: "TOP", subRole: "MID" },
      { id: "m1", username: "Blaze", tier: "PLATINUM", rank: "I", mmr: 1370, mainRole: "ADC", subRole: "SUPPORT" },
    ],
  },
  {
    id: "team-2",
    name: "2팀",
    captainId: "captain-2",
    captainName: "Fern",
    color: "#c89b3c",
    remainingGold: 480,
    members: [
      { id: "captain-2", username: "Fern", tier: "GOLD", rank: "I", mmr: 1290, mainRole: "TOP", subRole: "JUNGLE" },
      { id: "m2", username: "Volt", tier: "EMERALD", rank: "IV", mmr: 1420, mainRole: "ADC", subRole: "MID" },
    ],
  },
  {
    id: "team-3",
    name: "3팀",
    captainId: "captain-3",
    captainName: "Dusk",
    color: "#00c853",
    remainingGold: 710,
    members: [
      { id: "captain-3", username: "Dusk", tier: "SILVER", rank: "I", mmr: 1110, mainRole: "TOP", subRole: "SUPPORT" },
    ],
  },
  {
    id: "team-4",
    name: "4팀",
    captainId: "captain-4",
    captainName: "Nova",
    color: "#a855f7",
    remainingGold: 390,
    members: [
      { id: "captain-4", username: "Nova", tier: "GOLD", rank: "III", mmr: 1230, mainRole: "JUNGLE", subRole: "TOP" },
      { id: "m3", username: "Ash", tier: "PLATINUM", rank: "II", mmr: 1340, mainRole: "SUPPORT", subRole: "ADC" },
      { id: "m4", username: "Jade", tier: "PLATINUM", rank: "III", mmr: 1310, mainRole: "MID", subRole: "JUNGLE" },
    ],
  },
];

const mockBidHistory = [
  { username: "Fern", amount: 150, timestamp: Date.now() - 18_000, playerLabel: "Nexon" },
  { username: "Nova", amount: 250, timestamp: Date.now() - 12_000, playerLabel: "Nexon" },
  { username: "Haru", amount: 350, timestamp: Date.now() - 6_000, playerLabel: "Nexon" },
];

function TeamSideColumn({
  teams,
  currentHighestBidder,
}: {
  teams: typeof mockTeams;
  currentHighestBidder: string | null;
}) {
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto">
      {teams.map((team) => {
        const isMine = team.captainId === currentUserId;
        const isHighest = currentHighestBidder === team.id || currentHighestBidder === team.captainId;

        return (
          <Card
            key={team.id}
            className={cn(
              "shrink-0 overflow-hidden p-0",
              isHighest && "border-accent-gold/50 shadow-sm shadow-accent-gold/10",
              isMine && !isHighest && "border-accent-primary/40",
            )}
          >
            <div
              className={cn(
                "flex h-10 items-center gap-2 border-b border-bg-tertiary/70 px-3",
                isHighest ? "bg-accent-gold/10" : "bg-bg-tertiary/20",
              )}
            >
              <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: team.color }} />
              <span className={cn("min-w-0 flex-1 truncate text-sm font-semibold", isMine ? "text-accent-primary" : "text-text-primary")}>
                {team.name}
              </span>
              <div className="flex shrink-0 items-center gap-0.5">
                <Coins className="h-3 w-3 text-accent-gold" />
                <span className={cn("text-xs font-bold", isHighest ? "text-accent-gold" : "text-text-secondary")}>
                  {team.remainingGold.toLocaleString()}G
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1 p-1.5">
              {team.members.map((member, idx) => {
                const isCaptain = member.id === team.captainId;

                return (
                  <div
                    key={member.id}
                    className={cn(
                      "flex h-7 items-center gap-1.5 rounded px-2",
                      isCaptain ? "bg-accent-gold/10" : "bg-bg-tertiary/60",
                    )}
                  >
                    <span className="w-4 shrink-0 text-center text-[10px] text-text-tertiary">
                      {isCaptain ? "C" : idx}
                    </span>
                    <Avatar src={undefined} alt={member.username} fallback={member.username[0]} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-primary">
                      {member.username}
                    </span>
                    <TierBadge tier={member.tier} rank={member.rank} size="sm" showIcon={false} />
                  </div>
                );
              })}

              {Array.from({ length: Math.max(0, 5 - team.members.length) }).map((_, idx) => (
                <div
                  key={`empty-${idx}`}
                  className="flex h-7 items-center gap-1.5 rounded border border-dashed border-bg-tertiary/60 px-2"
                >
                  <span className="w-4 shrink-0 text-center text-[10px] text-text-muted">
                    {team.members.length + idx}
                  </span>
                  <span className="text-xs text-text-muted">빈 슬롯</span>
                </div>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

const mockChatMessages = [
  { id: 1, username: "Fern",  color: "#c89b3c", text: "Nexon 저 저한테 줘요 제발" },
  { id: 2, username: "Haru",  color: "#667eea", text: "ㄴㄴ 내꺼" },
  { id: 3, username: "Nova",  color: "#a855f7", text: "350이면 비싸지 않냐" },
  { id: 4, username: "Dusk",  color: "#00c853", text: "마스터면 당연하지" },
  { id: 5, username: "Fern",  color: "#c89b3c", text: "골드 남았으면 더 올려" },
];

function CenterBottomPanel({ players }: { players: typeof mockPlayers }) {
  const remaining = players.slice(1);

  return (
    <div className="grid h-full min-h-0 grid-cols-[2fr_1fr] gap-3">
      {/* 남은 매물 */}
      <Card className="flex min-h-0 flex-col overflow-hidden p-0">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-bg-tertiary/70 bg-bg-tertiary/20 px-3">
          <PackageOpen className="h-3.5 w-3.5 text-accent-primary" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">남은 매물</span>
          <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] font-bold text-text-tertiary">
            {remaining.length}
          </span>
        </div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
          {remaining.map((player, idx) => (
            <div key={player.id} className="flex min-w-0 items-center gap-3 rounded-lg bg-bg-tertiary/70 px-3 py-2">
              <span className="w-5 shrink-0 text-center text-xs font-semibold text-text-tertiary">{idx + 1}</span>
              <Avatar src={undefined} alt={player.username} fallback={player.username[0]} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text-primary">{player.username}</p>
                <p className="truncate text-xs text-text-tertiary">
                  {player.mainRole} / {player.subRole} · MMR {player.mmr}
                </p>
              </div>
              <TierBadge tier={player.tier} rank={player.rank} size="sm" showIcon={false} />
            </div>
          ))}
        </div>
      </Card>

      {/* 채팅 (mock) */}
      <Card className="flex min-h-0 flex-col overflow-hidden p-0">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-bg-tertiary/70 bg-bg-tertiary/20 px-3">
          <span className="text-sm font-semibold text-text-primary">채팅</span>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
          {mockChatMessages.map((msg) => (
            <div key={msg.id} className="flex flex-col gap-0.5">
              <span className="text-[11px] font-semibold" style={{ color: msg.color }}>{msg.username}</span>
              <span className="text-xs text-text-secondary">{msg.text}</span>
            </div>
          ))}
        </div>
        <div className="shrink-0 border-t border-bg-tertiary/70 p-2">
          <div className="flex h-8 items-center rounded bg-bg-tertiary/60 px-2 text-xs text-text-muted">
            메시지 입력...
          </div>
        </div>
      </Card>
    </div>
  );
}

function TestBidPanel({
  highestBid,
  onPlaceBid,
}: {
  highestBid: number;
  onPlaceBid: (amount: number) => void;
}) {
  const [addedBid, setAddedBid] = useState(0);
  const bidIncrement = 50;
  const currentTeam = mockTeams.find((team) => team.captainId === currentUserId);
  const availableGold = currentTeam?.remainingGold ?? 0;
  const totalBid = highestBid + addedBid;
  const canBid = addedBid > 0 && totalBid <= availableGold;

  return (
    <Card className="shrink-0 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-tertiary">입찰</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={cn("text-2xl font-black tabular-nums", addedBid > 0 ? "text-accent-gold" : "text-text-secondary")}>
              {totalBid.toLocaleString()}G
            </span>
            {addedBid > 0 && (
              <span className="text-xs text-text-tertiary">
                {highestBid.toLocaleString()}G + {addedBid.toLocaleString()}G
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-text-tertiary">
            사용 가능 <span className="font-semibold text-accent-gold">{availableGold.toLocaleString()}G</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {[bidIncrement, bidIncrement * 2, bidIncrement * 5].map((amount) => (
            <Button
              key={amount}
              variant="secondary"
              size="sm"
              disabled={highestBid + addedBid + amount > availableGold}
              onClick={() => setAddedBid((prev) => prev + amount)}
            >
              +{amount}G
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            disabled={addedBid === 0}
            onClick={() => setAddedBid(0)}
          >
            초기화
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!canBid}
            onClick={() => {
              onPlaceBid(totalBid);
              setAddedBid(0);
            }}
          >
            입찰하기
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function TestAuctionPage() {
  const timerEnd = useMemo(() => Date.now() + 25_000, []);
  const [highestBid, setHighestBid] = useState(350);
  const [highestBidder, setHighestBidder] = useState<string | null>("team-1");
  const [highestBidderName, setHighestBidderName] = useState("Haru");
  const leftTeams = mockTeams.slice(0, Math.ceil(mockTeams.length / 2));
  const rightTeams = mockTeams.slice(Math.ceil(mockTeams.length / 2));

  return (
    <main className="h-full overflow-hidden bg-bg-primary p-4">
      <div className="mx-auto flex h-full max-w-[1720px] flex-col">
        <div className="mb-3 flex h-12 shrink-0 items-end justify-between">
          <div>
            <h1 className="text-xl font-bold text-text-primary">경매 테스트</h1>
            <p className="text-xs text-text-tertiary">좌팀 · 중앙 경매 · 우팀 · 남은 매물</p>
          </div>
          <div className="hidden items-center gap-2 text-xs text-text-tertiary lg:flex">
            <span>현재 매물</span>
            <span className="rounded bg-bg-secondary px-2 py-1 font-semibold text-text-primary">{mockPlayers[0].username}</span>
            <span>남은 매물 {mockPlayers.length - 1}명</span>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 items-stretch gap-3 lg:grid-cols-[260px_minmax(0,1fr)_260px] xl:grid-cols-[280px_minmax(0,1fr)_280px]">
          <TeamSideColumn teams={leftTeams} currentHighestBidder={highestBidder} />

          <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
            <div className="shrink-0">
              <AuctionBoard
                auctionState={{
                  currentPlayer: mockPlayers[0],
                  currentPlayerIndex: 0,
                  currentHighestBid: highestBid,
                  currentHighestBidder: highestBidder,
                  currentHighestBidderName: highestBidderName,
                  timerEnd,
                  status: "IN_PROGRESS",
                  yuchalCount: 1,
                  maxYuchalCycles: 3,
                  bidIncrement: 50,
                }}
                teams={mockTeams}
                players={mockPlayers}
                currentUserId={currentUserId}
                bidHistory={mockBidHistory}
                hideTeams
                hideBidPanel
                onPlaceBid={(amount) => {
                  setHighestBid(amount);
                  setHighestBidder("team-1");
                  setHighestBidderName("Haru");
                }}
              />
            </div>

            <div className="flex-1 min-h-0">
              <CenterBottomPanel players={mockPlayers} />
            </div>
            <TestBidPanel
              highestBid={highestBid}
              onPlaceBid={(amount) => {
                setHighestBid(amount);
                setHighestBidder("team-1");
                setHighestBidderName("Haru");
              }}
            />
          </div>

          <TeamSideColumn teams={rightTeams} currentHighestBidder={highestBidder} />
        </div>
      </div>
    </main>
  );
}
