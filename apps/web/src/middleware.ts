import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Admin 라우트 보호는 페이지 컴포넌트(클라이언트)에서 처리한다.
// refresh_token 쿠키가 path="/api/auth"로 제한되어 있어
// 미들웨어에서는 쿠키에 접근할 수 없기 때문.
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
