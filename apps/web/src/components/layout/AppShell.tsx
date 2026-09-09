'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';
import { Header } from './Header';
import { Footer } from './Footer';
import { FriendsPanel } from '@/components/domain/FriendsPanel';
import { FloatingDmPanel } from '@/components/domain/FloatingDmPanel';
import { FloatingClanChatPanel } from '@/components/domain/FloatingClanChatPanel';
import { CreatorPromoStrip } from './CreatorPromoStrip';
import { ActiveRoomBanner } from './ActiveRoomBanner';
import { useLobbyStore } from '@/stores/lobby-store';
import { useCurrentGame } from '@/hooks/useCurrentGame';
import { gameFromSlug } from '@nexus/types';
import { rememberGame } from '@/lib/last-game';
import { withoutGamePrefix } from '@/lib/game-links';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const currentGame = useCurrentGame();
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

  useEffect(() => {
    if (mounted && !isAuthenticated) {
      useLobbyStore.getState().disconnect();
    }
  }, [mounted, isAuthenticated]);

  // ---------------------------------------------------------------
  // 게임 테마.
  //
  // 토큰은 래퍼와 body 양쪽에 건다. 모달·툴팁은 createPortal로
  // document.body에 그려져 래퍼 밖에 있어서, 래퍼에만 걸면 배그 화면에서
  // 모달만 롤 색으로 뜬다.
  // 질감(.game-pubg-surface)은 래퍼 한 곳에만 — 두 겹으로 깔리면 안 된다.
  // ---------------------------------------------------------------
  // 마지막으로 본 게임을 기억한다. 게임을 한 번 고른 사람에게 매번 다시
  // 고르라고 하지 않기 위한 값이다. 경로로 게임이 특정되는 화면에서만 적는다 —
  // 클랜·커뮤니티처럼 게임과 무관한 화면은 기본 게임으로 떨어지므로,
  // 거기서 적으면 배그를 보던 사람의 기억이 롤로 덮인다.
  useEffect(() => {
    if (gameFromSlug(pathname.split('/')[1])) rememberGame(currentGame);
  }, [pathname, currentGame]);

  const themeClass = currentGame === 'PUBG' ? 'game-pubg' : null;
  useEffect(() => {
    if (!themeClass) return;
    document.body.classList.add(themeClass);
    return () => document.body.classList.remove(themeClass);
  }, [themeClass]);

  // /auth/* 라우트 → 풀스크린 (셸 없음)
  const isAuthRoute = pathname.startsWith('/auth');

  // /broadcast/* → OBS 방송 오버레이. 네비/사이드바/헤더 없이 children만 (자체 고정 캔버스).
  const isBroadcastRoute = pathname.startsWith('/broadcast');

  // / 라우트의 비로그인 랜딩은 자체 정적 헤더/푸터를 가진다.
  // SSR과 첫 hydration 렌더에서도 앱 헤더를 감싸지 않아 공개 랜딩 HTML이 중복 탐색을 만들지 않게 한다.
  // 인증 상태가 확정된 뒤에는 Header + 대시보드 구조로 전환한다.
  const isLandingFullscreen = pathname === '/' && (!mounted || !isAuthenticated);

  // 푸터 숨김 라우트 (대시보드성 페이지들: 자체적인 액션바나 스크롤 관리가 필요한 경우)
  // 게임 접두사를 제외한 경로로 판별해야 로비의 고정 높이와 내부 스크롤이 유지된다.
  const gamePathname = withoutGamePrefix(pathname);
  const isTournamentLobbyRoute = /^\/tournaments\/[^/]+\/lobby(?:\/|$)/.test(gamePathname);
  const isDashboardRoute =
    isTournamentLobbyRoute ||
    gamePathname.startsWith('/auction/') ||
    gamePathname.startsWith('/draft/') ||
    gamePathname.startsWith('/role-selection/') ||
    gamePathname.endsWith('/bracket');
  const showCreatorPromo = pathname !== '/' && !isDashboardRoute;

  if (isAuthRoute || isLandingFullscreen || isBroadcastRoute) {
    return <>{children}</>;
  }

  // 인증된 앱 셸 (또는 마운트 전 기본 셸)
  return (
    <div className={cn(
      "flex h-full min-h-0 flex-col",
      themeClass,
      themeClass && "game-pubg-surface",
    )}>
      <Header />
      <main className="flex min-h-0 min-w-0 flex-grow">
        {/*
          배그 테마에서는 바탕을 비운다. 여기에 불투명한 배경을 깔면
          래퍼(.game-pubg-surface)의 격자·노이즈가 통째로 가려진다 —
          질감은 콘텐츠 뒤에 있어야 하고, 카드들이 그 위를 덮는 게 맞다.
        */}
        <div className={cn(
          "flex min-h-0 min-w-0 flex-grow flex-col overflow-hidden",
          themeClass ? "bg-transparent" : "bg-bg-primary",
        )}>
          {showCreatorPromo && <CreatorPromoStrip />}
          <ActiveRoomBanner />
          {/*
            - isDashboardRoute: 페이지 전체가 viewport에 맞게 고정되어야 함 (h-full)
            - 일반 페이지: 내용에 따라 전체 스크롤 가능 (overflow-auto)
          */}
          <div className={cn(
            "flex-1 flex flex-col min-h-0",
            isDashboardRoute ? "overflow-hidden" : "overflow-auto"
          )}>
            {isDashboardRoute ? children : (
              <div className="grid min-h-full grid-rows-[1fr_auto]">
                <div className="min-w-0">{children}</div>
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
    </div>
  );
}
