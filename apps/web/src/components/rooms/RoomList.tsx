"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo, useRef } from "react";
import { useRoomStore } from "@/stores/room-store";
import { useDebounce } from "@/hooks/useDebounce";
import { useKeyboardShortcutsContext } from "@/components/KeyboardShortcuts";
import { RoomCard } from "@/components/domain";
import { EmptyState, Badge, Input, RoomCardSkeleton } from "@/components/ui";
import { RefreshCcw, Home, Search, Users, Clock, CheckCircle, Gavel, ListOrdered, X, ArrowUpDown, Calendar, TrendingUp } from "lucide-react";

type StatusFilter = "ALL" | "WAITING" | "IN_PROGRESS" | "COMPLETED";
type ModeFilter = "ALL" | "AUCTION" | "SNAKE_DRAFT";
type SortOption = "newest" | "oldest" | "mostPlayers" | "leastPlayers";

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "newest", label: "최신순" },
  { value: "oldest", label: "오래된순" },
  { value: "mostPlayers", label: "인원 많은순" },
  { value: "leastPlayers", label: "인원 적은순" },
];

export function RoomList() {
  const router = useRouter();
  const { rooms, isLoading, error, fetchRooms, subscribeToRoomList, unsubscribeFromRoomList } = useRoomStore();
  const { setSearchRef } = useKeyboardShortcutsContext();
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  const filteredAndSortedRooms = useMemo(() => {
    // First filter
    const filtered = rooms.filter((room) => {
      // Status filter
      if (statusFilter !== "ALL" && room.status !== statusFilter) {
        return false;
      }

      // Mode filter
      if (modeFilter !== "ALL" && room.teamMode !== modeFilter) {
        return false;
      }

      // Search filter (using debounced value)
      if (debouncedSearchQuery) {
        const query = debouncedSearchQuery.toLowerCase();
        const roomName = room.name.toLowerCase();
        const hostName = (room as any).hostName?.toLowerCase() || "";
        if (!roomName.includes(query) && !hostName.includes(query)) {
          return false;
        }
      }

      // Joinable filter
      if (showOnlyJoinable) {
        const currentPlayers = room.participants?.length || 0;
        const isFull = currentPlayers >= room.maxParticipants;
        if (room.status !== "WAITING" || isFull) {
          return false;
        }
      }

      return true;
    });

    // Then sort
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "mostPlayers":
          return (b.participants?.length || 0) - (a.participants?.length || 0);
        case "leastPlayers":
          return (a.participants?.length || 0) - (b.participants?.length || 0);
        default:
          return 0;
      }
    });
  }, [rooms, statusFilter, modeFilter, debouncedSearchQuery, showOnlyJoinable, sortBy]);

  // Count rooms by status
  const statusCounts = useMemo(() => {
    return {
      ALL: rooms.length,
      WAITING: rooms.filter(r => r.status === "WAITING").length,
      IN_PROGRESS: rooms.filter(r => r.status === "IN_PROGRESS").length,
      COMPLETED: rooms.filter(r => r.status === "COMPLETED").length,
    };
  }, [rooms]);

  useEffect(() => {
    // Initial fetch
    fetchRooms();

    // Subscribe to real-time updates
    subscribeToRoomList();

    return () => {
      unsubscribeFromRoomList();
    };
  }, [fetchRooms, subscribeToRoomList, unsubscribeFromRoomList]);

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
          onClick: () => fetchRooms(),
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Search */}
        <div className="relative flex-grow max-w-md">
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
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setStatusFilter("ALL")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              statusFilter === "ALL"
                ? "bg-accent-primary text-white"
                : "bg-bg-tertiary text-text-secondary hover:bg-bg-elevated"
            }`}
          >
            전체
            <Badge variant="default" size="sm">{statusCounts.ALL}</Badge>
          </button>
          <button
            onClick={() => setStatusFilter("WAITING")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              statusFilter === "WAITING"
                ? "bg-accent-primary text-white"
                : "bg-bg-tertiary text-text-secondary hover:bg-bg-elevated"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            대기 중
            <Badge variant={statusFilter === "WAITING" ? "default" : "success"} size="sm">{statusCounts.WAITING}</Badge>
          </button>
          <button
            onClick={() => setStatusFilter("IN_PROGRESS")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              statusFilter === "IN_PROGRESS"
                ? "bg-accent-primary text-white"
                : "bg-bg-tertiary text-text-secondary hover:bg-bg-elevated"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            진행 중
            <Badge variant={statusFilter === "IN_PROGRESS" ? "default" : "primary"} size="sm">{statusCounts.IN_PROGRESS}</Badge>
          </button>
          <button
            onClick={() => setStatusFilter("COMPLETED")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              statusFilter === "COMPLETED"
                ? "bg-accent-primary text-white"
                : "bg-bg-tertiary text-text-secondary hover:bg-bg-elevated"
            }`}
          >
            <CheckCircle className="h-3.5 w-3.5" />
            완료
            <Badge variant="default" size="sm">{statusCounts.COMPLETED}</Badge>
          </button>
        </div>
      </div>

      {/* Second row filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Mode Filter */}
        <div className="flex items-center gap-2">
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
        <div className="flex items-center gap-2 ml-auto">
          <ArrowUpDown className="h-4 w-4 text-text-tertiary" />
          <div className="flex items-center gap-1">
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
      {filteredAndSortedRooms.length === 0 ? (
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
          {filteredAndSortedRooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              onClick={() => router.push(`/tournaments/${room.id}/lobby`)}
            />
          ))}
        </div>
      )}

      {/* Results count */}
      {filteredAndSortedRooms.length > 0 && (
        <p className="text-sm text-text-tertiary text-center pt-2">
          총 {filteredAndSortedRooms.length}개의 방
          {filteredAndSortedRooms.length !== rooms.length && ` (전체 ${rooms.length}개)`}
        </p>
      )}
    </div>
  );
}
