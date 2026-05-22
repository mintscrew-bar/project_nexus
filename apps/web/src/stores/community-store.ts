import { create } from "zustand";
import type { SortOption } from "@/components/community/community-types";

interface CommunityStoreState {
  // 선택된 게시판 슬러그 ("ALL"이면 전체) — 동적 게시판 도입으로 enum→슬러그 문자열
  selectedCategory: string;
  selectedTag: string;
  searchQuery: string;
  sortBy: SortOption;
  currentPage: number;

  // 게시판(카테고리) 변경 → 페이지 1로 리셋
  setSelectedCategory: (category: string) => void;
  // 태그 변경 → 페이지 1로 리셋
  setSelectedTag: (tag: string) => void;
  // 검색어 변경 → 페이지 1로 리셋
  setSearchQuery: (query: string) => void;
  // 정렬 변경 → 페이지 1로 리셋
  setSortBy: (sortBy: SortOption) => void;
  // 페이지 직접 변경
  setCurrentPage: (page: number) => void;
  // 필터 초기화
  resetFilters: () => void;
}

export const useCommunityStore = create<CommunityStoreState>((set) => ({
  selectedCategory: "ALL",
  selectedTag: "",
  searchQuery: "",
  sortBy: "newest",
  currentPage: 1,

  setSelectedCategory: (category) =>
    set({ selectedCategory: category, currentPage: 1 }),

  setSelectedTag: (tag) =>
    set({ selectedTag: tag, currentPage: 1 }),

  setSearchQuery: (query) =>
    set({ searchQuery: query, currentPage: 1 }),

  setSortBy: (sortBy) =>
    set({ sortBy, currentPage: 1 }),

  setCurrentPage: (page) =>
    set({ currentPage: page }),

  resetFilters: () =>
    set({
      selectedCategory: "ALL",
      selectedTag: "",
      searchQuery: "",
      sortBy: "newest",
      currentPage: 1,
    }),
}));
