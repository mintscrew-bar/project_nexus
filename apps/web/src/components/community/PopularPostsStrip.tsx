"use client";

import { useRouter } from "next/navigation";
import { Flame, Heart } from "lucide-react";
import { Megaphone, MessageCircle, Lightbulb, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Post, type PostCategory, CATEGORY_META, formatDate } from "./community-types";

// 카테고리 아이콘 컴포넌트 매핑
const CATEGORY_ICONS: Record<PostCategory, React.ElementType> = {
  NOTICE: Megaphone,
  FREE: MessageCircle,
  TIP: Lightbulb,
  QNA: HelpCircle,
};

interface PopularPostsStripProps {
  posts: Post[];
}

/** 인기글 가로 스크롤 카드 스트립 */
export function PopularPostsStrip({ posts }: PopularPostsStripProps) {
  const router = useRouter();

  if (posts.length === 0) return null;

  return (
    <div className="mb-4">
      {/* 섹션 헤더 */}
      <div className="flex items-center gap-2 mb-2">
        <Flame className="h-4 w-4 text-accent-gold" />
        <h2 className="text-sm font-semibold text-text-primary">인기글</h2>
      </div>

      {/* 가로 스크롤 스트립 */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {posts.map((post, idx) => {
          const meta = CATEGORY_META[post.category];
          const CatIcon = CATEGORY_ICONS[post.category];

          return (
            <div
              key={post.id}
              onClick={() => router.push(`/community/${post.id}`)}
              className="w-48 sm:w-56 flex-shrink-0 bg-bg-secondary border border-bg-elevated rounded-xl p-3 cursor-pointer hover:bg-bg-tertiary transition-colors"
            >
              {/* 순위 + 카테고리 아이콘 */}
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-xs font-bold text-accent-gold w-4">
                  {idx + 1}
                </span>
                <CatIcon className={cn("h-3.5 w-3.5", meta.color)} />
                <span className="text-xs text-text-tertiary">{meta.label}</span>
              </div>

              {/* 제목 */}
              <p className="text-sm font-medium text-text-primary line-clamp-2 leading-snug mb-2">
                {post.title}
              </p>

              {/* 하단 메타 */}
              <div className="flex items-center justify-between text-xs text-text-tertiary">
                <span className="flex items-center gap-0.5">
                  <Heart className="h-3 w-3" />
                  {post._count?.likes || 0}
                </span>
                <span>{formatDate(post.createdAt)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
