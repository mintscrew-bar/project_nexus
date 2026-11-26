"use client";

import { useRouter } from "next/navigation";
import { Eye, Heart, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Post, formatDate } from "./community-types";
import { BoardIcon } from "@/components/community/BoardIcon";
import { useNavigationGame } from "@/hooks/useCurrentGame";
import { GAMES } from "@nexus/types";

interface PostRowProps {
  post: Post;
  /** ALL 모드에서 게시판 아이콘 표시 여부 */
  showCategoryIcon?: boolean;
  /**
   * 글 주소에 덧붙일 목록 위치 (예: "board=free&page=2").
   * 글에서 「목록으로」·뒤로 가기를 했을 때 보던 게시판·쪽수로 돌아가는 데 쓴다.
   */
  listQuery?: string;
  /** 지금 보고 있는 글 — 글 아래 목록에서 강조한다 */
  active?: boolean;
}

/** 단일 게시판 모드 테이블 행 컴포넌트 */
export function PostRow({
  post,
  showCategoryIcon = false,
  listQuery,
  active = false,
}: PostRowProps) {
  const router = useRouter();
  const game = useNavigationGame();
  const catColor = post.board?.color ?? "text-text-secondary";
  const commentCount = post._count?.comments || 0;

  return (
    <div
      onClick={() =>
        router.push(
          `/community/${post.id}?game=${GAMES[game].slug}${listQuery ? `&${listQuery}` : ""}`,
        )
      }
      className={cn(
        "grid grid-cols-12 gap-2 px-4 py-3 hover:bg-bg-tertiary cursor-pointer transition-colors border-b border-bg-elevated last:border-0",
        // 고정 글은 옅은 바탕으로만 구분한다(왼쪽 색 막대 금지 — CLAUDE.md)
        post.isPinned && "bg-accent-primary/5",
        // 지금 보는 글 — 옅은 강조 바탕(왼쪽 막대 금지)
        active && "bg-accent-primary/10 hover:bg-accent-primary/15",
      )}
      aria-current={active ? "page" : undefined}
    >
      {/* 제목 열 */}
      <div className="col-span-12 md:col-span-7 flex items-center gap-1.5 min-w-0">
        {post.isPinned && (
          <Pin className="h-3.5 w-3.5 text-accent-primary flex-shrink-0" />
        )}
        {showCategoryIcon && (
          <BoardIcon
            name={post.board?.iconName}
            className={cn("h-3.5 w-3.5 flex-shrink-0", catColor)}
          />
        )}
        <h3
          className={cn(
            "truncate",
            post.isPinned
              ? "font-semibold text-text-primary"
              : "font-medium text-text-primary",
            active && "text-accent-primary",
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
      {/* 작성자 */}
      <div className="col-span-4 md:col-span-2 flex items-center text-sm text-text-secondary truncate">
        {post.author.username}
      </div>
      {/* 조회수 */}
      <div className="col-span-3 md:col-span-1 flex items-center justify-center text-xs text-text-tertiary gap-0.5">
        <Eye className="h-3 w-3" />
        {post.views}
      </div>
      {/* 좋아요 */}
      <div className="col-span-2 md:col-span-1 flex items-center justify-center text-xs text-text-tertiary gap-0.5">
        <Heart className="h-3 w-3" />
        {post._count?.likes || 0}
      </div>
      {/* 작성일 */}
      <div className="col-span-3 md:col-span-1 flex items-center justify-end text-xs text-text-tertiary">
        {formatDate(post.createdAt)}
      </div>
    </div>
  );
}
