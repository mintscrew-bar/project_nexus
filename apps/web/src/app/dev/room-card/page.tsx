"use client";

// 개발용 프리뷰 — 내전 목록 RoomCard 상태별 디자인 확인 페이지
// 접속: http://localhost:3000/dev/room-card

import { RoomCard } from "@/components/domain/RoomCard";

const NOW = Date.now();

const MOCK_ROOMS = [
  {
    id: "preview-auction",
    name: "금요일 밤 5:5 내전",
    hostId: "host-auction",
    host: { id: "host-auction", username: "NEXUS_운영진" },
    maxParticipants: 10,
    isPrivate: false,
    status: "WAITING" as const,
    teamMode: "AUCTION" as const,
    discordGuildId: null,
    allowSpectators: true,
    createdAt: new Date(NOW - 1000 * 60 * 7).toISOString(),
    participants: Array.from({ length: 8 }, (_, index) => ({
      userId: `auction-player-${index}`,
    })),
  },
  {
    id: "preview-balance",
    name: "티어 맞춰서 즐겜하실 분",
    hostId: "host-balance",
    host: { id: "host-balance", username: "밸런스장인" },
    maxParticipants: 10,
    isPrivate: false,
    status: "IN_PROGRESS" as const,
    teamMode: "AUTO_BALANCE" as const,
    discordGuildId: "guild-balance-preview",
    allowSpectators: true,
    createdAt: new Date(NOW - 1000 * 60 * 38).toISOString(),
    participants: [
      { userId: "preview-user" },
      ...Array.from({ length: 9 }, (_, index) => ({
        userId: `balance-player-${index}`,
      })),
    ],
  },
  {
    id: "preview-private",
    name: "클랜 정기 내전 A조",
    hostId: "host-private",
    host: { id: "host-private", username: "NXS 클랜장" },
    maxParticipants: 40,
    isPrivate: true,
    status: "WAITING" as const,
    teamMode: "SNAKE_DRAFT" as const,
    discordGuildId: "guild-private-preview",
    allowSpectators: false,
    createdAt: new Date(NOW - 1000 * 60 * 60 * 2).toISOString(),
    participants: Array.from({ length: 40 }, (_, index) => ({
      userId: `private-player-${index}`,
    })),
  },
];

export default function RoomCardPreviewPage() {
  return (
    <div className="min-h-full flex-grow bg-bg-primary px-5 py-10 sm:px-6 md:py-14 lg:px-10">
      <div className="mx-auto max-w-[1480px]">
        <div className="mb-8 border-b border-bg-tertiary pb-8">
          <p className="text-[10px] font-bold tracking-[0.2em] text-accent-gold">
            ROOM CARD PREVIEW
          </p>
          <h1 className="mt-4 text-4xl font-black tracking-[-0.05em] text-text-primary">
            내전 방 카드
          </h1>
          <p className="mt-3 text-sm text-text-secondary">
            대기 중, 진행 중, 비공개·정원 마감 상태 미리보기
          </p>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-6">
          {MOCK_ROOMS.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              currentUserId="preview-user"
              onClick={() => undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
