"use client";

import { useEffect, useState, useCallback, useMemo, useRef, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { communityApi } from "@/lib/api-client";
import { useDebounce } from "@/hooks/useDebounce";
import { useKeyboardShortcutsContext } from "@/components/KeyboardShortcuts";
import {
  Card,
  CardContent,
  Input,
  EmptyState,
  PostCardSkeleton,
} from "@/components/ui";
import {
  Eye,
  Heart,
  Pin,
  Megaphone,
  HelpCircle,
  Lightbulb,
  MessageCircle,
  Search,
  Flame,
  ChevronLeft,
  ChevronRight,
  Tag,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type PostCategory = "NOTICE" | "FREE" | "TIP" | "QNA";
type SortOption = "newest" | "popular" | "views" | "comments";

interface Post {
  id: string;
  title: string;
  content: string;
  category: PostCategory;
  views: number;
  isPinned: boolean;
  createdAt: string;
  author: {
    id: string;
    username: string;
    avatar: string | null;
  };
  _count?: {
    comments: number;
    likes: number;
  };
}

const categoryConfig: Record<
  PostCategory,
  { label: string; fullLabel: string; icon: React.ElementType; color: string }
> = {
  NOTICE: {
    label: "공지",
    fullLabel: "공지사항",
    icon: Megaphone,
    color: "text-accent-danger",
  },
  FREE: {
    label: "자유",
    fullLabel: "자유게시판",
    icon: MessageCircle,
    color: "text-text-secondary",
  },
  TIP: {
    label: "팁",
    fullLabel: "팁 & 노하우",
    icon: Lightbulb,
    color: "text-accent-gold",
  },
  QNA: {
    label: "Q&A",
    fullLabel: "Q&A",
    icon: HelpCircle,
    color: "text-accent-primary",
  },
};

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "newest", label: "최신순" },
  { value: "popular", label: "인기순" },
  { value: "views", label: "조회순" },
  { value: "comments", label: "댓글순" },
];

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (hours < 1) return "방금 전";
  if (hours < 24) return `${hours}시간 전`;
  if (days < 7) return `${days}일 전`;
  return date.toLocaleDateString("ko-KR");
}

function PostRow({
  post,
  showCategoryIcon = false,
  router,
}: {
  post: Post;
  showCategoryIcon?: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const config = categoryConfig[post.category];
  const CatIcon = config.icon;
  const commentCount = post._count?.comments || 0;

  return (
    <div
      onClick={() => router.push(`/community/${post.id}`)}
      className={cn(
        "grid grid-cols-12 gap-2 px-4 py-3 hover:bg-bg-tertiary cursor-pointer transition-colors border-b border-bg-elevated last:border-0",
        post.isPinned && "border-l-2 border-l-accent-primary bg-accent-primary/5"
      )}
    >
      {/* Title column */}
      <div className="col-span-12 md:col-span-7 flex items-center gap-1.5 min-w-0">
        {post.isPinned && (
          <Pin className="h-3.5 w-3.5 text-accent-primary flex-shrink-0" />
        )}
        {showCategoryIcon && (
          <CatIcon className={cn("h-3.5 w-3.5 flex-shrink-0", config.color)} />
        )}
        <h3
          className={cn(
            "truncate",
            post.isPinned ? "font-semibold text-text-primary" : "font-medium text-text-primary"
          )}
        >
          {post.title}
        </h3>
        {commentCount > 0 && (
          <span className="text-accent-primary text-xs font-medium flex-shrink-0">
            [{commentCount}]
          </span>
        )}
      </div>
      {/* Author */}
      <div className="col-span-4 md:col-span-2 flex items-center text-sm text-text-secondary truncate">
        {post.author.username}
      </div>
      {/* Views */}
      <div className="col-span-3 md:col-span-1 flex items-center justify-center text-xs text-text-tertiary gap-0.5">
        <Eye className="h-3 w-3" />
        {post.views}
      </div>
      {/* Likes */}
      <div className="col-span-2 md:col-span-1 flex items-center justify-center text-xs text-text-tertiary gap-0.5">
        <Heart className="h-3 w-3" />
        {post._count?.likes || 0}
      </div>
      {/* Date */}
      <div className="col-span-3 md:col-span-1 flex items-center justify-end text-xs text-text-tertiary">
        {formatDate(post.createdAt)}
      </div>
    </div>
  );
}

function PopularPostsSection({
  allPosts,
  router,
}: {
  allPosts: Post[];
  router: ReturnType<typeof useRouter>;
}) {
  const popular = useMemo(
    () =>
      [...allPosts]
        .sort((a, b) => (b._count?.likes || 0) - (a._count?.likes || 0))
        .slice(0, 5),
    [allPosts]
  );

  if (popular.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <div className="bg-bg-tertiary border-b border-bg-elevated px-4 py-3 flex items-center gap-2">
        <Flame className="h-5 w-5 text-accent-gold" />
        <h2 className="text-base font-semibold text-text-primary">인기글</h2>
      </div>
      <CardContent className="p-0">
        {popular.map((post) => (
          <PostRow key={post.id} post={post} showCategoryIcon router={router} />
        ))}
      </CardContent>
    </Card>
  );
}

const POSTS_PER_PAGE = 20;

export default function CommunityPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuthStore();
  const { setActionHandler, setSearchRef } = useKeyboardShortcutsContext();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  const [postsByCategory, setPostsByCategory] = useState<Record<PostCategory, Post[]>>({
    NOTICE: [],
    FREE: [],
    TIP: [],
    QNA: [],
  });
  const [singleTotal, setSingleTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [popularTags, setPopularTags] = useState<{ name: string; count: number }[]>([]);

  // URL ?category= 파라미터로 초기 카테고리 결정 (사이드바 deep-link 지원)
  const initialCategory = useMemo<PostCategory | "ALL">(() => {
    const param = searchParams.get("category")?.toUpperCase();
    if (param && ["NOTICE", "FREE", "TIP", "QNA"].includes(param)) {
      return param as PostCategory;
    }
    return "ALL";
  }, [searchParams]);

  // URL ?tag= 파라미터로 초기 태그 필터 결정
  const initialTag = useMemo(() => searchParams.get("tag") || "", [searchParams]);

  const [selectedCategory, setSelectedCategory] = useState<PostCategory | "ALL">(initialCategory);
  const [selectedTag, setSelectedTag] = useState<string>(initialTag);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  useEffect(() => {
    if (searchInputRef.current) setSearchRef(searchInputRef.current);
    return () => {
      setSearchRef(null);
      setActionHandler(null);
    };
  }, [setSearchRef, setActionHandler]);

  // sortBy / 검색 / 카테고리 / 태그 변경 시 1페이지로 리셋
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, debouncedSearchQuery, sortBy, selectedTag]);

  // 인기 태그 로드
  useEffect(() => {
    communityApi.getPopularTags(15).then(setPopularTags).catch(() => {});
  }, []);

  const fetchPosts = useCallback(async (page: number = 1) => {
    setIsLoading(true);
    setError(null);

    const apiSortBy = sortBy === "newest" ? "latest" : sortBy;

    try {
      if (selectedCategory === "ALL") {
        // 전체 모드: 각 카테고리별 10개 미리보기 (검색도 서버에서)
        const results = await Promise.all(
          (["NOTICE", "FREE", "TIP", "QNA"] as PostCategory[]).map(async (category) => {
            try {
              const data = await communityApi.getPosts({
                category,
                limit: 10,
                sortBy: apiSortBy,
                search: debouncedSearchQuery || undefined,
                tag: selectedTag || undefined,
              });
              const postsArray = Array.isArray(data) ? data : (data?.posts ?? []);
              return { category, posts: postsArray };
            } catch {
              return { category, posts: [] as Post[] };
            }
          })
        );

        const newPostsByCategory = { NOTICE: [], FREE: [], TIP: [], QNA: [] } as Record<PostCategory, Post[]>;
        results.forEach(({ category, posts }) => {
          newPostsByCategory[category] = posts;
        });
        setPostsByCategory(newPostsByCategory);
      } else {
        // 단일 카테고리: 서버 정렬 + 검색 + 페이지네이션
        const data = await communityApi.getPosts({
          category: selectedCategory,
          limit: POSTS_PER_PAGE,
          offset: (page - 1) * POSTS_PER_PAGE,
          sortBy: apiSortBy,
          search: debouncedSearchQuery || undefined,
          tag: selectedTag || undefined,
        });
        const posts = Array.isArray(data) ? data : (data?.posts ?? []);
        const total = (data as any)?.total ?? posts.length;
        setSingleTotal(total);

        const newPostsByCategory = { NOTICE: [], FREE: [], TIP: [], QNA: [] } as Record<PostCategory, Post[]>;
        newPostsByCategory[selectedCategory] = posts;
        setPostsByCategory(newPostsByCategory);
      }
    } catch (err: any) {
      setError(err.message || "게시글을 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory, debouncedSearchQuery, sortBy, selectedTag]);

  useEffect(() => {
    fetchPosts(1);
  }, [fetchPosts]);

  const handlePageChange = (page: number) => {
    startTransition(() => {
      setCurrentPage(page);
    });
    fetchPosts(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const processedPostsByCategory = useMemo(() => {
    const result: Record<
      PostCategory,
      { pinnedPosts: Post[]; regularPosts: Post[]; total: number }
    > = {
      NOTICE: { pinnedPosts: [], regularPosts: [], total: 0 },
      FREE: { pinnedPosts: [], regularPosts: [], total: 0 },
      TIP: { pinnedPosts: [], regularPosts: [], total: 0 },
      QNA: { pinnedPosts: [], regularPosts: [], total: 0 },
    };

    (["NOTICE", "FREE", "TIP", "QNA"] as PostCategory[]).forEach((category) => {
      const posts = postsByCategory[category];
      const pinnedPosts = posts.filter((p) => p.isPinned);
      const regularPosts = posts.filter((p) => !p.isPinned);
      result[category] = { pinnedPosts, regularPosts, total: posts.length };
    });

    return result;
  }, [postsByCategory]);

  const allPosts = useMemo(
    () =>
      (["NOTICE", "FREE", "TIP", "QNA"] as PostCategory[]).flatMap(
        (cat) => postsByCategory[cat]
      ),
    [postsByCategory]
  );

  const totalPosts = useMemo(
    () =>
      selectedCategory === "ALL"
        ? Object.values(processedPostsByCategory).reduce((sum, cat) => sum + cat.total, 0)
        : singleTotal,
    [processedPostsByCategory, selectedCategory, singleTotal]
  );

  const totalPages = selectedCategory !== "ALL" ? Math.ceil(singleTotal / POSTS_PER_PAGE) : 0;

  const categoryCounts = useMemo(() => {
    const counts: Record<PostCategory, number> = { NOTICE: 0, FREE: 0, TIP: 0, QNA: 0 };
    (["NOTICE", "FREE", "TIP", "QNA"] as PostCategory[]).forEach((cat) => {
      counts[cat] = postsByCategory[cat].length;
    });
    return counts;
  }, [postsByCategory]);

  // ── 로딩 스켈레톤 (aside 제거 후 단순화) ──
  if (isLoading && allPosts.length === 0) {
    return (
      <div className="flex-grow p-4 md:p-6">
        <div className="container mx-auto max-w-4xl space-y-2">
          <div className="h-10 bg-bg-tertiary rounded-lg skeleton mb-2" />
          <div className="h-10 bg-bg-tertiary rounded-lg skeleton mb-4" />
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <PostCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow p-4 md:p-6 animate-fade-in">
      <div className="container mx-auto max-w-4xl">

        {/* ── 카테고리 탭 (모든 화면 표시, aside 대체) ── */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-4">
          {(["ALL", "NOTICE", "FREE", "TIP", "QNA"] as const).map((cat) => (
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
                const cfg = categoryConfig[cat];
                const Icon = cfg.icon;
                return <Icon className={cn("h-3.5 w-3.5", selectedCategory === cat ? "text-white" : cfg.color)} />;
              })()}
              <span>{cat === "ALL" ? "전체" : categoryConfig[cat].label}</span>
              {cat !== "ALL" && categoryCounts[cat] > 0 && (
                <span className={cn("text-xs", selectedCategory === cat ? "text-white/70" : "text-text-tertiary")}>
                  {categoryCounts[cat]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── 검색 + 정렬 ── */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
            <Input
              ref={searchInputRef}
              type="text"
              placeholder="제목, 내용, 작성자 검색... (/ 또는 Ctrl+K)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-0.5 bg-bg-tertiary rounded-lg p-1">
            {sortOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSortBy(opt.value)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  sortBy === opt.value
                    ? "bg-bg-secondary text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── 인기 태그 / 태그 필터 ── */}
        {(popularTags.length > 0 || selectedTag) && (
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <Tag className="h-3.5 w-3.5 text-text-tertiary flex-shrink-0" />
            {selectedTag && (
              <button
                onClick={() => setSelectedTag("")}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent-primary text-white text-xs"
              >
                #{selectedTag}
                <X className="h-3 w-3" />
              </button>
            )}
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

        {/* 에러 */}
        {error && (
          <div className="bg-accent-danger/10 border border-accent-danger/30 rounded-xl p-4 mb-4">
            <p className="text-accent-danger">{error}</p>
          </div>
        )}

        {/* 검색 / 태그 필터 결과 수 */}
        {(debouncedSearchQuery || selectedTag) && (
          <p className="text-sm text-text-secondary mb-4">
            {debouncedSearchQuery && <>&quot;{debouncedSearchQuery}&quot; </>}
            {selectedTag && <><span className="text-accent-primary">#{selectedTag}</span> </>}
            검색 결과: {totalPosts}개
          </p>
        )}

        {/* 빈 상태 / 게시글 목록 */}
        {totalPosts === 0 && !isLoading ? (
          // 검색/태그 중이면 Search 아이콘, 아니면 MessageCircle 아이콘 표시
          <EmptyState
            icon={debouncedSearchQuery || selectedTag ? Search : MessageCircle}
            title={debouncedSearchQuery || selectedTag ? "검색 결과가 없습니다" : "게시글이 없습니다"}
            description={
              debouncedSearchQuery || selectedTag
                ? "다른 검색어나 태그로 시도해보세요."
                : "첫 번째 게시글을 작성해보세요!"
            }
            action={
              selectedTag
                ? { label: "태그 필터 초기화", onClick: () => setSelectedTag("") }
                : debouncedSearchQuery
                ? { label: "검색어 초기화", onClick: () => setSearchQuery("") }
                : isAuthenticated
                ? { label: "글쓰기", onClick: () => router.push("/community/write") }
                : undefined
            }
          />
        ) : (
          <div className="space-y-4">
            {/* 전체 보기: 인기글 위젯 */}
            {selectedCategory === "ALL" && !debouncedSearchQuery && (
              <PopularPostsSection allPosts={allPosts} router={router} />
            )}

            {/* 카테고리 섹션 */}
            {(["NOTICE", "FREE", "TIP", "QNA"] as PostCategory[]).map((category) => {
              if (selectedCategory !== "ALL" && selectedCategory !== category) return null;

              const { pinnedPosts, regularPosts, total } =
                processedPostsByCategory[category];
              if (!debouncedSearchQuery && total === 0) return null;

              const config = categoryConfig[category];
              const Icon = config.icon;

              return (
                <Card key={category} className="overflow-hidden">
                  {/* 섹션 헤더 */}
                  <div className="bg-bg-tertiary border-b border-bg-elevated px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={cn("h-5 w-5", config.color)} />
                      <h2 className="text-base font-semibold text-text-primary">
                        {config.fullLabel}
                      </h2>
                      <span className="text-xs text-text-tertiary">{total}개</span>
                    </div>
                    {selectedCategory === "ALL" && total > 0 && (
                      <button
                        onClick={() => setSelectedCategory(category)}
                        className="text-xs text-text-tertiary hover:text-accent-primary transition-colors"
                      >
                        더보기 →
                      </button>
                    )}
                  </div>

                  {/* 게시글 목록 */}
                  {total === 0 ? (
                    <div className="p-8 text-center text-text-tertiary text-sm">
                      {debouncedSearchQuery ? "검색 결과가 없습니다" : "게시글이 없습니다"}
                    </div>
                  ) : (
                    <CardContent className="p-0">
                      {/* 테이블 헤더 */}
                      <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 bg-bg-tertiary/50 border-b border-bg-elevated text-xs font-medium text-text-tertiary">
                        <div className="col-span-7">제목</div>
                        <div className="col-span-2">작성자</div>
                        <div className="col-span-1 text-center">조회</div>
                        <div className="col-span-1 text-center">좋아요</div>
                        <div className="col-span-1 text-right">작성일</div>
                      </div>
                      <div>
                        {pinnedPosts.map((post) => (
                          <PostRow key={post.id} post={post} router={router} />
                        ))}
                        {regularPosts.map((post) => (
                          <PostRow key={post.id} post={post} router={router} />
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}

            {/* 총 게시글 수 */}
            {totalPosts > 0 && (
              <p className="text-sm text-text-tertiary text-center py-2">
                총 {totalPosts}개의 게시글
              </p>
            )}

            {/* 페이지네이션 (단일 카테고리 모드에서만) */}
            {selectedCategory !== "ALL" && totalPages > 1 && (
              <div className="flex items-center justify-center gap-1 py-4">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-tertiary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((page) =>
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
          </div>
        )}
      </div>
    </div>
  );
}
