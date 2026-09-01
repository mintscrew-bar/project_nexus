import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');

  const appUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  // 서버 사이드에서는 내부 네트워크 주소(API_URL)를 우선 사용
  const apiUrl =
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:4000';

  if (!code) {
    return NextResponse.redirect(new URL('/auth/login?error=missing_code', appUrl));
  }

  // 서버 사이드에서 단회용 코드를 refresh 쿠키로 교환한다.
  // access token은 응답에 담겨 오지만 브라우저로 넘기지 않는다 —
  // 리다이렉트 URL에 실으면 nginx access log와 same-origin 요청의 Referer에
  // 평문으로 남는다. 클라이언트는 이 쿠키로 /api/auth/refresh를 호출해
  // 메모리에만 토큰을 받아간다.
  let refreshCookieValue: string;
  try {
    const exchangeRes = await fetch(`${apiUrl}/api/auth/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    if (!exchangeRes.ok) {
      throw new Error(`코드 교환 실패: ${exchangeRes.status}`);
    }

    // Set-Cookie 헤더에서 암호화된 refresh_token 쿠키 값을 프론트엔드 도메인으로 전달
    const setCookieHeader = exchangeRes.headers.get('set-cookie');
    if (setCookieHeader) {
      const parsed = setCookieHeader.match(/refresh_token=([^;]+)/);
      refreshCookieValue = parsed?.[1] ?? '';
    } else {
      refreshCookieValue = '';
    }
  } catch {
    return NextResponse.redirect(new URL('/auth/login?error=exchange_failed', appUrl));
  }

  // refresh 쿠키가 없으면 세션을 세울 수단이 없다. 깨진 콜백 화면 대신 로그인으로 되돌린다.
  if (!refreshCookieValue) {
    return NextResponse.redirect(
      new URL('/auth/login?error=exchange_failed', appUrl)
    );
  }

  // 쿼리스트링 없이 콜백 페이지로 보낸다. 토큰은 아래 쿠키로만 전달된다.
  const response = NextResponse.redirect(new URL('/auth/callback', appUrl));

  // refresh_token은 암호화된 HTTP-only 쿠키 값으로 설정
  response.cookies.set('refresh_token', refreshCookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/api/auth',
  });

  return response;
}
