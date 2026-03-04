'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Plus, Bookmark, Flame,
  Megaphone, MessageCircle, Lightbulb, HelpCircle, LayoutList,
} from 'lucide-react';
import { communityApi } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';
import type { PostCategory } from '@/components/community/community-types';

// 카테고리 메타 정보
const CATEGORY_META: Record<PostCategory, { label: string; icon: React.ElementType; color: string; param: string }> = {
  NOTICE: { label: '공지사항', icon: Megaphone,       color: 'text-accent-danger',   param: 'NOTICE' },
  FREE:   { label: '자유게시판', icon: MessageCircle,  color: 'text-text-secondary',  param: 'FREE'   },
  TIP:    { label: '팁 & 노하우', icon: Lightbulb,    color: 'text-accent-gold',     param: 'TIP'    },
  QNA:    { label: 'Q&A',         icon: HelpCircle,   color: 'text-accent-primary',  param: 'QNA'    },
};

interface HotPost {
  id: string;
  title: string;
  category: PostCategory;
  _count?: { likes: number; comments: number };
}

export function CommunitySidebarContent() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuthStore();

  // 인기글 TOP 3 — 메인 페이지와 동일한 쿼리 키로 캐시 공유
  const { data: hotPostsData } = useQuery({
    queryKey: ['communityPosts', 'ALL', 'popular', '', '', 1],
    queryFn: async (): Promise<HotPost[]> => {
      const data = await communityApi.getPosts({ sortBy: 'popular', limit: 3 });
      const posts = Array.isArray(data) ? data : (data?.posts ?? []);
      return posts.slice(0, 3);
    },
    staleTime: 5 * 60 * 1000,
  });

  const hotPosts = hotPostsData ?? [];

  return (
    <div className="space-y-5">
      {/* 상단 액션 */}
      <div>
        <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3 px-2">
          커뮤니티
        </h2>
        <div className="space-y-1">
          {/* 글쓰기 CTA */}
          {isAuthenticated && (
            <Link
              href="/community/write"
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-accent-primary text-white font-medium text-sm hover:bg-accent-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>글쓰기</span>
            </Link>
          )}
          {/* 전체글 */}
          <Link
            href="/community"
            className={cn(
              'flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              pathname === '/community'
                ? 'bg-accent-primary/10 text-accent-primary'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
            )}
          >
            <LayoutList className="h-4 w-4" />
            <span>전체글</span>
          </Link>
        </div>
      </div>

      {/* 카테고리 네비게이션 (URL 파라미터 기반 deep-link) */}
      <div>
        <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2 px-2">
          카테고리
        </h2>
        <div className="space-y-0.5">
          {(Object.entries(CATEGORY_META) as [PostCategory, typeof CATEGORY_META[PostCategory]][]).map(([key, meta]) => {
            const Icon = meta.icon;
            const href = `/community?category=${meta.param}`;
            return (
              <Link
                key={key}
                href={href}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
              >
                <Icon className={cn('h-4 w-4', meta.color)} />
                <span>{meta.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* 내 활동 */}
      {isAuthenticated && (
        <div>
          <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2 px-2">
            내 활동
          </h2>
          <div className="space-y-0.5">
            <Link
              href="/community/bookmarks"
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                pathname === '/community/bookmarks'
                  ? 'bg-accent-primary/10 text-accent-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
              )}
            >
              <Bookmark className="h-4 w-4" />
              <span>북마크</span>
            </Link>
          </div>
        </div>
      )}

      {/* 인기글 TOP 3 */}
      {hotPosts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2 px-2">
            <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider flex items-center gap-1">
              <Flame className="h-3.5 w-3.5 text-accent-gold" />
              인기글
            </h2>
            <Link href="/community" className="text-[10px] text-accent-primary hover:underline">
              더보기
            </Link>
          </div>
          <div className="space-y-0.5">
            {hotPosts.map((post) => {
              const meta = CATEGORY_META[post.category];
              const CatIcon = meta.icon;
              return (
                <Link
                  key={post.id}
                  href={`/community/${post.id}`}
                  className="flex items-start gap-2 px-3 py-2 rounded-lg hover:bg-bg-tertiary transition-colors group"
                >
                  <CatIcon className={cn('h-3.5 w-3.5 mt-0.5 flex-shrink-0', meta.color)} />
                  <div className="flex-grow min-w-0">
                    <p className="text-xs text-text-secondary group-hover:text-text-primary line-clamp-2 leading-relaxed">
                      {post.title}
                    </p>
                    {post._count && (
                      <span className="text-[10px] text-text-tertiary">
                        ♥ {post._count.likes}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
