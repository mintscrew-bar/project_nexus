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
import { useCommunityStore } from '@/stores/community-store';
import { cn } from '@/lib/utils';
import type { PostCategory } from '@/components/community/community-types';

// 카테고리 메타 정보
const CATEGORY_META: Record<PostCategory, { label: string; icon: React.ElementType; color: string }> = {
  NOTICE: { label: '공지사항', icon: Megaphone,       color: 'text-accent-danger'  },
  FREE:   { label: '자유게시판', icon: MessageCircle,  color: 'text-text-secondary' },
  TIP:    { label: '팁 & 노하우', icon: Lightbulb,    color: 'text-accent-gold'    },
  QNA:    { label: 'Q&A',         icon: HelpCircle,   color: 'text-accent-primary' },
};

const CATEGORY_KEYS: PostCategory[] = ['NOTICE', 'FREE', 'TIP', 'QNA'];

interface HotPost {
  id: string;
  title: string;
  category: PostCategory;
  _count?: { likes: number; comments: number };
}

export function CommunitySidebarContent() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuthStore();
  const selectedCategory = useCommunityStore((s) => s.selectedCategory);
  const setSelectedCategory = useCommunityStore((s) => s.setSelectedCategory);

  // 인기글 TOP 5
  const { data: hotPostsData } = useQuery({
    queryKey: ['communityPosts', 'ALL', 'popular', '', '', 1],
    queryFn: async (): Promise<HotPost[]> => {
      const data = await communityApi.getPosts({ sortBy: 'popular', limit: 5 });
      const posts = Array.isArray(data) ? data : (data?.posts ?? []);
      return posts.slice(0, 5);
    },
    staleTime: 5 * 60 * 1000,
  });

  const hotPosts = hotPostsData ?? [];

  // 카테고리 클릭 핸들러: store 업데이트 + 커뮤니티 메인 경로가 아니면 이동
  const handleCategoryClick = (category: PostCategory | 'ALL') => {
    setSelectedCategory(category);
  };

  const isOnCommunityMain = pathname === '/community';

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
          {/* 전체글 — store 직접 제어 */}
          {isOnCommunityMain ? (
            <button
              onClick={() => handleCategoryClick('ALL')}
              className={cn(
                'flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full text-left',
                selectedCategory === 'ALL'
                  ? 'bg-accent-primary/10 text-accent-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
              )}
            >
              <LayoutList className="h-4 w-4" />
              <span>전체글</span>
            </button>
          ) : (
            <Link
              href="/community"
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
            >
              <LayoutList className="h-4 w-4" />
              <span>전체글</span>
            </Link>
          )}
        </div>
      </div>

      {/* 카테고리 네비게이션 — store 직접 업데이트 */}
      <div>
        <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2 px-2">
          카테고리
        </h2>
        <div className="space-y-0.5">
          {CATEGORY_KEYS.map((key) => {
            const meta = CATEGORY_META[key];
            const Icon = meta.icon;
            const isActive = isOnCommunityMain && selectedCategory === key;

            return isOnCommunityMain ? (
              <button
                key={key}
                onClick={() => handleCategoryClick(key)}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors w-full text-left',
                  isActive
                    ? 'bg-accent-primary/10 text-accent-primary font-medium'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
                )}
              >
                <Icon className={cn('h-4 w-4', isActive ? 'text-accent-primary' : meta.color)} />
                <span>{meta.label}</span>
              </button>
            ) : (
              <Link
                key={key}
                href={`/community?category=${key}`}
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

      {/* 실시간 인기글 TOP 5 */}
      {hotPosts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2 px-2">
            <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider flex items-center gap-1">
              <Flame className="h-3.5 w-3.5 text-accent-gold" />
              인기글
            </h2>
          </div>
          <div className="space-y-0.5">
            {hotPosts.map((post, idx) => {
              const meta = CATEGORY_META[post.category];
              const CatIcon = meta?.icon ?? MessageCircle;
              const catColor = meta?.color ?? 'text-text-secondary';
              return (
                <Link
                  key={post.id}
                  href={`/community/${post.id}`}
                  className="flex items-start gap-2 px-3 py-2 rounded-lg hover:bg-bg-tertiary transition-colors group"
                >
                  {/* 순위 번호 */}
                  <span className={cn(
                    'text-xs font-bold w-4 mt-0.5 flex-shrink-0',
                    idx < 3 ? 'text-accent-gold' : 'text-text-tertiary'
                  )}>
                    {idx + 1}
                  </span>
                  <CatIcon className={cn('h-3.5 w-3.5 mt-0.5 flex-shrink-0', catColor)} />
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
