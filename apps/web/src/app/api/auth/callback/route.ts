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

  // 서버 사이드에서 단회용 코드를 실제 토큰으로 교환
  // 브라우저가 토큰을 URL로 받지 않으므로 히스토리/로그 노출 없음
  let accessToken: string;
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

    const data = await exchangeRes.json();
    accessToken = data.accessToken;

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

  // access_token만 /auth/callback 페이지로 전달 (메모리에 저장 후 URL 즉시 제거)
  const response = NextResponse.redirect(
    new URL(`/auth/callback?token=${accessToken}`, appUrl)
  );

  // refresh_token은 암호화된 HTTP-only 쿠키 값으로 설정
  if (refreshCookieValue) {
    response.cookies.set('refresh_token', refreshCookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/api/auth',
    });
  }

  return response;
}
