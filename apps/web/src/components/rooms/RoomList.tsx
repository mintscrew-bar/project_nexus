"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { roomApi } from "@/lib/api-client";
import { connectRoomSocket, roomSocketHelpers } from "@/lib/socket-client";
import { useDebounce } from "@/hooks/useDebounce";
import { useKeyboardShortcutsContext } from "@/components/KeyboardShortcuts";
import { RoomCard } from "@/components/domain";
import { EmptyState, Input, RoomCardSkeleton } from "@/components/ui";
import { RefreshCcw, Home, Search, Users, Clock, CheckCircle, Gavel, ListOrdered, X, ArrowUpDown, Scale, ArrowLeftRight } from "lucide-react";

type StatusFilter = "ALL" | "WAITING" | "IN_PROGRESS" | "COMPLETED";
type ModeFilter = "ALL" | "AUCTION" | "SNAKE_DRAFT" | "AUTO_BALANCE" | "MANUAL_TEAM";
type SortOption = "newest" | "oldest" | "mostPlayers" | "leastPlayers";

const IN_PROGRESS_STATUSES = new Set([
  "IN_PROGRESS",
  "TEAM_SELECTION",
  "DRAFT",
  "ROLE_SELECTION",
  "DRAFT_COMPLETED",
]);

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "newest", label: "최신순" },
  { value: "oldest", label: "오래된순" },
  { value: "mostPlayers", label: "인원 많은순" },
  { value: "leastPlayers", label: "인원 적은순" },
];

export function RoomList() {
  const router = useRouter();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const authLoading = useAuthStore((state) => state.isLoading);
  const { setSearchRef } = useKeyboardShortcutsContext();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [totalRooms, setTotalRooms] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const nextCursorRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [modeFilter, setModeFilter] = useState<ModeFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnlyJoinable, setShowOnlyJoinable] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  // Debounce search query to improve performance
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Register search input for keyboard shortcut
  useEffect(() => {
    if (searchInputRef.current) {
      setSearchRef(searchInputRef.current);
    }
    return () => setSearchRef(null);
  }, [setSearchRef]);

  const roomQuery = useMemo(() => ({
    status: statusFilter === "ALL" ? undefined : statusFilter,
    teamMode: modeFilter === "ALL" ? undefined : modeFilter,
    search: debouncedSearchQuery || undefined,
    sort: sortBy,
    limit: 24,
  }), [statusFilter, modeFilter, debouncedSearchQuery, sortBy]);

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
    router.push(`/tournaments/${roomId}/lobby`);
  };

  if (isLoading && rooms.length === 0) {
    return (
      <div className="space-y-4">
        {/* Skeleton Filters */}
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="h-10 w-full max-w-md bg-bg-tertiary rounded-lg skeleton" />
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 w-20 bg-bg-tertiary rounded-lg skeleton" />
            ))}
          </div>
        </div>
        {/* Skeleton Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <RoomCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={RefreshCcw}
        title="방 목록을 불러올 수 없습니다"
        description={error}
        action={{
          label: "다시 시도",
          onClick: () => void loadRooms(),
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Search */}
        <div className="relative w-full lg:max-w-md lg:flex-grow">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
          <Input
            ref={searchInputRef}
            type="text"
            placeholder="방 이름 또는 방장으로 검색... (/ 또는 Ctrl+K)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-text-tertiary hover:text-text-primary hover:bg-bg-elevated transition-colors"
              aria-label="검색어 지우기"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible lg:pb-0">
          <button
            onClick={() => setStatusFilter("ALL")}
            className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              statusFilter === "ALL"
                ? "bg-accent-primary text-white"
                : "bg-bg-tertiary text-text-secondary hover:bg-bg-elevated"
            }`}
          >
            전체
          </button>
          <button
            onClick={() => setStatusFilter("WAITING")}
            className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              statusFilter === "WAITING"
                ? "bg-accent-primary text-white"
                : "bg-bg-tertiary text-text-secondary hover:bg-bg-elevated"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            대기 중
          </button>
          <button
            onClick={() => setStatusFilter("IN_PROGRESS")}
            className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              statusFilter === "IN_PROGRESS"
                ? "bg-accent-primary text-white"
                : "bg-bg-tertiary text-text-secondary hover:bg-bg-elevated"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            진행 중
          </button>
          <button
            onClick={() => setStatusFilter("COMPLETED")}
            className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              statusFilter === "COMPLETED"
                ? "bg-accent-primary text-white"
                : "bg-bg-tertiary text-text-secondary hover:bg-bg-elevated"
            }`}
          >
            <CheckCircle className="h-3.5 w-3.5" />
            완료
          </button>
        </div>
      </div>

      {/* Second row filters — 모바일: 세로로 쌓아 좌측 정렬 / 데스크톱: 한 줄 배치 */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
        {/* Mode Filter */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm text-text-secondary">모드:</span>
          <button
            onClick={() => setModeFilter("ALL")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              modeFilter === "ALL"
                ? "bg-accent-primary/20 text-accent-primary"
                : "bg-bg-tertiary text-text-secondary hover:bg-bg-elevated"
            }`}
          >
            전체
          </button>
          <button
            onClick={() => setModeFilter("AUCTION")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
              modeFilter === "AUCTION"
                ? "bg-accent-primary/20 text-accent-primary"
                : "bg-bg-tertiary text-text-secondary hover:bg-bg-elevated"
            }`}
          >
            <Gavel className="h-3 w-3" />
            경매
          </button>
          <button
            onClick={() => setModeFilter("SNAKE_DRAFT")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
              modeFilter === "SNAKE_DRAFT"
                ? "bg-accent-primary/20 text-accent-primary"
                : "bg-bg-tertiary text-text-secondary hover:bg-bg-elevated"
            }`}
          >
            <ListOrdered className="h-3 w-3" />
            스네이크
          </button>
          <button
            onClick={() => setModeFilter("AUTO_BALANCE")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
              modeFilter === "AUTO_BALANCE"
                ? "bg-accent-primary/20 text-accent-primary"
                : "bg-bg-tertiary text-text-secondary hover:bg-bg-elevated"
            }`}
          >
            <Scale className="h-3 w-3" />
            자동 밸런스
          </button>
          <button
            onClick={() => setModeFilter("MANUAL_TEAM")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
              modeFilter === "MANUAL_TEAM"
                ? "bg-accent-primary/20 text-accent-primary"
                : "bg-bg-tertiary text-text-secondary hover:bg-bg-elevated"
            }`}
          >
            <ArrowLeftRight className="h-3 w-3" />
            자유 팀 선택
          </button>
        </div>

        {/* Joinable only toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showOnlyJoinable}
            onChange={(e) => setShowOnlyJoinable(e.target.checked)}
            className="w-4 h-4 accent-accent-primary cursor-pointer rounded"
          />
          <span className="text-sm text-text-secondary">참가 가능한 방만</span>
        </label>

        {/* Sort Options */}
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:ml-auto">
          <ArrowUpDown className="h-4 w-4 text-text-tertiary flex-shrink-0" />
          <div className="flex items-center gap-1 flex-wrap">
            {sortOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setSortBy(option.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  sortBy === option.value
                    ? "bg-accent-primary/20 text-accent-primary"
                    : "bg-bg-tertiary text-text-secondary hover:bg-bg-elevated"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      {visibleRooms.length === 0 ? (
        rooms.length === 0 ? (
          <EmptyState
            icon={Home}
            title="생성된 내전 방이 없습니다"
            description="새로운 방을 생성해서 친구들과 내전을 시작해보세요!"
          />
        ) : (
          <EmptyState
            icon={Search}
            title="조건에 맞는 방이 없습니다"
            description="필터 조건을 변경하거나 검색어를 수정해보세요."
            action={{
              label: "필터 초기화",
              onClick: () => {
                setStatusFilter("ALL");
                setModeFilter("ALL");
                setSearchQuery("");
                setShowOnlyJoinable(false);
                setSortBy("newest");
              },
            }}
          />
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
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
