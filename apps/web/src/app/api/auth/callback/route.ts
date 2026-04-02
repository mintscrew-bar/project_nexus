import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const accessToken = searchParams.get('access_token');
  const refreshToken = searchParams.get('refresh_token');

  // 컨테이너 내부에서 request.url이 0.0.0.0으로 잡히는 문제 방지
  const appUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';

  if (!accessToken || !refreshToken) {
    return NextResponse.redirect(new URL('/auth/login?error=missing_tokens', appUrl));
  }

  // Create response that redirects to the frontend callback
  const response = NextResponse.redirect(
    new URL(`/auth/callback?token=${accessToken}`, appUrl)
  );

  // Set the refresh token as an HTTP-only cookie on the frontend domain
  response.cookies.set('refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    path: '/api/auth',
  });

  return response;
}
