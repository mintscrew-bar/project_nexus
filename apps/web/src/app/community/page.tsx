"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { communityApi } from "@/lib/api-client";
import { useDebounce } from "@/hooks/useDebounce";
import { useKeyboardShortcutsContext } from "@/components/KeyboardShortcuts";
import {
  Card,
  CardContent,
  Button,
  Input,
  EmptyState,
  Badge,
  PostCardSkeleton,
} from "@/components/ui";
import {
  MessageSquare,
  Plus,
  Eye,
  Heart,
  Clock,
  Pin,
  Megaphone,
  HelpCircle,
  Lightbulb,
  MessageCircle,
  Search,
  ArrowUpDown,
  TrendingUp,
  Calendar,
} from "lucide-react";

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
  { label: string; icon: React.ElementType; color: string }
> = {
  NOTICE: { label: "공지", icon: Megaphone, color: "text-accent-danger" },
  FREE: { label: "자유", icon: MessageCircle, color: "text-text-secondary" },
  TIP: { label: "팁", icon: Lightbulb, color: "text-accent-gold" },
  QNA: { label: "Q&A", icon: HelpCircle, color: "text-accent-primary" },
};

const sortOptions: {
  value: SortOption;
  label: string;
  icon: React.ElementType;
}[] = [
  { value: "newest", label: "최신순", icon: Calendar },
  { value: "popular", label: "인기순", icon: TrendingUp },
  { value: "views", label: "조회순", icon: Eye },
  { value: "comments", label: "댓글순", icon: MessageCircle },
];

export default function CommunityPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { setActionHandler, setSearchRef } = useKeyboardShortcutsContext();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [postsByCategory, setPostsByCategory] = useState<
    Record<PostCategory, Post[]>
  >({
    NOTICE: [],
    FREE: [],
    TIP: [],
    QNA: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<
    PostCategory | "ALL"
  >("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  // Debounce search query
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Register keyboard shortcuts (검색만 활성화, 글 작성은 제거)
  useEffect(() => {
    if (searchInputRef.current) {
      setSearchRef(searchInputRef.current);
    }
    // 글 작성 자동 라우팅 제거 - 사용자가 명시적으로 글쓰기 버튼을 클릭해야 함
    return () => {
      setSearchRef(null);
      setActionHandler(null);
    };
  }, [setSearchRef, setActionHandler]);

  // 카테고리별로 게시글 가져오기
  const fetchPostsByCategory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const categoriesToFetch: PostCategory[] =
        selectedCategory === "ALL"
          ? ["NOTICE", "FREE", "TIP", "QNA"]
          : [selectedCategory];

      const results = await Promise.all(
        categoriesToFetch.map(async (category) => {
          try {
            const data = await communityApi.getPosts({
              category,
              limit: selectedCategory === "ALL" ? 10 : 50, // 전체 보기일 때는 각 카테고리당 10개만
            });
            const postsArray = Array.isArray(data) ? data : (data?.posts ?? []);
            return { category, posts: postsArray };
          } catch (err) {
            console.error(`Failed to fetch ${category} posts:`, err);
            return { category, posts: [] };
          }
        }),
      );

      const newPostsByCategory = {
        NOTICE: [],
        FREE: [],
        TIP: [],
        QNA: [],
      } as Record<PostCategory, Post[]>;

      results.forEach(({ category, posts }) => {
        newPostsByCategory[category] = posts;
      });

      setPostsByCategory(newPostsByCategory);
    } catch (err: any) {
      setError(err.message || "게시글을 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    fetchPostsByCategory();
  }, [fetchPostsByCategory]);

  // 카테고리별로 필터링 및 정렬
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

    const categories: PostCategory[] = ["NOTICE", "FREE", "TIP", "QNA"];

    categories.forEach((category) => {
      let posts = [...postsByCategory[category]];

      // 검색 필터
      if (debouncedSearchQuery) {
        const query = debouncedSearchQuery.toLowerCase();
        posts = posts.filter(
          (post) =>
            post.title.toLowerCase().includes(query) ||
            post.content.toLowerCase().includes(query) ||
            post.author.username.toLowerCase().includes(query),
        );
      }

      // 정렬 함수
      const sortFn = (a: Post, b: Post) => {
        switch (sortBy) {
          case "newest":
            return (
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
          case "popular":
            return (b._count?.likes || 0) - (a._count?.likes || 0);
          case "views":
            return b.views - a.views;
          case "comments":
            return (b._count?.comments || 0) - (a._count?.comments || 0);
          default:
            return 0;
        }
      };

      // 고정 게시글과 일반 게시글 분리
      const pinnedPosts = posts.filter((p) => p.isPinned);
      const regularPosts = posts.filter((p) => !p.isPinned);

      pinnedPosts.sort(sortFn);
      regularPosts.sort(sortFn);

      result[category] = {
        pinnedPosts,
        regularPosts,
        total: posts.length,
      };
    });

    return result;
  }, [postsByCategory, debouncedSearchQuery, sortBy]);

  // 전체 게시글 수 계산
  const totalPosts = useMemo(() => {
    return Object.values(processedPostsByCategory).reduce(
      (sum, category) => sum + category.total,
      0,
    );
  }, [processedPostsByCategory]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 1) return "방금 전";
    if (hours < 24) return `${hours}시간 전`;
    if (days < 7) return `${days}일 전`;
    return date.toLocaleDateString("ko-KR");
  };

  const getCategoryBadge = (category: PostCategory) => {
    const config = categoryConfig[category];
    const Icon = config.icon;
    return (
      <Badge
        variant={category === "NOTICE" ? "danger" : "default"}
        size="sm"
        className="flex items-center gap-1"
      >
        <Icon className={`h-3 w-3 ${config.color}`} />
        {config.label}
      </Badge>
    );
  };

  if (isLoading && Object.values(postsByCategory).every((posts) => posts.length === 0)) {
    return (
      <div className="flex-grow p-4 md:p-8">
        <div className="container mx-auto max-w-4xl">
          {/* Skeleton Header */}
          <div className="flex justify-between items-center mb-6">
            <div className="space-y-2">
              <div className="h-9 w-40 bg-bg-tertiary rounded-lg skeleton" />
              <div className="h-4 w-48 bg-bg-tertiary rounded skeleton" />
            </div>
            <div className="h-10 w-24 bg-bg-tertiary rounded-lg skeleton" />
          </div>

          {/* Skeleton Search */}
          <div className="h-10 w-full bg-bg-tertiary rounded-lg mb-4 skeleton" />

          {/* Skeleton Filters */}
          <div className="flex gap-4 mb-6">
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-8 w-16 bg-bg-tertiary rounded-lg skeleton"
                />
              ))}
            </div>
          </div>

          {/* Skeleton Posts */}
          <div className="space-y-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <PostCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const { pinnedPosts, regularPosts, total } = filteredAndSortedPosts;

  return (
    <div className="flex-grow p-4 md:p-8 animate-fade-in">
      <div className="container mx-auto max-w-5xl">
        {/* Header - 카페 스타일 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold text-text-primary flex items-center gap-2">
              <MessageSquare className="h-8 w-8 text-accent-primary" />
              커뮤니티
            </h1>
            {isAuthenticated && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/community/write")}
                className="text-sm"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                글쓰기
              </Button>
            )}
          </div>
          <p className="text-text-secondary text-sm">
            자유롭게 이야기를 나눠보세요
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
          <Input
            ref={searchInputRef}
            type="text"
            placeholder="제목, 내용, 작성자로 검색... (/ 또는 Ctrl+K)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Filters Row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
          {/* Category Filter */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 flex-grow">
            {(["ALL", "NOTICE", "FREE", "TIP", "QNA"] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                  selectedCategory === cat
                    ? "bg-accent-primary text-white"
                    : "bg-bg-tertiary text-text-secondary hover:bg-bg-elevated"
                }`}
              >
                {cat !== "ALL" && (
                  <span className={categoryConfig[cat].color}>
                    {(() => {
                      const Icon = categoryConfig[cat].icon;
                      return <Icon className="h-3.5 w-3.5" />;
                    })()}
                  </span>
                )}
                {cat === "ALL" ? "전체" : categoryConfig[cat].label}
              </button>
            ))}
          </div>

          {/* Sort Options */}
          <div className="flex items-center gap-2">
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

        {/* Error State */}
        {error && (
          <div className="bg-accent-danger/10 border border-accent-danger/30 rounded-xl p-4 mb-6">
            <p className="text-accent-danger">{error}</p>
          </div>
        )}

        {/* Results Info */}
        {debouncedSearchQuery && (
          <p className="text-sm text-text-secondary mb-4">
            &quot;{debouncedSearchQuery}&quot; 검색 결과: {totalPosts}개의 게시글
          </p>
        )}

        {/* 카테고리별 섹션 */}
        {totalPosts === 0 ? (
          <EmptyState
            icon={debouncedSearchQuery ? Search : MessageSquare}
            title={
              debouncedSearchQuery
                ? "검색 결과가 없습니다"
                : "게시글이 없습니다"
            }
            description={
              debouncedSearchQuery
                ? "다른 검색어로 시도해보세요."
                : "첫 번째 게시글을 작성해보세요!"
            }
            action={
              debouncedSearchQuery
                ? {
                    label: "검색어 초기화",
                    onClick: () => setSearchQuery(""),
                  }
                : isAuthenticated
                  ? {
                      label: "글쓰기",
                      onClick: () => router.push("/community/write"),
                    }
                  : undefined
            }
          />
        ) : (
          <div className="space-y-6">
            {(["NOTICE", "FREE", "TIP", "QNA"] as PostCategory[]).map(
              (category) => {
                const { pinnedPosts, regularPosts, total } =
                  processedPostsByCategory[category];
                const categoryTotal = total;

                // 선택된 카테고리가 "ALL"이 아니고 현재 카테고리가 아니면 건너뛰기
                if (
                  selectedCategory !== "ALL" &&
                  selectedCategory !== category
                ) {
                  return null;
                }

                // 검색 중이거나 게시글이 없으면 건너뛰기
                if (!debouncedSearchQuery && categoryTotal === 0) {
                  return null;
                }

                const config = categoryConfig[category];
                const Icon = config.icon;

                return (
                  <Card key={category} className="overflow-hidden">
                    {/* 섹션 헤더 */}
                    <div className="bg-bg-tertiary border-b border-bg-elevated px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className={`h-5 w-5 ${config.color}`} />
                          <h2 className="text-lg font-semibold text-text-primary">
                            {config.label}
                          </h2>
                          <Badge variant="default" size="sm">
                            {categoryTotal}
                          </Badge>
                        </div>
                        {selectedCategory === "ALL" && categoryTotal > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedCategory(category)}
                            className="text-xs"
                          >
                            더보기 →
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* 게시글 목록 */}
                    {categoryTotal === 0 ? (
                      <div className="p-8 text-center text-text-tertiary text-sm">
                        {debouncedSearchQuery
                          ? "검색 결과가 없습니다"
                          : "게시글이 없습니다"}
                      </div>
                    ) : (
                      <CardContent className="p-0">
                        {/* 테이블 헤더 */}
                        <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-3 bg-bg-tertiary/50 border-b border-bg-elevated text-xs font-medium text-text-secondary">
                          <div className="col-span-6">제목</div>
                          <div className="col-span-2 text-center">작성자</div>
                          <div className="col-span-1 text-center">조회</div>
                          <div className="col-span-1 text-center">좋아요</div>
                          <div className="col-span-1 text-center">댓글</div>
                          <div className="col-span-1 text-center">작성일</div>
                        </div>

                        {/* 게시글 목록 */}
                        <div className="divide-y divide-bg-elevated">
                          {/* 고정 게시글 */}
                          {pinnedPosts.map((post) => (
                            <div
                              key={post.id}
                              onClick={() =>
                                router.push(`/community/${post.id}`)
                              }
                              className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-bg-tertiary cursor-pointer transition-colors border-l-2 border-l-accent-primary bg-accent-primary/5"
                            >
                              <div className="col-span-12 md:col-span-6 flex items-center min-w-0 gap-2">
                                <Pin className="h-3.5 w-3.5 text-accent-primary flex-shrink-0" />
                                <h3 className="font-semibold text-text-primary truncate">
                                  {post.title}
                                </h3>
                              </div>
                              <div className="col-span-6 md:col-span-2 flex items-center justify-start md:justify-center text-sm text-text-secondary">
                                <span className="truncate">
                                  {post.author.username}
                                </span>
                              </div>
                              <div className="col-span-3 md:col-span-1 flex items-center justify-center text-xs text-text-tertiary">
                                <div className="flex items-center gap-1">
                                  <Eye className="h-3 w-3" />
                                  {post.views}
                                </div>
                              </div>
                              <div className="col-span-3 md:col-span-1 flex items-center justify-center text-xs text-text-tertiary">
                                <div className="flex items-center gap-1">
                                  <Heart className="h-3 w-3" />
                                  {post._count?.likes || 0}
                                </div>
                              </div>
                              <div className="col-span-12 md:col-span-1 flex items-center justify-start md:justify-center text-xs text-text-tertiary">
                                <div className="flex items-center gap-1">
                                  <MessageCircle className="h-3 w-3" />
                                  {post._count?.comments || 0}
                                </div>
                              </div>
                              <div className="col-span-12 md:col-span-1 flex items-center justify-end md:justify-center text-xs text-text-tertiary">
                                <span className="md:hidden">
                                  {formatDate(post.createdAt)}
                                </span>
                                <span className="hidden md:inline">
                                  {formatDate(post.createdAt)}
                                </span>
                              </div>
                            </div>
                          ))}

                          {/* 일반 게시글 */}
                          {regularPosts.map((post) => (
                            <div
                              key={post.id}
                              onClick={() =>
                                router.push(`/community/${post.id}`)
                              }
                              className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-bg-tertiary cursor-pointer transition-colors"
                            >
                              <div className="col-span-12 md:col-span-6 flex items-center min-w-0">
                                <h3 className="font-medium text-text-primary truncate">
                                  {post.title}
                                </h3>
                              </div>
                              <div className="col-span-6 md:col-span-2 flex items-center justify-start md:justify-center text-sm text-text-secondary">
                                <span className="truncate">
                                  {post.author.username}
                                </span>
                              </div>
                              <div className="col-span-3 md:col-span-1 flex items-center justify-center text-xs text-text-tertiary">
                                <div className="flex items-center gap-1">
                                  <Eye className="h-3 w-3" />
                                  {post.views}
                                </div>
                              </div>
                              <div className="col-span-3 md:col-span-1 flex items-center justify-center text-xs text-text-tertiary">
                                <div className="flex items-center gap-1">
                                  <Heart className="h-3 w-3" />
                                  {post._count?.likes || 0}
                                </div>
                              </div>
                              <div className="col-span-12 md:col-span-1 flex items-center justify-start md:justify-center text-xs text-text-tertiary">
                                <div className="flex items-center gap-1">
                                  <MessageCircle className="h-3 w-3" />
                                  {post._count?.comments || 0}
                                </div>
                              </div>
                              <div className="col-span-12 md:col-span-1 flex items-center justify-end md:justify-center text-xs text-text-tertiary">
                                <span>{formatDate(post.createdAt)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              },
            )}
          </div>
        )}

        {/* Results count */}
        {totalPosts > 0 && (
          <p className="text-sm text-text-tertiary text-center pt-4">
            총 {totalPosts}개의 게시글
          </p>
        )}
      </div>
    </div>
  );
}
