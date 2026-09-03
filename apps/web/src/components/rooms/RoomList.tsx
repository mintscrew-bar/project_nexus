"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { roomApi } from "@/lib/api-client";
import { connectRoomSocket, roomSocketHelpers } from "@/lib/socket-client";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";
import { NEXUS_DISCORD_INVITE_URL } from "@/lib/constants";
import { RoomCard } from "@/components/domain";
import { EmptyState, RoomCardSkeleton } from "@/components/ui";
import { RefreshCcw, Home, Search, Gavel, ListOrdered, Scale, ArrowLeftRight, LayoutGrid } from "lucide-react";
import { GAMES } from "@nexus/types";

export type StatusFilter = "ALL" | "WAITING" | "IN_PROGRESS" | "COMPLETED";
type ModeFilter = "ALL" | "AUCTION" | "SNAKE_DRAFT" | "AUTO_BALANCE" | "MANUAL_TEAM";
export type SortOption = "newest" | "oldest" | "mostPlayers" | "leastPlayers";

const IN_PROGRESS_STATUSES = new Set([
  "IN_PROGRESS",
  "TEAM_SELECTION",
  "DRAFT",
  "ROLE_SELECTION",
  "DRAFT_COMPLETED",
]);

export const roomSortOptions: { value: SortOption; label: string }[] = [
  { value: "newest", label: "최신순" },
  { value: "oldest", label: "오래된순" },
  { value: "mostPlayers", label: "인원 많은순" },
  { value: "leastPlayers", label: "인원 적은순" },
];

const modeOptions = [
  {
    value: "ALL" as const,
    label: "전체",
    description: "모든 방식의 방 보기",
    icon: LayoutGrid,
  },
  {
    value: "AUCTION" as const,
    label: "경매",
    description: "포인트로 팀원을 영입",
    icon: Gavel,
  },
  {
    value: "SNAKE_DRAFT" as const,
    label: "스네이크",
    description: "순서대로 번갈아 선택",
    icon: ListOrdered,
  },
  {
    value: "AUTO_BALANCE" as const,
    label: "자동 밸런스",
    description: "티어 기준으로 자동 구성",
    icon: Scale,
  },
  {
    value: "MANUAL_TEAM" as const,
    label: "자유 팀 선택",
    description: "원하는 팀을 직접 선택",
    icon: ArrowLeftRight,
  },
];

interface RoomListProps {
  gameTitle?: "LOL" | "PUBG";
  /** 빈 목록 상태에서 방 생성 모달을 여는 콜백 (페이지가 모달과 로그인 리다이렉트를 소유) */
  onCreateRoom?: () => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  showOnlyJoinable: boolean;
  onShowOnlyJoinableChange: (value: boolean) => void;
  sortBy: SortOption;
  onSortByChange: (value: SortOption) => void;
}

export function RoomList({
  gameTitle = "LOL",
  onCreateRoom,
  searchQuery,
  onSearchQueryChange,
  statusFilter,
  onStatusFilterChange,
  showOnlyJoinable,
  onShowOnlyJoinableChange,
  sortBy,
  onSortByChange,
}: RoomListProps) {
  const router = useRouter();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const authLoading = useAuthStore((state) => state.isLoading);
  const [rooms, setRooms] = useState<any[]>([]);
  const [totalRooms, setTotalRooms] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const nextCursorRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modeFilter, setModeFilter] = useState<ModeFilter>("ALL");

  // Debounce search query to improve performance
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const roomQuery = useMemo(() => ({
    gameTitle,
    status: statusFilter === "ALL" ? undefined : statusFilter,
    teamMode: modeFilter === "ALL" ? undefined : modeFilter,
    search: debouncedSearchQuery || undefined,
    sort: sortBy,
    limit: 24,
  }), [gameTitle, statusFilter, modeFilter, debouncedSearchQuery, sortBy]);

  const loadRooms = useCallback(async (append = false) => {
    const cursor = nextCursorRef.current;
    if (append && !cursor) return;
    append ? setIsLoadingMore(true) : setIsLoading(true);
    setError(null);
    try {
      const page = await roomApi.getRooms({
        ...roomQuery,
        ...(append ? { cursor: cursor ?? undefined } : {}),
      });
      setRooms((current) => {
        if (!append) return page.items;
        const ids = new Set(current.map((room: any) => room.id));
        return [...current, ...page.items.filter((room: any) => !ids.has(room.id))];
      });
      setTotalRooms(page.total);
      setNextCursor(page.nextCursor);
      nextCursorRef.current = page.nextCursor;
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? "방 목록을 불러오지 못했습니다.");
    } finally {
      append ? setIsLoadingMore(false) : setIsLoading(false);
    }
  }, [roomQuery]);

  const visibleRooms = useMemo(() => {
    if (!showOnlyJoinable) return rooms;
    return rooms.filter((room) => {
        const currentPlayers = room.participants?.length || 0;
        const isFull = currentPlayers >= room.maxParticipants;
        const isParticipant = !!currentUserId && (room.participants ?? []).some((p: any) => p.userId === currentUserId);
        const isJoinable = room.status === "WAITING" && !isFull;
        return isJoinable || isParticipant;
    });
  }, [rooms, showOnlyJoinable, currentUserId]);

  // 필터·정렬·검색은 서버가 처리하고, 변경될 때 첫 페이지부터 다시 불러온다.
  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  // 첫 페이지는 실시간 델타가 오면 서버 기준으로 다시 조회한다. 구독 응답의
  // 전체 배열은 무시해, 페이지네이션 상태를 덮어쓰지 않는다.
  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    if (!connectRoomSocket()) return;

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    roomSocketHelpers.subscribeRoomList(() => undefined);
    roomSocketHelpers.onRoomListUpdated(() => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void loadRooms(), 250);
    });

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      roomSocketHelpers.unsubscribeRoomList();
      roomSocketHelpers.offRoomListUpdated();
    };
  }, [authLoading, isAuthenticated, loadRooms]);

  const handleRoomClick = (roomId: string) => {
    if (!isAuthenticated) {
      const redirect = encodeURIComponent(`/tournaments/${roomId}/lobby`);
      router.push(`/auth/login?redirect=${redirect}`);
      return;
    }
    router.push(`/${GAMES[gameTitle].slug}/tournaments/${roomId}/lobby`);
  };

  return (
    <div className="space-y-8">
      <section aria-labelledby="room-mode-heading">
        <div className="mb-4">
          <h2 id="room-mode-heading" className="text-sm font-bold text-text-primary">
            모드 선택
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {modeOptions
            .filter((option) =>
              option.value === "ALL" ||
              GAMES[gameTitle].teamModes.includes(option.value),
            )
            .map((option) => {
            const Icon = option.icon;
            const isSelected = modeFilter === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setModeFilter(isSelected ? "ALL" : option.value)}
                aria-pressed={isSelected}
                className={cn(
                  "group flex min-w-0 items-center gap-3 rounded-xl border p-4 text-left transition-all duration-150",
                  isSelected
                    ? "border-accent-primary/40 bg-accent-primary/10 shadow-[0_8px_24px_rgb(var(--color-accent-primary)/0.08)]"
                    : "border-bg-tertiary/60 bg-bg-secondary/55 hover:border-bg-elevated hover:bg-bg-secondary"
                )}
              >
                <span className={cn(
                  "flex h-10 w-10 flex-none items-center justify-center rounded-lg transition-colors",
                  isSelected
                    ? "bg-accent-primary text-white"
                    : "bg-bg-elevated/50 text-text-secondary group-hover:text-text-primary"
                )}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className={cn(
                    "block truncate text-sm font-bold",
                    isSelected ? "text-accent-primary" : "text-text-primary"
                  )}>
                    {option.label}
                  </span>
                  <span className="mt-1 block truncate text-xs text-text-tertiary">
                    {option.description}
                  </span>
                </span>
              </button>
            );
            })}
        </div>
      </section>

      {/* Results */}
      {isLoading && rooms.length === 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <RoomCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          icon={RefreshCcw}
          title="방 목록을 불러올 수 없습니다"
          description={error}
          action={{
            label: "다시 시도",
            onClick: () => void loadRooms(),
          }}
          className="py-16 md:py-24"
        />
      ) : visibleRooms.length === 0 ? (
        rooms.length === 0 ? (
          <EmptyState
            icon={Home}
            title="아직 열린 내전 방이 없습니다"
            description={
              <>
                첫 방을 만들면 이 목록 맨 위에 바로 노출됩니다. 처음이라면 가이드에서 팀 구성
                방식을 먼저 확인해 보세요.{" "}
                <a
                  href={NEXUS_DISCORD_INVITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-primary hover:underline"
                >
                  Discord에서 같이 할 사람 찾기
                </a>
              </>
            }
            action={onCreateRoom ? { label: "방 만들기", onClick: onCreateRoom } : undefined}
            secondaryAction={{ label: "가이드 보기", href: "/guide" }}
            className="py-16 md:py-24"
          />
        ) : (
          <EmptyState
            icon={Search}
            title="조건에 맞는 방이 없습니다"
            description="필터 조건을 변경하거나 검색어를 수정해보세요."
            action={{
              label: "필터 초기화",
              onClick: () => {
                onStatusFilterChange("ALL");
                setModeFilter("ALL");
                onSearchQueryChange("");
                onShowOnlyJoinableChange(false);
                onSortByChange("newest");
              },
            }}
            className="py-16 md:py-24"
          />
        )
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-6 animate-fade-in">
          {visibleRooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              currentUserId={currentUserId}
              onClick={() => handleRoomClick(room.id)}
            />
          ))}
        </div>
      )}

      {/* Results count */}
      {rooms.length > 0 && (
        <div className="flex flex-col items-center gap-3 pt-2">
          <p className="text-center text-sm text-text-tertiary">
            {showOnlyJoinable ? `현재 불러온 방 중 ${visibleRooms.length}개 표시 · ` : ""}
            {rooms.length}/{totalRooms}개 불러옴
          </p>
          {nextCursor && (
            <button
              type="button"
              onClick={() => void loadRooms(true)}
              disabled={isLoadingMore}
              className="rounded-lg border border-bg-tertiary bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoadingMore ? "불러오는 중..." : "방 더 보기"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
