"use client";

import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { communityApi } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/Card";
import { BoardIcon } from "@/components/community/BoardIcon";
import { PostRow } from "@/components/community/PostRow";
import {
  POSTS_PER_PAGE,
  type Post,
} from "@/components/community/community-types";
import type { GameTitle } from "@nexus/types";

/*
 * 글 아래 게시판 목록 — 글을 다 읽고 목록으로 나가지 않아도 같은 게시판의 다른 글로 넘어간다.
 *
 * 목록에서 들어왔으면 그 게시판·쪽수를, 전체 게시판이나 다른 곳에서 들어왔으면
 * 이 글이 속한 게시판의 1쪽을 보인다. 지금 보는 글은 강조한다.
 * 여기서 쪽을 넘겨도 주소는 바꾸지 않는다(글 주소는 글 하나를 가리켜야 한다).
 */
export function PostDetailBoardList({
  gameTitle,
  board,
  initialPage,
  currentPostId,
  fromBoard,
}: {
  gameTitle: GameTitle;
  board: {
    slug: string;
    name: string;
    iconName?: string | null;
    color?: string | null;
  };
  initialPage: number;
  currentPostId: string;
  /** 목록에서 들어온 게시판 슬러그. 없으면 전체 게시판·바깥에서 들어온 것 */
  fromBoard: string | null;
}) {
  const [page, setPage] = useState(initialPage);

  const { data, isLoading } = useQuery({
    // 목록 화면과 같은 키 모양 — 목록에서 들어왔으면 캐시를 그대로 쓴다
    queryKey: ["communityPosts", board.slug, gameTitle, "latest", "", "", page],
    queryFn: async () => {
      const res = await communityApi.getPosts({
        gameTitle,
        boardSlug: board.slug,
        limit: POSTS_PER_PAGE,
        offset: (page - 1) * POSTS_PER_PAGE,
        sortBy: "latest",
      });
      const posts: Post[] = Array.isArray(res) ? res : (res?.posts ?? []);
      const total: number =
        (res as { total?: number } | null)?.total ?? posts.length;
      return { posts, total };
    },
    staleTime: 60 * 1000,
    // 쪽을 넘길 때 목록이 잠깐 비어 높이가 출렁이지 않게
    placeholderData: keepPreviousData,
  });

  const posts = data?.posts ?? [];
  const totalPages = Math.max(
    1,
    Math.ceil((data?.total ?? 0) / POSTS_PER_PAGE),
  );

  // 목록에서 들어왔을 때만 위치를 이어 준다 — 「목록으로」가 그 게시판·쪽으로 가게
  const listQuery = fromBoard
    ? [`board=${encodeURIComponent(fromBoard)}`, page > 1 ? `page=${page}` : ""]
        .filter(Boolean)
        .join("&")
    : undefined;

  // 쪽 번호 — 처음·끝과 지금 쪽 앞뒤 2개만
  const pageItems = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
    .reduce<(number | "...")[]>((acc, p, idx, arr) => {
      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
      acc.push(p);
      return acc;
    }, []);

  if (!isLoading && posts.length === 0) return null;

  return (
    <section className="mt-6" aria-label={`${board.name} 게시판 글 목록`}>
      <h2 className="mb-2 flex items-center gap-2 px-1 text-sm font-bold text-text-primary">
        <BoardIcon
          name={board.iconName ?? undefined}
          className={cn("h-4 w-4", board.color ?? "text-text-secondary")}
        />
        {board.name}
        <span className="font-medium text-text-tertiary">
          {data?.total ?? 0}개
        </span>
      </h2>
      <Card className="overflow-hidden">
        {/* 목록 화면과 같은 머리줄 */}
        <div className="hidden grid-cols-12 gap-2 border-b border-bg-elevated bg-bg-tertiary/50 px-4 py-2 text-xs font-medium text-text-tertiary md:grid">
          <div className="col-span-7">제목</div>
          <div className="col-span-2">작성자</div>
          <div className="col-span-1 text-center">조회</div>
          <div className="col-span-1 text-center">좋아요</div>
          <div className="col-span-1 text-right">작성일</div>
        </div>
        <CardContent className="p-0">
          {isLoading && posts.length === 0
            ? Array.from({ length: 5 }, (_, i) => (
                <div
                  key={i}
                  className="border-b border-bg-elevated px-4 py-3 last:border-0"
                >
                  <div className="h-4 w-2/3 rounded bg-bg-tertiary skeleton" />
                </div>
              ))
            : posts.map((post) => (
                <PostRow
                  key={post.id}
                  post={post}
                  listQuery={listQuery}
                  active={post.id === currentPostId}
                />
              ))}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <nav
          className="flex items-center justify-center gap-1 py-4"
          aria-label="게시판 쪽 이동"
        >
          <button
            type="button"
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 1}
            aria-label="이전 쪽"
            className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {pageItems.map((item, idx) =>
            item === "..." ? (
              <span
                key={`gap-${idx}`}
                className="px-2 text-sm text-text-tertiary"
              >
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => setPage(item)}
                aria-current={item === page ? "page" : undefined}
                className={cn(
                  "h-8 w-8 rounded-lg text-sm font-medium transition-colors",
                  item === page
                    ? "bg-accent-primary text-accent-on"
                    : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary",
                )}
              >
                {item}
              </button>
            ),
          )}
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={page === totalPages}
            aria-label="다음 쪽"
            className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </nav>
      )}
    </section>
  );
}
