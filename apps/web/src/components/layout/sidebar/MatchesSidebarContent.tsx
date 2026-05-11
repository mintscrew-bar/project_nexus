'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search, Clock, User, Star, ChevronRight, Trophy } from 'lucide-react';
import { riotApi, ensureValidToken } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { getTierImage } from '@/components/matches/match-utils';
import Image from 'next/image';

// matches/page.tsx 와 동일한 구조 (localStorage 공유)
interface RecentSearch {
  type: 'summoner' | 'user';
  gameName?: string;
  tagLine?: string;
  username?: string;
  userId?: string;
  timestamp: number;
}

interface RiotAccount {
  id: string;
  gameName: string;
  tagLine: string;
  tier?: string;
  rank?: string;
  lp?: number;
  isPrimary: boolean;
}

export function MatchesSidebarContent() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const setUser = useAuthStore((s) => s.setUser);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);

  // 내 연동 계정 — react-query 로 캐싱/중복호출 방지.
  // 인증 초기화(isLoading) 완료 후, 그리고 access token 이 유효할 때만 호출하여
  // 만료 토큰으로 인한 401 노이즈 방지.
  const { data: accounts = [] } = useQuery<RiotAccount[]>({
    queryKey: ["sidebar", "riotAccounts"],
    queryFn: async () => {
      // 토큰 미리 검증 → 만료/없음이면 호출 자체를 안 함 (401 노이즈 방지)
      const token = await ensureValidToken();
      if (!token) {
        // refresh 도 실패한 상태 → 로컬 인증 상태 동기화
        setUser(null);
        return [];
      }
      try {
        const data = await riotApi.getAccounts();
        return data || [];
      } catch (err: any) {
        if (err?.response?.status === 401) setUser(null);
        return [];
      }
    },
    enabled: !isLoading && isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // 최근 검색 불러오기 (localStorage, matches 페이지와 동일한 키)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('recentSearches');
      if (saved) setRecentSearches(JSON.parse(saved));
    } catch {}
  }, []);

  const handleRecentSearchClick = (search: RecentSearch) => {
    if (search.type === 'summoner' && search.gameName && search.tagLine) {
      router.push(`/matches/summoner/${encodeURIComponent(search.gameName)}/${encodeURIComponent(search.tagLine)}`);
    } else if (search.type === 'user' && search.userId) {
      router.push(`/matches/user/${search.userId}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* 전적 검색 홈 링크 */}
      <div>
        <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3 px-2">
          전적
        </h2>
        <Link
          href="/matches"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors duration-150"
        >
          <Search className="h-4 w-4" />
          <span className="font-medium">소환사 검색</span>
        </Link>
      </div>

      {/* 내 연동 계정 */}
      {isAuthenticated && accounts.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3 px-2">
            내 연동 계정
          </h2>
          <div className="space-y-1">
            {accounts.map((account) => {
              const tierImg = getTierImage(account.tier);
              return (
                <Link
                  key={account.id}
                  href={`/matches/summoner/${encodeURIComponent(account.gameName)}/${encodeURIComponent(account.tagLine)}`}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-bg-tertiary transition-colors group"
                >
                  {/* 티어 아이콘 or 기본 아이콘 */}
                  {tierImg ? (
                    <Image
                      src={tierImg}
                      alt={account.tier || ''}
                      width={20}
                      height={20}
                      className="w-5 h-5 object-contain flex-shrink-0"
                    />
                  ) : (
                    <Trophy className="h-4 w-4 text-text-tertiary flex-shrink-0" />
                  )}

                  <div className="flex-grow min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-medium text-text-primary truncate">
                        {account.gameName}
                      </span>
                      {/* 대표 계정 별 표시 */}
                      {account.isPrimary && (
                        <Star className="h-3 w-3 text-yellow-400 fill-yellow-400 flex-shrink-0" />
                      )}
                    </div>
                    <span className="text-xs text-text-tertiary">
                      {account.tier
                        ? `${account.tier} ${account.rank ?? ''} ${account.lp != null ? `· ${account.lp} LP` : ''}`
                        : '언랭크'}
                    </span>
                  </div>

                  <ChevronRight className="h-3.5 w-3.5 text-text-quaternary group-hover:text-accent-primary transition-colors flex-shrink-0" />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* 최근 검색 */}
      {recentSearches.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3 px-2">
            최근 검색
          </h2>
          <div className="space-y-1">
            {recentSearches.slice(0, 5).map((search, i) => (
              <button
                key={i}
                onClick={() => handleRecentSearchClick(search)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-bg-tertiary transition-colors text-left group"
              >
                <User className={`h-4 w-4 flex-shrink-0 ${search.type === 'summoner' ? 'text-accent-primary' : 'text-accent-success'}`} />
                <span className="text-sm text-text-secondary group-hover:text-text-primary truncate">
                  {search.type === 'summoner'
                    ? `${search.gameName}#${search.tagLine}`
                    : search.username}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
