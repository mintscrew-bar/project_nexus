import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next 16 에서 middleware 가 proxy 로 이름이 바뀌었다(동작은 같다).
//
// Admin 라우트 보호는 페이지 컴포넌트(클라이언트)에서 처리한다.
// refresh_token 쿠키가 path="/api/auth"로 제한되어 있어
// 프록시에서는 쿠키에 접근할 수 없기 때문.
export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
