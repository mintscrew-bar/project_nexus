import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// /admin 경로는 refresh_token 쿠키가 없으면 로그인 페이지로 보낸다.
// 실제 role(ADMIN) 검증은 페이지 컴포넌트와 백엔드 API에서 처리한다.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin")) {
    const hasRefreshToken = request.cookies.has("refresh_token");
    if (!hasRefreshToken) {
      const loginUrl = new URL("/auth/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
