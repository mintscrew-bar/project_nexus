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
import { PopularPostsStrip } from "@/components/community/PopularPostsStrip";
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

  // ── React Query: ALL 모드 — 4개 카테고리 병렬 조회 ──
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

  // ── ALL 모드 인기글: 4카테고리 합산 후 좋아요 상위 5개 ──
  const popularPosts = useMemo(() => {
    if (selectedCategory !== "ALL") return [];
    const allPosts = categoryQueries.flatMap((q) => q.data ?? []);
    return [...allPosts]
      .sort((a, b) => (b._count?.likes || 0) - (a._count?.likes || 0))
      .slice(0, 5);
  }, [categoryQueries, selectedCategory]);

  // 카테고리별 게시글 수 (탭 뱃지용)
  const categoryCounts = useMemo(() => {
    const counts: Record<PostCategory, number> = { NOTICE: 0, FREE: 0, TIP: 0, QNA: 0 };
    if (selectedCategory === "ALL") {
      CATEGORY_KEYS.forEach((cat, idx) => {
        counts[cat] = categoryQueries[idx]?.data?.length ?? 0;
      });
    } else {
      counts[selectedCategory as PostCategory] = singleCategoryData?.total ?? 0;
    }
    return counts;
  }, [categoryQueries, selectedCategory, singleCategoryData]);

  // 단일 카테고리 모드 처리 데이터
  const singlePosts = singleCategoryData?.posts ?? [];
  const singleTotal = singleCategoryData?.total ?? 0;
  const totalPages = selectedCategory !== "ALL" ? Math.ceil(singleTotal / POSTS_PER_PAGE) : 0;
  const pinnedPosts = singlePosts.filter((p) => p.isPinned);
  const regularPosts = singlePosts.filter((p) => !p.isPinned);

  // ALL 모드 전체 로딩 여부
  const allModeLoading = selectedCategory === "ALL" && categoryQueries.some((q) => q.isLoading);
  const error = singleError ? (singleError as any).message || "게시글을 불러오는데 실패했습니다." : null;

  // 초기 로딩 스켈레톤
  if (allModeLoading && categoryQueries.every((q) => !q.data)) {
    return (
      <div className="flex-grow p-4 md:p-6">
        <div className="container mx-auto max-w-5xl space-y-2">
          <div className="h-10 bg-bg-tertiary rounded-lg skeleton mb-2" />
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

  return (
    <div className="flex-grow p-4 md:p-6 animate-fade-in">
      <div className="container mx-auto max-w-5xl">

        {/* ── 카테고리 탭 바 ── */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-4">
          {(["ALL", ...CATEGORY_KEYS] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0",
                selectedCategory === cat
                  ? "bg-accent-primary text-white"
                  : "bg-bg-tertiary text-text-secondary hover:bg-bg-elevated"
              )}
            >
              {cat !== "ALL" && (() => {
                const meta = CATEGORY_META[cat];
                const Icon = CATEGORY_ICONS[cat];
                return <Icon className={cn("h-3.5 w-3.5", selectedCategory === cat ? "text-white" : meta.color)} />;
              })()}
              <span>{cat === "ALL" ? "전체" : CATEGORY_META[cat].label}</span>
              {cat !== "ALL" && categoryCounts[cat] > 0 && (
                <span className={cn("text-xs", selectedCategory === cat ? "text-white/70" : "text-text-tertiary")}>
                  {categoryCounts[cat]}
                </span>
              )}
            </button>
          ))}
        </div>

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

        {/* ── ALL 모드 레이아웃 ── */}
        {selectedCategory === "ALL" && (
          <div className="space-y-4">
            {/* 인기글 가로 스트립 (검색 중이 아닐 때) */}
            {!debouncedSearch && !selectedTag && (
              <PopularPostsStrip posts={popularPosts} />
            )}

            {/* 2x2 카테고리 카드 그리드 */}
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
          </div>
        )}

        {/* ── 단일 카테고리 모드 레이아웃 ── */}
        {selectedCategory !== "ALL" && (
          <>
            {singleLoading && singlePosts.length === 0 ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => <PostCardSkeleton key={i} />)}
              </div>
            ) : singleTotal === 0 ? (
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
                      <PostRow key={post.id} post={post} />
                    ))}
                    {regularPosts.map((post) => (
                      <PostRow key={post.id} post={post} />
                    ))}
                  </CardContent>
                </Card>

                {/* 총 게시글 수 */}
                <p className="text-sm text-text-tertiary text-center py-2">
                  총 {singleTotal}개의 게시글
                </p>

                {/* 페이지네이션 */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-1 py-4">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
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
                            onClick={() => handlePageChange(item as number)}
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
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-tertiary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** useSearchParams가 있으므로 Suspense 래핑 필수 (Next.js 요건) */
export default function CommunityPage() {
  return (
    <Suspense fallback={
      <div className="flex-grow p-4 md:p-6">
        <div className="container mx-auto max-w-5xl space-y-2">
          <div className="h-10 bg-bg-tertiary rounded-lg skeleton mb-2" />
          <div className="h-10 bg-bg-tertiary rounded-lg skeleton mb-4" />
        </div>
      </div>
    }>
      <CommunityPageContent />
    </Suspense>
  );
}
