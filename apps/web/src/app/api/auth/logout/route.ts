import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || 'http://localhost:4000';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const refreshToken = request.cookies.get('refresh_token')?.value;

  try {
    // Call backend logout if we have an auth header
    if (authHeader) {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          ...(refreshToken ? { 'Cookie': `refresh_token=${refreshToken}` } : {}),
        },
      });
    }
  } catch (error) {
    console.error('Logout error:', error);
  }

  // Always clear the refresh token cookie
  const response = NextResponse.json({ message: 'Logged out successfully' });
  response.cookies.delete('refresh_token');

  return response;
}
