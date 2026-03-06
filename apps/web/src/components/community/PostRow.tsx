"use client";

import { useRouter } from "next/navigation";
import { Eye, Heart, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type Post,
  type PostCategory,
  CATEGORY_META,
  formatDate,
} from "./community-types";
import { Megaphone, MessageCircle, Lightbulb, HelpCircle } from "lucide-react";

// 카테고리 아이콘 컴포넌트 매핑
const CATEGORY_ICONS: Record<PostCategory, React.ElementType> = {
  NOTICE: Megaphone,
  FREE: MessageCircle,
  TIP: Lightbulb,
  QNA: HelpCircle,
};

interface PostRowProps {
  post: Post;
  /** ALL 모드에서 카테고리 아이콘 표시 여부 */
  showCategoryIcon?: boolean;
}

/** 단일 카테고리 모드 테이블 행 컴포넌트 */
export function PostRow({ post, showCategoryIcon = false }: PostRowProps) {
  const router = useRouter();
  const meta = CATEGORY_META[post.category];
  const CatIcon = CATEGORY_ICONS[post.category];
  const commentCount = post._count?.comments || 0;

  return (
    <div
      onClick={() => router.push(`/community/${post.id}`)}
      className={cn(
        "grid grid-cols-12 gap-2 px-4 py-3 hover:bg-bg-tertiary cursor-pointer transition-colors border-b border-bg-elevated last:border-0",
        post.isPinned && "border-l-2 border-l-accent-primary bg-accent-primary/5"
      )}
    >
      {/* 제목 열 */}
      <div className="col-span-12 md:col-span-7 flex items-center gap-1.5 min-w-0">
        {post.isPinned && (
          <Pin className="h-3.5 w-3.5 text-accent-primary flex-shrink-0" />
        )}
        {showCategoryIcon && (
          <CatIcon className={cn("h-3.5 w-3.5 flex-shrink-0", meta.color)} />
        )}
        <h3
          className={cn(
            "truncate",
            post.isPinned
              ? "font-semibold text-text-primary"
              : "font-medium text-text-primary"
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
