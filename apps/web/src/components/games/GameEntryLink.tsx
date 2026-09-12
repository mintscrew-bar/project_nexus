"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";

/**
 * 게임 허브로 들어가는 링크.
 *
 * 비로그인은 로그인을 거쳐야 하고(게임 진입은 Discord 로그인이 전제다),
 * 이미 로그인한 사람은 곧바로 게임으로 가야 한다. 전에는 로그인 여부를
 * 보지 않고 늘 `/auth/login` 으로 보내서, 로그인한 사람도 로그인 화면을
 * 한 번 더 만났다 — 세션이 풀린 것처럼 보였다.
 *
 * **`href` 는 비로그인 기준으로 고정하고 클릭 시점에만 갈아탄다.** 인증
 * 상태로 `href` 를 바꾸면 서버 렌더 HTML 과 하이드레이션 결과가 달라져
 * 불일치 경고가 난다. 크롤러도 로그인 경로를 보는 게 맞다.
 *
 * 카드 마크업은 서버에서 그려 `children` 으로 받는다 — 랜딩 번들에
 * 들어가는 건 이 얇은 껍데기뿐이다.
 */
export function GameEntryLink({
  slug,
  className,
  children,
}: {
  slug: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  return (
    <Link
      href={`/auth/login?redirect=/${slug}`}
      className={className}
      onClick={(event) => {
        if (!isAuthenticated) return;
        event.preventDefault();
        router.push(`/${slug}`);
      }}
    >
      {children}
    </Link>
  );
}
