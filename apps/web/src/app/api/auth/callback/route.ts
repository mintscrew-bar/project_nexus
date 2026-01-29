import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const accessToken = searchParams.get('access_token');
  const refreshToken = searchParams.get('refresh_token');

  if (!accessToken || !refreshToken) {
    // Redirect to login with error
    return NextResponse.redirect(new URL('/auth/login?error=missing_tokens', request.url));
  }

  // Create response that redirects to the frontend callback
  const response = NextResponse.redirect(
    new URL(`/auth/callback?token=${accessToken}`, request.url)
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
