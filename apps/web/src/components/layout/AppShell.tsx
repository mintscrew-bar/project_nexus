'use client';

import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { FriendsPanel } from '@/components/domain/FriendsPanel';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuthStore();

  // /auth/* 라우트 → 풀스크린 (셸 없음)
  const isAuthRoute = pathname.startsWith('/auth');

  // / 라우트에서 미인증 or 로딩 중 → 풀스크린 랜딩/로딩
  const isLandingFullscreen = pathname === '/' && (!isAuthenticated || isLoading);

  if (isAuthRoute || isLandingFullscreen) {
    return <>{children}</>;
  }

  // 인증된 앱 셸
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
    </>
  );
}
