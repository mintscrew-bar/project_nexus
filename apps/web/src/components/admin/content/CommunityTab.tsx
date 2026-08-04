"use client";

import { useEffect, useState, useCallback } from "react";
import { adminApi } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Card, CardContent, Button, LoadingSpinner } from "@/components/ui";
import { Search, Pin, Trash2 } from "lucide-react";
import { BoardsTab } from "./BoardsTab";
import { Pagination, type AddToast } from "../shared";

interface AdminPost {
  id: string;
  title: string;
  isPinned: boolean;
  createdAt: string;
  author: { username: string };
  _count: { comments: number; likes: number };
}

/**
 * 커뮤니티 관리 탭 — 게시글 관리 + 게시판 관리를 서브탭으로 통합.
 * 게시판 관리는 ADMIN 전용이라 관리자에게만 서브탭을 노출한다.
 */
export function CommunityTab({
  addToast,
  isAdmin,
}: {
  addToast: AddToast;
  isAdmin: boolean;
}) {
  const [subTab, setSubTab] = useState<"posts" | "boards">("posts");

  const subTabs: { id: "posts" | "boards"; label: string }[] = [
    { id: "posts", label: "게시글" },
    ...(isAdmin ? [{ id: "boards" as const, label: "게시판" }] : []),
  ];

  return (
    <div className="space-y-4">
      {/* 서브탭 네비게이션 */}
      <div className="flex gap-1 border-b border-border">
        {subTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              subTab === t.id
                ? "border-accent-primary text-accent-primary"
                : "border-transparent text-text-secondary hover:text-text-primary",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "posts" && <CommunityPostsTab addToast={addToast} />}
      {subTab === "boards" && isAdmin && <BoardsTab addToast={addToast} />}
    </div>
  );
}

/** 게시글 관리 (검색/고정/삭제) */
function CommunityPostsTab({ addToast }: { addToast: AddToast }) {
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);

  const limit = 20;
  const totalPages = Math.ceil(total / limit);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getPosts({
        page,
        limit,
        search: search || undefined,
      });
      setPosts(data.posts);
      setTotal(data.total);
    } catch {
      addToast("게시글 로드 실패", "error");
    } finally {
      setLoading(false);
    }
  }, [page, search, addToast]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleDelete = async (post: AdminPost) => {
    if (!confirm(`"${post.title}" 게시글을 삭제하시겠습니까?`)) return;
    try {
      await adminApi.deletePost(post.id);
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
      addToast("게시글 삭제 완료", "success");
    } catch {
      addToast("게시글 삭제 실패", "error");
    }
  };

  const handlePin = async (post: AdminPost) => {
    try {
      await adminApi.pinPost(post.id, !post.isPinned);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id ? { ...p, isPinned: !p.isPinned } : p,
        ),
      );
      addToast(post.isPinned ? "고정 해제 완료" : "고정 완료", "success");
    } catch {
      addToast("고정 처리 실패", "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">
          커뮤니티 관리
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput);
            setPage(1);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="제목 검색..."
            className="px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-primary text-sm w-48 focus:outline-none focus:border-accent-primary"
          />
          <Button type="submit" size="sm" variant="outline">
            <Search className="h-4 w-4" />
          </Button>
        </form>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : posts.length === 0 ? (
            <p className="text-center text-text-muted py-12">
              게시글이 없습니다.
            </p>
          ) : (
            <>
              {/* 모바일: 가로 한 줄 압축형 (제목+작성자 한 줄, 아이콘 버튼) */}
              <div className="md:hidden divide-y divide-bg-tertiary/50">
                {posts.map((post) => (
                  <div
                    key={post.id}
                    className="flex items-center gap-2 px-3 py-2.5"
                  >
                    {post.isPinned && (
                      <Pin className="h-3.5 w-3.5 text-accent-primary flex-shrink-0" />
                    )}
                    {/* 제목 + 작성자/날짜 한 줄 */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {post.title}
                      </p>
                      <p className="truncate text-xs text-text-muted">
                        {post.author.username} · 댓글 {post._count.comments} · ♥{" "}
                        {post._count.likes} ·{" "}
                        {new Date(post.createdAt).toLocaleDateString("ko-KR")}
                      </p>
                    </div>
                    {/* 아이콘 액션 버튼 */}
                    <button
                      onClick={() => handlePin(post)}
                      className={cn(
                        "flex-shrink-0 rounded-md p-2 transition-colors",
                        post.isPinned
                          ? "text-accent-primary bg-accent-primary/10"
                          : "text-text-muted hover:text-text-primary hover:bg-bg-tertiary",
                      )}
                      aria-label={post.isPinned ? "고정 해제" : "고정"}
                    >
                      <Pin className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(post)}
                      className="flex-shrink-0 rounded-md p-2 text-accent-danger hover:bg-accent-danger/10 transition-colors"
                      aria-label="삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* 데스크톱: 테이블 */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead>
                    <tr className="border-b border-bg-tertiary text-text-muted">
                      <th className="text-left px-4 py-3 font-medium">제목</th>
                      <th className="text-left px-4 py-3 font-medium">
                        작성자
                      </th>
                      <th className="text-left px-4 py-3 font-medium">
                        댓글/좋아요
                      </th>
                      <th className="text-left px-4 py-3 font-medium">날짜</th>
                      <th className="text-left px-4 py-3 font-medium">액션</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posts.map((post) => (
                      <tr
                        key={post.id}
                        className="border-b border-bg-tertiary/50 hover:bg-bg-tertiary/30"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {post.isPinned && (
                              <Pin className="h-3.5 w-3.5 text-accent-primary" />
                            )}
                            <span className="font-medium text-text-primary truncate max-w-64">
                              {post.title}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {post.author.username}
                        </td>
                        <td className="px-4 py-3 text-text-muted text-xs">
                          댓글 {post._count.comments} · 좋아요{" "}
                          {post._count.likes}
                        </td>
                        <td className="px-4 py-3 text-text-muted text-xs">
                          {new Date(post.createdAt).toLocaleDateString("ko-KR")}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handlePin(post)}
                            >
                              <Pin className="h-3.5 w-3.5 mr-1" />
                              {post.isPinned ? "해제" : "고정"}
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => handleDelete(post)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </CardContent>
      </Card>
    </div>
  );
}
