"use client";

import { Suspense, useEffect, useMemo, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { useCommunityStore } from "@/stores/community-store";
import { communityApi } from "@/lib/api-client";
import { useDebounce } from "@/hooks/useDebounce";
import { Card, CardContent, EmptyState, PostCardSkeleton } from "@/components/ui";
import { Megaphone, MessageCircle, Lightbulb, HelpCircle, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CATEGORY_KEYS,
  CATEGORY_META,
  POSTS_PER_PAGE,
  type Post,
  type PostCategory,
} from "@/components/community/community-types";
import { PostRow } from "@/components/community/PostRow";
import { CategoryCard } from "@/components/community/CategoryCard";
import { PostListFilters } from "@/components/community/PostListFilters";

// 카테고리 아이콘 컴포넌트 매핑
const CATEGORY_ICONS: Record<PostCategory, React.ElementType> = {
  NOTICE: Megaphone,
  FREE: MessageCircle,
  TIP: Lightbulb,
  QNA: HelpCircle,
};

/** useSearchParams를 사용하므로 Suspense 내부에서 렌더 */
function CommunityPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuthStore();
  const [, startTransition] = useTransition();

  // Zustand 스토어에서 필터 상태 가져오기
  const selectedCategory = useCommunityStore((s) => s.selectedCategory);
  const selectedTag = useCommunityStore((s) => s.selectedTag);
  const searchQuery = useCommunityStore((s) => s.searchQuery);
  const sortBy = useCommunityStore((s) => s.sortBy);
  const currentPage = useCommunityStore((s) => s.currentPage);
  const setSelectedCategory = useCommunityStore((s) => s.setSelectedCategory);
  const setCurrentPage = useCommunityStore((s) => s.setCurrentPage);

  // URL ?category=, ?tag= 파라미터로 스토어 초기화 (마운트 1회)
  useEffect(() => {
    const catParam = searchParams.get("category")?.toUpperCase();
    if (catParam && CATEGORY_KEYS.includes(catParam as PostCategory)) {
      setSelectedCategory(catParam as PostCategory);
    }
    const tagParam = searchParams.get("tag");
    if (tagParam) {
      useCommunityStore.getState().setSelectedTag(tagParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 검색어 debounce (queryKey에 사용)
  const debouncedSearch = useDebounce(searchQuery, 300);

  // API 정렬 파라미터 변환
  const apiSortBy = sortBy === "newest" ? "latest" : sortBy;

  // ── React Query: 인기 태그 (5분 캐시) ──
  const { data: popularTags = [] } = useQuery({
    queryKey: ["popularTags"],
    queryFn: () => communityApi.getPopularTags(15),
    staleTime: 5 * 60 * 1000,
  });

  // ── React Query: ALL 모드 — 4개 카테고리 병렬 조회 (대문 카드용) ──
  const categoryQueries = useQueries({
    queries: CATEGORY_KEYS.map((category) => ({
      queryKey: ["communityPosts", category, apiSortBy, debouncedSearch, selectedTag, 1],
      queryFn: async () => {
        const data = await communityApi.getPosts({
          category,
          limit: 10,
          sortBy: apiSortBy,
          search: debouncedSearch || undefined,
          tag: selectedTag || undefined,
        });
        const posts: Post[] = Array.isArray(data) ? data : (data?.posts ?? []);
        return posts;
      },
      staleTime: 60 * 1000,
      enabled: selectedCategory === "ALL",
    })),
  });

  // ── React Query: ALL 모드 — 전체 최신글 통합 피드 ──
  const { data: allFeedData, isLoading: allFeedLoading } = useQuery({
    queryKey: ["communityPosts", "ALL_FEED", apiSortBy, debouncedSearch, selectedTag, currentPage],
    queryFn: async () => {
      const data = await communityApi.getPosts({
        limit: POSTS_PER_PAGE,
        offset: (currentPage - 1) * POSTS_PER_PAGE,
        sortBy: apiSortBy,
        search: debouncedSearch || undefined,
        tag: selectedTag || undefined,
      });
      const posts: Post[] = Array.isArray(data) ? data : (data?.posts ?? []);
      const total: number = (data as any)?.total ?? posts.length;
      return { posts, total };
    },
    staleTime: 60 * 1000,
    enabled: selectedCategory === "ALL",
  });

  // ── React Query: 단일 카테고리 + 페이지네이션 ──
  const { data: singleCategoryData, isLoading: singleLoading, error: singleError } = useQuery({
    queryKey: ["communityPosts", selectedCategory, apiSortBy, debouncedSearch, selectedTag, currentPage],
    queryFn: async () => {
      const data = await communityApi.getPosts({
        category: selectedCategory as PostCategory,
        limit: POSTS_PER_PAGE,
        offset: (currentPage - 1) * POSTS_PER_PAGE,
        sortBy: apiSortBy,
        search: debouncedSearch || undefined,
        tag: selectedTag || undefined,
      });
      const posts: Post[] = Array.isArray(data) ? data : (data?.posts ?? []);
      const total: number = (data as any)?.total ?? posts.length;
      return { posts, total };
    },
    staleTime: 60 * 1000,
    enabled: selectedCategory !== "ALL",
  });

  // ALL 모드 카드 로딩 여부
  const allModeCardsLoading = selectedCategory === "ALL" && categoryQueries.some((q) => q.isLoading);

  // 단일 카테고리 / ALL 피드 공용 데이터
  const isAllMode = selectedCategory === "ALL";
  const feedData = isAllMode ? allFeedData : singleCategoryData;
  const feedLoading = isAllMode ? allFeedLoading : singleLoading;
  const feedPosts = feedData?.posts ?? [];
  const feedTotal = feedData?.total ?? 0;
  const totalPages = Math.ceil(feedTotal / POSTS_PER_PAGE);
  const pinnedPosts = feedPosts.filter((p) => p.isPinned);
  const regularPosts = feedPosts.filter((p) => !p.isPinned);

  const error = singleError ? (singleError as any).message || "게시글을 불러오는데 실패했습니다." : null;

  // 초기 로딩 스켈레톤
  if (allModeCardsLoading && categoryQueries.every((q) => !q.data) && !allFeedData) {
    return (
      <div className="flex-grow p-4 md:p-6">
        <div className="container mx-auto max-w-5xl space-y-2">
          <div className="h-10 bg-bg-tertiary rounded-lg skeleton mb-4" />
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <PostCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  const handlePageChange = (page: number) => {
    startTransition(() => {
      setCurrentPage(page);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // 현재 선택된 카테고리 제목 (단일 카테고리 모드용)
  const categoryTitle = !isAllMode
    ? CATEGORY_META[selectedCategory as PostCategory]?.fullLabel
    : null;
  const CategoryIcon = !isAllMode
    ? CATEGORY_ICONS[selectedCategory as PostCategory]
    : null;
  const categoryColor = !isAllMode
    ? CATEGORY_META[selectedCategory as PostCategory]?.color
    : null;

  return (
    <div className="flex-grow p-4 md:p-6 animate-fade-in">
      <div className="container mx-auto max-w-5xl">

        {/* ── 카테고리 헤더 (단일 카테고리 선택 시) ── */}
        {categoryTitle && CategoryIcon && (
          <div className="flex items-center gap-2 mb-4">
            <CategoryIcon className={cn("h-5 w-5", categoryColor)} />
            <h1 className="text-lg font-bold text-text-primary">{categoryTitle}</h1>
          </div>
        )}

        {/* ── 검색/정렬/태그 필터바 ── */}
        <PostListFilters popularTags={popularTags} />

        {/* 에러 표시 */}
        {error && (
          <div className="bg-accent-danger/10 border border-accent-danger/30 rounded-xl p-4 mb-4">
            <p className="text-accent-danger">{error}</p>
          </div>
        )}

        {/* 검색 / 태그 결과 수 */}
        {(debouncedSearch || selectedTag) && (
          <p className="text-sm text-text-secondary mb-4">
            {debouncedSearch && <>&quot;{debouncedSearch}&quot; </>}
            {selectedTag && <><span className="text-accent-primary">#{selectedTag}</span> </>}
            검색 결과
          </p>
        )}

        {/* ── ALL 모드: 대문 카드 + 통합 피드 ── */}
        {isAllMode && (
          <div className="space-y-6">
            {/* 2x2 카테고리 카드 그리드 (검색 중이 아닐 때만) */}
            {!debouncedSearch && !selectedTag && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {CATEGORY_KEYS.map((category, idx) => (
                  <CategoryCard
                    key={category}
                    category={category}
                    posts={categoryQueries[idx]?.data ?? []}
                    totalCount={categoryQueries[idx]?.data?.length ?? 0}
                    isLoading={categoryQueries[idx]?.isLoading ?? false}
                  />
                ))}
              </div>
            )}

            {/* 전체 최신글 통합 피드 */}
            <div>
              {!debouncedSearch && !selectedTag && (
                <h2 className="text-sm font-semibold text-text-secondary mb-3">
                  전체 최신글
                </h2>
              )}
              {allFeedLoading && feedPosts.length === 0 ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => <PostCardSkeleton key={i} />)}
                </div>
              ) : feedTotal === 0 ? (
                <EmptyState
                  icon={debouncedSearch || selectedTag ? Search : MessageCircle}
                  title={debouncedSearch || selectedTag ? "검색 결과가 없습니다" : "게시글이 없습니다"}
                  description={
                    debouncedSearch || selectedTag
                      ? "다른 검색어나 태그로 시도해보세요."
                      : "첫 번째 게시글을 작성해보세요!"
                  }
                  action={
                    selectedTag
                      ? { label: "태그 필터 초기화", onClick: () => useCommunityStore.getState().setSelectedTag("") }
                      : debouncedSearch
                      ? { label: "검색어 초기화", onClick: () => useCommunityStore.getState().setSearchQuery("") }
                      : isAuthenticated
                      ? { label: "글쓰기", onClick: () => router.push("/community/write") }
                      : undefined
                  }
                />
              ) : (
                <PostListSection
                  pinnedPosts={pinnedPosts}
                  regularPosts={regularPosts}
                  total={feedTotal}
                  totalPages={totalPages}
                  currentPage={currentPage}
                  onPageChange={handlePageChange}
                  showCategory
                />
              )}
            </div>
          </div>
        )}

        {/* ── 단일 카테고리 모드 ── */}
        {!isAllMode && (
          <>
            {feedLoading && feedPosts.length === 0 ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => <PostCardSkeleton key={i} />)}
              </div>
            ) : feedTotal === 0 ? (
              <EmptyState
                icon={debouncedSearch || selectedTag ? Search : MessageCircle}
                title={debouncedSearch || selectedTag ? "검색 결과가 없습니다" : "게시글이 없습니다"}
                description={
                  debouncedSearch || selectedTag
                    ? "다른 검색어나 태그로 시도해보세요."
                    : "첫 번째 게시글을 작성해보세요!"
                }
                action={
                  selectedTag
                    ? { label: "태그 필터 초기화", onClick: () => useCommunityStore.getState().setSelectedTag("") }
                    : debouncedSearch
                    ? { label: "검색어 초기화", onClick: () => useCommunityStore.getState().setSearchQuery("") }
                    : isAuthenticated
                    ? { label: "글쓰기", onClick: () => router.push("/community/write") }
                    : undefined
                }
              />
            ) : (
              <PostListSection
                pinnedPosts={pinnedPosts}
                regularPosts={regularPosts}
                total={feedTotal}
                totalPages={totalPages}
                currentPage={currentPage}
                onPageChange={handlePageChange}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** 게시글 목록 + 페이지네이션 공통 컴포넌트 */
function PostListSection({
  pinnedPosts,
  regularPosts,
  total,
  totalPages,
  currentPage,
  onPageChange,
  showCategory,
}: {
  pinnedPosts: Post[];
  regularPosts: Post[];
  total: number;
  totalPages: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  showCategory?: boolean;
}) {
  return (
    <>
      <Card className="overflow-hidden mb-4">
        {/* 테이블 헤더 */}
        <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 bg-bg-tertiary/50 border-b border-bg-elevated text-xs font-medium text-text-tertiary">
          <div className="col-span-7">제목</div>
          <div className="col-span-2">작성자</div>
          <div className="col-span-1 text-center">조회</div>
          <div className="col-span-1 text-center">좋아요</div>
          <div className="col-span-1 text-right">작성일</div>
        </div>
        <CardContent className="p-0">
          {pinnedPosts.map((post) => (
            <PostRow key={post.id} post={post} showCategoryIcon={showCategory} />
          ))}
          {regularPosts.map((post) => (
            <PostRow key={post.id} post={post} showCategoryIcon={showCategory} />
          ))}
        </CardContent>
      </Card>

      {/* 총 게시글 수 */}
      <p className="text-sm text-text-tertiary text-center py-2">
        총 {total}개의 게시글
      </p>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 py-4">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-tertiary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(
              (page) =>
                page === 1 ||
                page === totalPages ||
                Math.abs(page - currentPage) <= 2
            )
            .reduce<(number | "...")[]>((acc, page, idx, arr) => {
              if (idx > 0 && page - (arr[idx - 1] as number) > 1) {
                acc.push("...");
              }
              acc.push(page);
              return acc;
            }, [])
            .map((item, idx) =>
              item === "..." ? (
                <span key={`ellipsis-${idx}`} className="px-2 text-text-tertiary text-sm">
                  …
                </span>
              ) : (
                <button
                  key={item}
                  onClick={() => onPageChange(item as number)}
                  className={cn(
                    "w-8 h-8 rounded-lg text-sm font-medium transition-colors",
                    currentPage === item
                      ? "bg-accent-primary text-white"
                      : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
                  )}
                >
                  {item}
                </button>
              )
            )}
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-tertiary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}

/** useSearchParams가 있으므로 Suspense 래핑 필수 (Next.js 요건) */
export default function CommunityPage() {
  return (
    <Suspense fallback={
      <div className="flex-grow p-4 md:p-6">
        <div className="container mx-auto max-w-5xl space-y-2">
          <div className="h-10 bg-bg-tertiary rounded-lg skeleton mb-4" />
        </div>
      </div>
    }>
      <CommunityPageContent />
    </Suspense>
  );
}
