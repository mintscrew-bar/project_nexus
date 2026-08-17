"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  RoomList,
  roomSortOptions,
  type SortOption,
  type StatusFilter,
} from "@/components/rooms/RoomList";
import { RoomCreationForm } from "@/components/rooms/RoomCreationForm";
import { Button, Input, Modal } from "@/components/ui";
import { useKeyboardShortcutsContext } from "@/components/KeyboardShortcuts";
import {
  ArrowUpDown,
  CheckCircle,
  Clock,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { TournamentsTour } from "@/components/onboarding/TournamentsTour";
import { AdSlotCard } from "@/components/ads/AdSlot";

export default function TournamentsPage() {
  const router = useRouter();
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [showOnlyJoinable, setShowOnlyJoinable] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { setActionHandler, setSearchRef } = useKeyboardShortcutsContext();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const authLoading = useAuthStore((state) => state.isLoading);

  const openRoomCreation = useCallback(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push("/auth/login?redirect=/tournaments");
      return;
    }
    setIsCreatingRoom(true);
  }, [authLoading, isAuthenticated, router]);

  // Register "n" key to open room creation modal
  useEffect(() => {
    const handler = () => openRoomCreation();
    setActionHandler(handler);
    return () => {
      setActionHandler(null);
    };
  }, [setActionHandler, openRoomCreation]);

  useEffect(() => {
    setSearchRef(searchInputRef.current);
    return () => setSearchRef(null);
  }, [setSearchRef]);

  return (
    <div className="flex-grow bg-bg-primary">
      {isAuthenticated && <TournamentsTour />}
      <div className="w-full px-5 py-8 sm:px-6 md:py-10 lg:px-8">
        <header className="grid gap-6 border-b border-bg-tertiary/70 pb-8 md:pb-10 lg:grid-cols-[minmax(18rem,1fr)_minmax(34rem,52rem)] lg:items-start">
          <div>
            <h1 className="text-3xl font-bold tracking-[-0.035em] text-text-primary sm:text-4xl">
              롤 내전 방 목록
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-text-secondary">
              참여할 내전 방을 선택하거나 새로 만들어보세요
            </p>
          </div>

          <div className="min-w-0">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                <Input
                  ref={searchInputRef}
                  type="text"
                  aria-label="내전 방 검색"
                  placeholder="방 이름 또는 방장으로 검색... (/ 또는 Ctrl+K)"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="h-11 rounded-xl border-bg-elevated bg-bg-secondary/70 pl-10 pr-10"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-text-tertiary transition-colors hover:bg-bg-elevated hover:text-text-primary"
                    aria-label="검색어 지우기"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div data-tour="tournaments-create" className="flex-none">
                <Button
                  onClick={openRoomCreation}
                  className="h-11 w-full rounded-lg px-5 text-sm font-semibold sm:w-auto"
                >
                  <Plus className="mr-2 h-4 w-4" />방 생성
                </Button>
              </div>
            </div>

            <div
              data-tour="tournaments-filters"
              className="mt-3 flex flex-wrap items-center gap-2"
            >
              <div className="scrollbar-none flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-bg-secondary/55 p-1">
                {[
                  { value: "ALL" as const, label: "전체", icon: null },
                  { value: "WAITING" as const, label: "대기 중", icon: Clock },
                  {
                    value: "IN_PROGRESS" as const,
                    label: "진행 중",
                    icon: Users,
                  },
                  {
                    value: "COMPLETED" as const,
                    label: "완료",
                    icon: CheckCircle,
                  },
                ].map((option) => {
                  const Icon = option.icon;
                  const isSelected = statusFilter === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setStatusFilter(option.value)}
                      className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                        isSelected
                          ? "bg-accent-primary/15 text-accent-primary"
                          : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
                      }`}
                    >
                      {Icon && <Icon className="h-3.5 w-3.5" />}
                      {option.label}
                    </button>
                  );
                })}
              </div>

              <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-bg-secondary/55 px-3 py-2 transition-colors hover:bg-bg-elevated/60">
                <input
                  type="checkbox"
                  checked={showOnlyJoinable}
                  onChange={(event) =>
                    setShowOnlyJoinable(event.target.checked)
                  }
                  className="h-4 w-4 cursor-pointer rounded accent-accent-primary"
                />
                <span className="whitespace-nowrap text-xs font-medium text-text-secondary">
                  참가 가능한 방만
                </span>
              </label>

              <label className="relative ml-auto flex items-center gap-2 rounded-lg bg-bg-secondary/55 px-3 py-2 text-text-tertiary">
                <ArrowUpDown className="h-3.5 w-3.5 flex-none" />
                <select
                  aria-label="방 정렬"
                  value={sortBy}
                  onChange={(event) =>
                    setSortBy(event.target.value as SortOption)
                  }
                  className="cursor-pointer bg-transparent pr-1 text-xs font-medium text-text-secondary outline-none"
                >
                  {roomSortOptions.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      className="bg-bg-secondary text-text-primary"
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </header>

        <AdSlotCard slotKey="feed" minHeight={90} className="mt-5" />

        <section data-tour="tournaments-results" className="py-8">
          <RoomList
            onCreateRoom={openRoomCreation}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            showOnlyJoinable={showOnlyJoinable}
            onShowOnlyJoinableChange={setShowOnlyJoinable}
            sortBy={sortBy}
            onSortByChange={setSortBy}
          />
        </section>

        <Modal
          isOpen={isCreatingRoom}
          onClose={() => setIsCreatingRoom(false)}
          title="새 내전 방 생성"
          size="md"
        >
          <RoomCreationForm onCancel={() => setIsCreatingRoom(false)} />
        </Modal>
      </div>
    </div>
  );
}
