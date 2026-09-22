"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { FriendsPanel } from "@/components/domain/FriendsPanel";
import { FloatingDmPanel } from "@/components/domain/FloatingDmPanel";
import { FloatingClanChatPanel } from "@/components/domain/FloatingClanChatPanel";
import { CreatorPromoStrip } from "./CreatorPromoStrip";
import { ActiveRoomBanner } from "./ActiveRoomBanner";
import { RoomStartAlertModal } from "@/components/rooms/RoomStartAlertModal";
import { PubgSurfaceGrain } from "./PubgSurfaceGrain";
import { useLobbyStore } from "@/stores/lobby-store";
import { useCurrentGame } from "@/hooks/useCurrentGame";
import { gameFromSlug } from "@nexus/types";
import { rememberGame } from "@/lib/last-game";
import { withoutGamePrefix } from "@/lib/game-links";

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
  // 필름 그레인은 화면 위에 얹는 오버레이다(PubgSurfaceGrain).
  // 래퍼 배경으로 깔면 페이지들이 자기 배경을 칠해 가려진다.
  // ---------------------------------------------------------------
  // 마지막으로 본 게임을 기억한다. 게임을 한 번 고른 사람에게 매번 다시
  // 고르라고 하지 않기 위한 값이다. 경로로 게임이 특정되는 화면에서만 적는다 —
  // 클랜·커뮤니티처럼 게임과 무관한 화면은 기본 게임으로 떨어지므로,
  // 거기서 적으면 배그를 보던 사람의 기억이 롤로 덮인다.
  useEffect(() => {
    if (gameFromSlug(pathname.split("/")[1])) rememberGame(currentGame);
  }, [pathname, currentGame]);

  const themeClass = currentGame === "PUBG" ? "game-pubg" : null;
  useEffect(() => {
    if (!themeClass) return;
    document.body.classList.add(themeClass);
    return () => document.body.classList.remove(themeClass);
  }, [themeClass]);

  // /auth/* 라우트 → 풀스크린 (셸 없음)
  const isAuthRoute = pathname.startsWith("/auth");

  // /broadcast/* → OBS 방송 오버레이. 네비/사이드바/헤더 없이 children만 (자체 고정 캔버스).
  const isBroadcastRoute = pathname.startsWith("/broadcast");

  // / 라우트의 비로그인 랜딩은 자체 정적 헤더/푸터를 가진다.
  // SSR과 첫 hydration 렌더에서도 앱 헤더를 감싸지 않아 공개 랜딩 HTML이 중복 탐색을 만들지 않게 한다.
  // 인증 상태가 확정된 뒤에는 Header + 대시보드 구조로 전환한다.
  const isLandingFullscreen = pathname === "/";

  // 푸터 숨김 라우트 (대시보드성 페이지들: 자체적인 액션바나 스크롤 관리가 필요한 경우)
  // 게임 접두사를 제외한 경로로 판별해야 로비의 고정 높이와 내부 스크롤이 유지된다.
  const gamePathname = withoutGamePrefix(pathname);
  const isTournamentLobbyRoute = /^\/tournaments\/[^/]+\/lobby(?:\/|$)/.test(
    gamePathname,
  );
  const isDashboardRoute =
    isTournamentLobbyRoute ||
    gamePathname.startsWith("/auction/") ||
    gamePathname.startsWith("/draft/") ||
    gamePathname.startsWith("/role-selection/") ||
    gamePathname.endsWith("/bracket");
  const showCreatorPromo = pathname !== "/" && !isDashboardRoute;

  const usesShell = !(isAuthRoute || isLandingFullscreen || isBroadcastRoute);

  // ---------------------------------------------------------------
  // AdSense 높이 강제 방어.
  //
  // AdSense 는 광고 슬롯이 로드되면 광고부터 조상 요소를 거슬러 올라가며
  // `style="height: auto !important"` 를 박는다. 광고가 부모 높이에 잘리지
  // 않게 하려는 동작인데, 이 셸은 화면 높이(h-dvh)를 고정하고 그 안의
  // 영역만 스크롤하는 구조라 틀이 콘텐츠 길이만큼 늘어나 버린다. body 가
  // overflow-hidden 이므로 넘친 부분은 잘리고 스크롤할 곳이 사라진다.
  // (2026-09-17 운영에서 확인: 게시글 상세·커뮤니티 목록에서 댓글·하단까지
  //  못 내려감. 광고 요청을 막으면 정상.)
  //
  // 인라인 !important 는 스타일시트로 이길 수 없어서, 높이가 고정돼야 하는
  // 셸 요소 세 개에 한해 들어오는 즉시 지운다. 그 아래 콘텐츠 요소들은 원래
  // 높이가 auto 라 AdSense 가 건드려도 결과가 같다.
  // 지운 뒤 AdSense 가 다시 넣어도 매번 지울 뿐이고, 운영 실측에서 서로
  // 반복해서 싸우는 일은 없었다(페이지당 3~6회 후 멈춤).
  // ---------------------------------------------------------------
  // ---------------------------------------------------------------
  // 스크롤 주체.
  //
  // 대시보드형 화면(로비·경매·드래프트·역할 선택·대진표)은 뷰포트에 딱 맞고
  // 안쪽 영역만 스크롤해야 한다 — 참가자 목록과 채팅이 각자 자리를 지켜야
  // 하기 때문이다. 그 외 일반 페이지는 **문서 자체가 스크롤**한다.
  //
  // 전에는 모든 화면이 대시보드 방식이었다. 그래서 높이가 body 부터 본문까지
  // 한 줄로 이어졌고, 한 곳을 고치면 다른 화면이 깨졌다. 외부 스크립트가
  // 높이를 건드려도 사이트 전체 스크롤이 죽었다(AdSense 가 실제로 그랬다).
  // 일반 페이지를 문서 스크롤로 되돌리면 그 사슬이 끊긴다.
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!usesShell || !isDashboardRoute) return;
    // 대시보드 화면에서만 body 를 뷰포트에 고정한다.
    document.body.classList.add("h-dvh", "overflow-hidden");
    return () => document.body.classList.remove("h-dvh", "overflow-hidden");
  }, [usesShell, isDashboardRoute]);

  const shellRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const contentFrameRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!usesShell) return;
    const targets = [
      shellRef.current,
      mainRef.current,
      contentFrameRef.current,
    ].filter((el): el is HTMLElement => el !== null);

    const stripHeight = () => {
      for (const el of targets) {
        if (el.style.height) el.style.removeProperty("height");
      }
    };
    stripHeight();

    const observer = new MutationObserver(stripHeight);
    for (const el of targets) {
      observer.observe(el, { attributes: true, attributeFilter: ["style"] });
    }
    return () => observer.disconnect();
  }, [usesShell]);

  if (!usesShell) {
    // 셸이 없는 화면(첫 화면·로그인)에서도 방장의 시작 확인 모달은 떠야 한다.
    // 방송 오버레이만 뺀다 — 송출 화면에 모달이 찍히면 안 된다.
    return (
      <>
        {children}
        {!isBroadcastRoute && <RoomStartAlertModal />}
      </>
    );
  }

  // 인증된 앱 셸 (또는 마운트 전 기본 셸)
  //
  // body가 flex 컨테이너라 `h-full`만 두면 일반 페이지에서 로비로
  // 클라이언트 이동하는 순간 이전 페이지 높이를 기준으로 이 자식이 축소될 수
  // 있다. 그때 로비의 flex-1 본문이 0에 가깝게 접혀 참가자·채팅이 사라진다.
  // 뷰포트 높이와 flex 축소 금지를 함께 명시해 첫 이동과 새로고침을 같게 만든다.
  return (
    <div
      ref={shellRef}
      className={cn(
        "flex w-full flex-col",
        // 대시보드: 뷰포트 높이에 못 박고 안쪽에서만 스크롤한다.
        // 일반 페이지: 최소 한 화면만 채우고 내용만큼 길어진다.
        isDashboardRoute ? "h-dvh min-h-0 flex-none" : "min-h-dvh",
        themeClass,
      )}
    >
      {/* 필름 그레인 오버레이. 좌표만 넘기므로 리렌더는 없다. */}
      {themeClass && <PubgSurfaceGrain />}
      <Header />
      <main
        ref={mainRef}
        className={cn("flex min-w-0 flex-grow", isDashboardRoute && "min-h-0")}
      >
        {/*
          배그 테마에서는 바탕을 비운다. 여기에 불투명한 배경을 깔면
          body 의 그레인과 광원이 통째로 가려진다 — 질감은 콘텐츠 뒤에
          있어야 하고, 카드들이 그 위를 덮는 게 맞다.
        */}
        <div
          ref={contentFrameRef}
          className={cn(
            "flex min-w-0 flex-grow flex-col",
            // 넘치는 부분을 잘라내는 건 뷰포트에 고정된 대시보드에서만 맞다.
            // 일반 페이지에서 자르면 문서가 길어져도 아래를 볼 수 없다.
            isDashboardRoute && "min-h-0 overflow-hidden",
            themeClass ? "bg-transparent" : "bg-bg-primary",
          )}
        >
          {showCreatorPromo && <CreatorPromoStrip />}
          <ActiveRoomBanner />
          {/*
            두 갈래가 **구조가 다른 부모**를 준다. 대시보드는 children 이
            높이가 못 박힌 flex column 의 자식이 되고, 일반 페이지는 내용만큼
            늘어나는 column 의 자식이 된다. 그래서 `flex-1` 에만 기대는 페이지는
            이 판정이 뒤집히는 순간 높이가 0 으로 접힌다 — 로비가 그래서 두 번
            깨졌다. 여기 판정은 경로 정규식이라 라우팅이 바뀌어도 컴파일 에러가
            안 난다. 대시보드형 페이지는 `h-full` 도 같이 들고 있어야 한다.
          */}
          <div
            className={cn(
              "flex flex-1 flex-col",
              isDashboardRoute && "h-full min-h-0 overflow-hidden",
            )}
          >
            {isDashboardRoute ? (
              children
            ) : (
              <>
                {/* 내용이 짧아도 푸터가 화면 아래에 붙도록 본문이 남은 높이를 먹는다. */}
                <div className="min-w-0 flex-1">{children}</div>
                <Footer />
              </>
            )}
          </div>
        </div>
      </main>
      <FriendsPanel />
      {/* 플로팅 DM/클랜 채팅 창 — FriendsPanel 왼쪽에 렌더링 */}
      <FloatingDmPanel />
      <FloatingClanChatPanel />
      {/* 방장이 시작하려는데 내가 막고 있을 때. 어느 페이지에 있든 뜬다. */}
      <RoomStartAlertModal />
    </div>
  );
}
