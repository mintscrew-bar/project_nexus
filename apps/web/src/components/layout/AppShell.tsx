'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';
import { FriendsPanel } from '@/components/domain/FriendsPanel';
import { FloatingDmPanel } from '@/components/domain/FloatingDmPanel';
import { FloatingClanChatPanel } from '@/components/domain/FloatingClanChatPanel';
import { CreatorPromoStrip } from './CreatorPromoStrip';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated } = useAuthStore();

  // ---------------------------------------------------------------
  // Hydration 불일치 방지:
  // isAuthenticated/isLoading은 클라이언트 전용 상태(Zustand, localStorage)에 의존한다.
  // 서버 렌더링 시점과 클라이언트 첫 렌더를 맞추기 위해 mounted 전에는
  // 인증 상태를 무관하게 전체 셸을 렌더링한다.
  // (실제 리다이렉트/보호는 각 페이지 컴포넌트에서 처리)
  // ---------------------------------------------------------------
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // /auth/* 라우트 → 풀스크린 (셸 없음)
  const isAuthRoute = pathname.startsWith('/auth');

  // /broadcast/* → OBS 방송 오버레이. 네비/사이드바/헤더 없이 children만 (자체 고정 캔버스).
  const isBroadcastRoute = pathname.startsWith('/broadcast');

  // / 라우트의 비로그인 랜딩은 자체 정적 헤더/푸터를 가진다.
  // SSR과 첫 hydration 렌더에서도 앱 헤더를 감싸지 않아 공개 랜딩 HTML이 중복 탐색을 만들지 않게 한다.
  // 인증 상태가 확정된 뒤에는 Header + 대시보드 구조로 전환한다.
  const isLandingFullscreen = pathname === '/' && (!mounted || !isAuthenticated);

  // 푸터 숨김 라우트 (대시보드성 페이지들: 자체적인 액션바나 스크롤 관리가 필요한 경우)
  const isDashboardRoute =
    pathname.includes('/lobby') ||
    pathname.startsWith('/auction/') ||
    pathname.startsWith('/draft/') ||
    pathname.startsWith('/role-selection/') ||
    pathname.endsWith('/bracket');
  const showCreatorPromo = pathname !== '/' && !isDashboardRoute;

  if (isAuthRoute || isLandingFullscreen || isBroadcastRoute) {
    return <>{children}</>;
  }

  // 인증된 앱 셸 (또는 마운트 전 기본 셸)
  return (
    <>
      <Header />
      <main className="flex flex-grow min-h-0">
        {!isDashboardRoute && <Sidebar />}
        <div className="flex flex-col flex-grow min-h-0 bg-bg-primary overflow-hidden">
          {showCreatorPromo && <CreatorPromoStrip />}
          {/*
            - isDashboardRoute: 페이지 전체가 viewport에 맞게 고정되어야 함 (h-full)
            - 일반 페이지: 내용에 따라 전체 스크롤 가능 (overflow-auto)
          */}
          <div className={cn(
            "flex-1 flex flex-col min-h-0",
            isDashboardRoute ? "overflow-hidden" : "overflow-auto"
          )}>
            {isDashboardRoute ? children : (
              <div className="flex min-h-full flex-1 flex-col">
                {children}
                <Footer />
              </div>
            )}
          </div>
        </div>
      </main>
      <FriendsPanel />
      {/* 플로팅 DM/클랜 채팅 창 — FriendsPanel 왼쪽에 렌더링 */}
      <FloatingDmPanel />
      <FloatingClanChatPanel />
    </>
  );
}
