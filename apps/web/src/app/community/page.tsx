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

  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<
    PostCategory | "ALL"
  >("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  // Debounce search query
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Register keyboard shortcuts
  useEffect(() => {
    if (searchInputRef.current) {
      setSearchRef(searchInputRef.current);
    }
    if (isAuthenticated) {
      setActionHandler(() => router.push("/community/write"));
    }
    return () => {
      setSearchRef(null);
      setActionHandler(null);
    };
  }, [isAuthenticated, router, setActionHandler, setSearchRef]);

  const fetchPosts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await communityApi.getPosts({
        category: selectedCategory !== "ALL" ? selectedCategory : undefined,
        limit: 50,
      });
      // API 응답이 배열인지 확인 (posts 프로퍼티가 있을 수도 있음)
      const postsArray = Array.isArray(data) ? data : (data?.posts ?? []);
      setPosts(postsArray);
    } catch (err: any) {
      setError(err.message || "게시글을 불러오는데 실패했습니다.");
      setPosts([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Filter and sort posts
  const filteredAndSortedPosts = useMemo(() => {
    if (!Array.isArray(posts)) {
      return { pinnedPosts: [], regularPosts: [], total: 0 };
    }
    let result = [...posts];

    // Search filter
    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase();
      result = result.filter(
        (post) =>
          post.title.toLowerCase().includes(query) ||
          post.content.toLowerCase().includes(query) ||
          post.author.username.toLowerCase().includes(query),
      );
    }

    // Sort (pinned posts always first)
    const pinnedPosts = result.filter((p) => p.isPinned);
    const regularPosts = result.filter((p) => !p.isPinned);

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

    pinnedPosts.sort(sortFn);
    regularPosts.sort(sortFn);

    return { pinnedPosts, regularPosts, total: result.length };
  }, [posts, debouncedSearchQuery, sortBy]);

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

  if (isLoading && posts.length === 0) {
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
      <div className="container mx-auto max-w-4xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-text-primary flex items-center gap-2">
              <MessageSquare className="h-8 w-8 text-accent-primary" />
              커뮤니티
            </h1>
            <p className="text-text-secondary mt-1">
              자유롭게 이야기를 나눠보세요
            </p>
          </div>
          {isAuthenticated && (
            <Button onClick={() => router.push("/community/write")}>
              <Plus className="h-4 w-4 mr-2" />
              글쓰기
            </Button>
          )}
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
            &quot;{debouncedSearchQuery}&quot; 검색 결과: {total}개의 게시글
          </p>
        )}

        {/* Posts List */}
        {total === 0 ? (
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
          <div className="space-y-2">
            {/* Pinned Posts */}
            {pinnedPosts.map((post) => (
              <Card
                key={post.id}
                hoverable
                onClick={() => router.push(`/community/${post.id}`)}
                className="cursor-pointer border-accent-primary/30 bg-accent-primary/5"
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Pin className="h-4 w-4 text-accent-primary mt-1 flex-shrink-0" />
                    <div className="flex-grow min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {getCategoryBadge(post.category)}
                        <h3 className="font-semibold text-text-primary truncate">
                          {post.title}
                        </h3>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-text-tertiary">
                        <span>{post.author.username}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(post.createdAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          {post.views}
                        </span>
                        {post._count && (
                          <>
                            <span className="flex items-center gap-1">
                              <Heart className="h-3 w-3" />
                              {post._count.likes}
                            </span>
                            <span className="flex items-center gap-1">
                              <MessageCircle className="h-3 w-3" />
                              {post._count.comments}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Regular Posts */}
            {regularPosts.map((post) => (
              <Card
                key={post.id}
                hoverable
                onClick={() => router.push(`/community/${post.id}`)}
                className="cursor-pointer"
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-grow min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {getCategoryBadge(post.category)}
                        <h3 className="font-semibold text-text-primary truncate">
                          {post.title}
                        </h3>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-text-tertiary">
                        <span>{post.author.username}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(post.createdAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          {post.views}
                        </span>
                        {post._count && (
                          <>
                            <span className="flex items-center gap-1">
                              <Heart className="h-3 w-3" />
                              {post._count.likes}
                            </span>
                            <span className="flex items-center gap-1">
                              <MessageCircle className="h-3 w-3" />
                              {post._count.comments}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Results count */}
        {total > 0 && (
          <p className="text-sm text-text-tertiary text-center pt-4">
            총 {total}개의 게시글
          </p>
        )}
      </div>
    </div>
  );
}
