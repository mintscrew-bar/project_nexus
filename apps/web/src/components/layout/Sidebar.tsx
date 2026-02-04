'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus, Swords, Users, Trophy, Clock, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { roomApi } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { Skeleton } from '@/components/ui';

interface Room {
  id: string;
  name: string;
  hostUser: { username: string };
  maxParticipants: number;
  currentParticipants: number;
  teamMode: string;
  status: string;
}

export function Sidebar() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuthStore();
  const [recentRooms, setRecentRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      fetchRecentRooms();
    }
  }, [isAuthenticated]);

  const fetchRecentRooms = async () => {
    setIsLoading(true);
    try {
      const rooms = await roomApi.getRooms({ status: 'WAITING' });
      setRecentRooms(rooms.slice(0, 5));
    } catch (error) {
      console.error('Failed to fetch rooms:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="w-64 bg-bg-secondary border-r border-bg-tertiary p-4 hidden md:block flex-shrink-0 overflow-y-auto">
      {/* Quick Actions */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3 px-2">
          빠른 메뉴
        </h2>
        <nav className="space-y-1">
          <Link
            href="/tournaments"
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150',
              isActive('/tournaments')
                ? 'bg-accent-primary/10 text-accent-primary'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
            )}
          >
            <Swords className="h-4 w-4" />
            <span className="font-medium">내전 찾기</span>
          </Link>
          {isAuthenticated && (
            <Link
              href="/tournaments?create=true"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors duration-150"
            >
              <Plus className="h-4 w-4" />
              <span className="font-medium">방 만들기</span>
            </Link>
          )}
          <Link
            href="/matches"
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors duration-150',
              isActive('/matches')
                ? 'bg-accent-primary/10 text-accent-primary'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
            )}
          >
            <Trophy className="h-4 w-4" />
            <span className="font-medium">전적 검색</span>
          </Link>
        </nav>
      </div>

      {/* Open Rooms */}
      {isAuthenticated && (
        <div>
          <div className="flex items-center justify-between mb-3 px-2">
            <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
              열린 방
            </h2>
            <Link
              href="/tournaments"
              className="text-xs text-accent-primary hover:underline"
            >
              전체 보기
            </Link>
          </div>

          {isLoading ? (
            <div className="space-y-2 px-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : recentRooms.length > 0 ? (
            <div className="space-y-2">
              {recentRooms.map((room) => (
                <Link
                  key={room.id}
                  href={`/tournaments/${room.id}/lobby`}
                  className="block p-3 rounded-lg bg-bg-tertiary hover:bg-bg-elevated transition-colors group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-text-primary text-sm truncate pr-2">
                      {room.name}
                    </span>
                    <ChevronRight className="h-4 w-4 text-text-tertiary group-hover:text-accent-primary transition-colors flex-shrink-0" />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-text-tertiary">
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      <span>{room.currentParticipants || 0}/{room.maxParticipants}</span>
                    </div>
                    <span className="text-text-quaternary">•</span>
                    <span>{room.teamMode === 'AUCTION' ? '경매' : '스네이크'}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 px-2">
              <Clock className="h-8 w-8 mx-auto mb-2 text-text-tertiary" />
              <p className="text-sm text-text-tertiary">
                열린 방이 없습니다
              </p>
              <Link
                href="/tournaments?create=true"
                className="text-sm text-accent-primary hover:underline mt-1 inline-block"
              >
                새 방 만들기
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Guest State */}
      {!isAuthenticated && (
        <div className="mt-4 p-4 rounded-lg bg-bg-tertiary text-center">
          <Users className="h-8 w-8 mx-auto mb-2 text-text-tertiary" />
          <p className="text-sm text-text-secondary mb-3">
            로그인하고 내전에 참여하세요
          </p>
          <Link
            href="/auth/login"
            className="inline-block px-4 py-2 bg-accent-primary hover:bg-accent-hover text-white font-medium rounded-lg transition-colors text-sm"
          >
            로그인
          </Link>
        </div>
      )}
    </aside>
  );
}
