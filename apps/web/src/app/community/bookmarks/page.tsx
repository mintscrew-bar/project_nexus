"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { communityApi } from "@/lib/api-client";
import {
  Card,
  CardContent,
  Button,
  LoadingSpinner,
  Badge,
} from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import {
  Bookmark,
  ArrowLeft,
  Eye,
  Heart,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  Megaphone,
  Lightbulb,
  HelpCircle,
} from "lucide-react";
import Image from "next/image";

type PostCategory = "NOTICE" | "FREE" | "TIP" | "QNA";

interface BookmarkedPost {
  id: string;
  title: string;
  category: PostCategory;
  views: number;
  createdAt: string;
  author: {
    id: string;
    username: string;
    avatar: string | null;
  };
  _count: {
    likes: number;
    comments: number;
  };
}

const categoryConfig: Record<PostCategory, { label: string; color: string }> = {
  NOTICE: { label: "공지", color: "text-accent-danger" },
  FREE: { label: "자유", color: "text-text-secondary" },
  TIP: { label: "팁", color: "text-accent-gold" },
  QNA: { label: "Q&A", color: "text-accent-primary" },
};

const ITEMS_PER_PAGE = 20;

export default function BookmarksPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { addToast } = useToast();

  const [posts, setPosts] = useState<BookmarkedPost[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/auth/login");
    }
  }, [isAuthenticated, authLoading, router]);

  const fetchBookmarks = useCallback(async (page: number) => {
    setIsLoading(true);
    try {
      const offset = (page - 1) * ITEMS_PER_PAGE;
      const data = await communityApi.getBookmarks(ITEMS_PER_PAGE, offset);
      setPosts(data.posts || []);
      setTotal(data.total || 0);
    } catch {
      addToast("북마크를 불러오는데 실패했습니다.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchBookmarks(currentPage);
    }
  }, [isAuthenticated, currentPage, fetchBookmarks]);

  const handleUnbookmark = async (postId: string) => {
    try {
      await communityApi.unbookmarkPost(postId);
      addToast("북마크가 해제되었습니다.", "info");
      fetchBookmarks(currentPage);
    } catch {
      addToast("북마크 해제에 실패했습니다.", "error");
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 4) pages.push("...");
      const start = Math.max(2, currentPage - 2);
      const end = Math.min(totalPages - 1, currentPage + 2);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 3) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center flex-grow">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="flex-grow p-4 md:p-8 animate-fade-in">
      <div className="container mx-auto max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" onClick={() => router.push("/community")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            커뮤니티
          </Button>
          <div className="flex items-center gap-2">
            <Bookmark className="h-5 w-5 text-accent-primary fill-accent-primary" />
            <h1 className="text-xl font-bold text-text-primary">내 북마크</h1>
            {total > 0 && (
              <span className="text-sm text-text-tertiary">({total}개)</span>
            )}
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner size="lg" />
          </div>
        ) : posts.length === 0 ? (
          <Card>
            <CardContent className="py-20 text-center">
              <Bookmark className="h-12 w-12 text-text-tertiary mx-auto mb-4" />
              <p className="text-text-secondary font-medium">저장된 게시글이 없습니다.</p>
              <p className="text-text-tertiary text-sm mt-1">
                게시글 상세 페이지에서 저장 버튼을 눌러 북마크하세요.
              </p>
              <Button
                variant="secondary"
                className="mt-4"
                onClick={() => router.push("/community")}
              >
                커뮤니티 둘러보기
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="space-y-3">
              {posts.map((post) => {
                const catConfig = categoryConfig[post.category];
                return (
                  <Card
                    key={post.id}
                    className="cursor-pointer hover:border-accent-primary/50 transition-colors group"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-grow min-w-0">
                          {/* Category badge + title */}
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="default" className="text-xs shrink-0">
                              <span className={catConfig.color}>{catConfig.label}</span>
                            </Badge>
                            <button
                              onClick={() => router.push(`/community/${post.id}`)}
                              className="font-medium text-text-primary group-hover:text-accent-primary transition-colors text-left line-clamp-1"
                            >
                              {post.title}
                            </button>
                          </div>
                          {/* Author + meta */}
                          <div className="flex items-center gap-3 text-xs text-text-tertiary">
                            <div className="flex items-center gap-1">
                              {post.author.avatar ? (
                                <Image
                                  src={post.author.avatar}
                                  alt={post.author.username}
                                  width={14}
                                  height={14}
                                  className="rounded-full"
                                  unoptimized
                                />
                              ) : null}
                              <span>{post.author.username}</span>
                            </div>
                            <span>{formatDate(post.createdAt)}</span>
                            <span className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              {post.views}
                            </span>
                            <span className="flex items-center gap-1">
                              <Heart className="h-3 w-3" />
                              {post._count.likes}
                            </span>
                            <span className="flex items-center gap-1">
                              <MessageCircle className="h-3 w-3" />
                              {post._count.comments}
                            </span>
                          </div>
                        </div>
                        {/* Unbookmark button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUnbookmark(post.id);
                          }}
                          className="shrink-0 p-1.5 rounded text-accent-primary hover:text-text-tertiary hover:bg-bg-tertiary transition-colors"
                          title="북마크 해제"
                        >
                          <Bookmark className="h-4 w-4 fill-current" />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1 mt-6">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {getPageNumbers().map((page, idx) =>
                  page === "..." ? (
                    <span key={`ellipsis-${idx}`} className="px-2 text-text-tertiary">
                      ...
                    </span>
                  ) : (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page as number)}
                      className={`w-8 h-8 rounded text-sm font-medium transition-colors ${
                        currentPage === page
                          ? "bg-accent-primary text-white"
                          : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
                      }`}
                    >
                      {page}
                    </button>
                  )
                )}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
