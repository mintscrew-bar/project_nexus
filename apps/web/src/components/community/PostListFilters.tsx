"use client";

import { useRef, useEffect } from "react";
import { Search, Tag, X } from "lucide-react";
import { Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import { SORT_OPTIONS } from "./community-types";
import { useCommunityStore } from "@/stores/community-store";
import { useKeyboardShortcutsContext } from "@/components/KeyboardShortcuts";

interface PostListFiltersProps {
  popularTags: { name: string; count: number }[];
  /**
   * 검색·정렬 줄 오른쪽 끝에 붙는 동작 버튼(글쓰기).
   *
   * 버튼 자체는 페이지가 만든다 — 로그인 여부와 이동 경로는 페이지가 알고,
   * 이 컴포넌트는 자리만 내준다.
   */
  action?: React.ReactNode;
}

/**
 * 검색 입력 + 정렬 토글 + 인기 태그 행 필터바.
 * 검색어 debounce는 page.tsx 에서 처리 (queryKey에 사용).
 */
export function PostListFilters({ popularTags, action }: PostListFiltersProps) {
  const searchQuery = useCommunityStore((s) => s.searchQuery);
  const setSearchQuery = useCommunityStore((s) => s.setSearchQuery);
  const sortBy = useCommunityStore((s) => s.sortBy);
  const setSortBy = useCommunityStore((s) => s.setSortBy);
  const selectedTag = useCommunityStore((s) => s.selectedTag);
  const setSelectedTag = useCommunityStore((s) => s.setSelectedTag);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const { setSearchRef, setActionHandler } = useKeyboardShortcutsContext();

  // 키보드 단축키 연동
  useEffect(() => {
    if (searchInputRef.current) setSearchRef(searchInputRef.current);
    return () => {
      setSearchRef(null);
      setActionHandler(null);
    };
  }, [setSearchRef, setActionHandler]);

  return (
    <div className="space-y-3 mb-4">
      {/* 검색 + 정렬 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-grow">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
          <Input
            ref={searchInputRef}
            type="text"
            aria-label="게시글 검색"
            placeholder="제목, 내용, 작성자 검색... (/ 또는 Ctrl+K)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        {/* 정렬 + 글쓰기. 좁은 화면에서는 검색창 아래 한 줄을 같이 쓴다. */}
        <div className="flex flex-shrink-0 items-center gap-2">
          <div className="flex flex-grow items-center gap-0.5 rounded-lg bg-bg-tertiary p-1 sm:flex-grow-0">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSortBy(opt.value)}
                className={cn(
                  "flex-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors sm:flex-none",
                  sortBy === opt.value
                    ? "bg-bg-secondary text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {action}
        </div>
      </div>

      {/* 인기 태그 / 태그 필터 */}
      {(popularTags.length > 0 || selectedTag) && (
        <div className="flex items-center gap-2 flex-wrap">
          <Tag className="h-3.5 w-3.5 text-text-tertiary flex-shrink-0" />
          {/* 현재 선택된 태그 (X 버튼) */}
          {selectedTag && (
            <button
              onClick={() => setSelectedTag("")}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent-primary text-accent-on text-xs"
            >
              #{selectedTag}
              <X className="h-3 w-3" />
            </button>
          )}
          {/* 인기 태그 목록 (선택된 태그 제외) */}
          {popularTags
            .filter((t) => t.name !== selectedTag)
            .slice(0, 12)
            .map((t) => (
              <button
                key={t.name}
                onClick={() => setSelectedTag(t.name)}
                className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-bg-tertiary text-text-secondary text-xs hover:bg-accent-primary/15 hover:text-accent-primary transition-colors"
              >
                #{t.name}
                <span className="text-text-tertiary ml-0.5">{t.count}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
