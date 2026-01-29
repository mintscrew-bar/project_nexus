import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || 'http://localhost:4000';

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get('refresh_token')?.value;

  if (!refreshToken) {
    return NextResponse.json(
      { message: 'No refresh token' },
      { status: 401 }
    );
  }

  try {
    // Forward the request to the backend with the refresh token as a cookie
    const backendResponse = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `refresh_token=${refreshToken}`,
      },
    });

    if (!backendResponse.ok) {
      // Clear the invalid refresh token cookie
      const response = NextResponse.json(
        { message: 'Token refresh failed' },
        { status: 401 }
      );
      response.cookies.delete('refresh_token');
      return response;
    }

    const data = await backendResponse.json();

    // Get the new refresh token from the backend's Set-Cookie header
    const setCookieHeader = backendResponse.headers.get('set-cookie');
    let newRefreshToken: string | null = null;

    if (setCookieHeader) {
      const match = setCookieHeader.match(/refresh_token=([^;]+)/);
      if (match) {
        newRefreshToken = match[1];
      }
    }

    const response = NextResponse.json(data);

    // Set the new refresh token cookie on the frontend domain
    if (newRefreshToken) {
      response.cookies.set('refresh_token', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
        path: '/api/auth',
      });
    }

    return response;
  } catch (error) {
    console.error('Refresh token error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
