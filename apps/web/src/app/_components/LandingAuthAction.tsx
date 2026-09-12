"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GAMES } from "@nexus/types";
import { useAuthStore } from "@/stores/auth-store";
import { lastGameOrDefault } from "@/lib/last-game";

/**
 * 랜딩 헤더 오른쪽 버튼.
 *
 * `/` 는 로그인 여부와 무관하게 이 랜딩을 그리고, AppShell 도 이 경로에서는
 * 앱 헤더를 감싸지 않는다. 그래서 여기에 "로그인" 만 박아 두면 **로그인한
 * 사람에게도 로그인 버튼만 보인다** — 세션은 멀쩡한데 로그아웃된 것처럼
 * 보였던 게 이것이다.
 *
 * 서버 렌더와 첫 클라이언트 렌더는 **비로그인 모습으로 고정한다.** 인증
 * 상태는 클라이언트에서만 알 수 있어서, 바로 갈아끼우면 하이드레이션
 * 불일치가 난다. 크롤러가 로그인 링크를 보는 것도 이쪽이 맞다.
 */
export function LandingAuthAction() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { isAuthenticated, user } = useAuthStore();

  if (!mounted || !isAuthenticated) {
    return (
      <Link
        href="/auth/login"
        className="flex-shrink-0 rounded-lg bg-accent-primary px-4 py-2.5 text-sm font-medium text-accent-on transition-colors duration-150 hover:bg-accent-hover active:bg-accent-active sm:px-6"
      >
        로그인
      </Link>
    );
  }

  // 마지막으로 보던 게임으로 돌려보낸다. 게임을 한 번 고른 사람에게
  // 어느 게임인지 다시 묻지 않는다.
  const slug = GAMES[lastGameOrDefault()].slug;

  return (
    <Link
      href={`/${slug}`}
      className="flex min-w-0 flex-shrink-0 items-center gap-2 rounded-lg bg-accent-primary px-3 py-2 text-sm font-medium text-accent-on transition-colors duration-150 hover:bg-accent-hover active:bg-accent-active sm:px-4"
    >
      {user?.avatar ? (
        // 랜딩은 공개 페이지라 next/image 설정을 타지 않는 작은 아바타면 충분하다.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.avatar}
          alt=""
          aria-hidden
          className="h-6 w-6 flex-shrink-0 rounded-full object-cover"
        />
      ) : null}
      <span className="truncate">내 대시보드</span>
    </Link>
  );
}
