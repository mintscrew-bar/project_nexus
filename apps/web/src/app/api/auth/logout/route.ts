import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || 'http://localhost:4000';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const refreshCookieValue = request.cookies.get('refresh_token')?.value;

  try {
    // Call backend logout if we have an auth header
    if (authHeader) {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          ...(refreshCookieValue ? { 'Cookie': `refresh_token=${refreshCookieValue}` } : {}),
        },
      });
    }
  } catch (error) {
    console.error('Logout error:', error);
  }

  // refresh_token 쿠키 삭제 — 세팅 시 path: '/api/auth'를 사용했으므로 동일하게 명시해야 실제로 삭제됨
  const response = NextResponse.json({ message: 'Logged out successfully' });
  response.cookies.set('refresh_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/api/auth',
  });

  return response;
}
