'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, Radio, Users } from 'lucide-react';
import { useLobbyStore } from '@/stores/lobby-store';

export function ActiveRoomBanner() {
  const pathname = usePathname();
  const room = useLobbyStore((state) => state.room);
  const isConnected = useLobbyStore((state) => state.isConnected);
  const gameStarting = useLobbyStore((state) => state.gameStarting);

  const roomRoutes = [
    `/tournaments/${room?.id}/lobby`,
    `/tournaments/${room?.id}/bracket`,
    `/auction/${room?.id}`,
    `/draft/${room?.id}`,
    `/role-selection/${room?.id}`,
  ];
  if (!room || roomRoutes.some((route) => pathname.startsWith(route))) return null;

  return (
    <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-accent-primary/25 bg-accent-primary/10 px-4 py-2.5 text-sm md:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        {gameStarting ? (
          <Radio className="h-4 w-4 flex-shrink-0 animate-pulse text-accent-primary" />
        ) : (
          <Users className="h-4 w-4 flex-shrink-0 text-accent-primary" />
        )}
        <div className="min-w-0">
          <p className="truncate font-semibold text-text-primary">
            {gameStarting ? '게임이 시작되고 있습니다' : `참가 중 · ${room.name}`}
          </p>
          <p className="text-xs text-text-secondary">
            {isConnected ? '다른 페이지에서도 방 연결을 유지하고 있습니다.' : '방에 다시 연결하는 중입니다.'}
          </p>
        </div>
      </div>
      <Link
        href={`/tournaments/${room.id}/lobby`}
        className="inline-flex min-h-11 flex-shrink-0 items-center gap-1.5 rounded-lg bg-accent-primary px-3 py-2 font-semibold text-white transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
      >
        돌아가기
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
