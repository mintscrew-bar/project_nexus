"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui";
import { Megaphone, MessageCircle, Lightbulb, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Post, type PostCategory, CATEGORY_META, formatDate } from "./community-types";
import { useCommunityStore } from "@/stores/community-store";

// 카테고리 아이콘 컴포넌트 매핑
const CATEGORY_ICONS: Record<PostCategory, React.ElementType> = {
  NOTICE: Megaphone,
  FREE: MessageCircle,
  TIP: Lightbulb,
  QNA: HelpCircle,
};

interface CategoryCardProps {
  category: PostCategory;
  posts: Post[];
  totalCount: number;
  isLoading?: boolean;
}

/** ALL 모드 2x2 그리드의 카테고리별 카드 위젯 */
export function CategoryCard({
  category,
  posts,
  totalCount,
  isLoading = false,
}: CategoryCardProps) {
  const router = useRouter();
  const setSelectedCategory = useCommunityStore((s) => s.setSelectedCategory);
  const meta = CATEGORY_META[category];
  const Icon = CATEGORY_ICONS[category];

  // 최대 5개 표시
  const displayPosts = posts.slice(0, 5);

  return (
    <Card className="overflow-hidden flex flex-col">
      {/* 카드 헤더 */}
      <div className="bg-bg-tertiary border-b border-bg-elevated px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", meta.color)} />
          <h2 className="text-sm font-semibold text-text-primary">{meta.fullLabel}</h2>
          {totalCount > 0 && (
            <span className="text-xs text-text-tertiary">{totalCount}개</span>
          )}
        </div>
        <button
          onClick={() => setSelectedCategory(category)}
          className="text-xs text-text-tertiary hover:text-accent-primary transition-colors"
        >
          더보기 →
        </button>
      </div>

      {/* 카드 바디 */}
      <CardContent className="p-0 flex-1">
        {isLoading ? (
          // 스켈레톤
          <div className="p-3 space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-3 bg-bg-tertiary rounded skeleton flex-1" />
                <div className="h-3 bg-bg-tertiary rounded skeleton w-12 flex-shrink-0" />
              </div>
            ))}
          </div>
        ) : displayPosts.length === 0 ? (
          <div className="p-6 text-center text-text-tertiary text-xs">
            게시글이 없습니다
          </div>
        ) : (
          <div>
            {displayPosts.map((post) => (
              <div
                key={post.id}
                onClick={() => router.push(`/community/${post.id}`)}
                className="flex items-center gap-2 px-4 py-2.5 hover:bg-bg-tertiary cursor-pointer transition-colors border-b border-bg-elevated last:border-0"
              >
                <p className="text-sm text-text-primary truncate flex-1">
                  {post.title}
                </p>
                <span className="text-xs text-text-tertiary flex-shrink-0">
                  {formatDate(post.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
