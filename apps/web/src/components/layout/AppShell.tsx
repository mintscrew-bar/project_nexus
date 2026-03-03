'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { FriendsPanel } from '@/components/domain/FriendsPanel';
import { FloatingDmPanel } from '@/components/domain/FloatingDmPanel';
import { FloatingClanChatPanel } from '@/components/domain/FloatingClanChatPanel';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuthStore();

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

  // / 라우트에서 마운트 후 미인증 or 로딩 중 → 풀스크린 랜딩/로딩
  // mounted 전에는 false로 처리하여 SSR HTML과 일치시킴
  const isLandingFullscreen = pathname === '/' && mounted && (!isAuthenticated || isLoading);

  if (isAuthRoute || isLandingFullscreen) {
    return <>{children}</>;
  }

  // 인증된 앱 셸 (또는 마운트 전 기본 셸)
  return (
    <>
      <Header />
      <main className="flex flex-grow">
        <Sidebar />
        <div className="flex-grow overflow-auto bg-bg-primary">
          {children}
        </div>
      </main>
      <FriendsPanel />
      {/* 플로팅 DM/클랜 채팅 창 — FriendsPanel 왼쪽에 렌더링 */}
      <FloatingDmPanel />
      <FloatingClanChatPanel />
    </>
  );
}
