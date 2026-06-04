import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL || "http://localhost:4000";

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get("refresh_token")?.value;

  if (!refreshToken) {
    return NextResponse.json({ message: "No refresh token" }, { status: 401 });
  }

  try {
    // Forward the request to the backend with the refresh token as a cookie
    const backendResponse = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `refresh_token=${refreshToken}`,
      },
      credentials: "include",
    });

    try {
      // Attempt to read JSON body (may fail if backend returns non-JSON)
      const responseData = await backendResponse.json().catch(() => ({}));
      // Attach parsed body for further handling below
      (backendResponse as any)._parsedBody = responseData;
    } catch (e) {
      console.error("Error parsing backend refresh response body:", e);
      (backendResponse as any)._parsedBody = {};
    }

    const responseData = (backendResponse as any)._parsedBody;

    if (!backendResponse.ok) {
      const response = NextResponse.json(
        { message: responseData.message || "Token refresh failed" },
        { status: backendResponse.status },
      );

      // 401/403만 실제 세션 무효로 간주한다.
      // 429/5xx 같은 일시 오류에서 쿠키를 지우면 정상 유저가 강제 로그아웃된다.
      if (backendResponse.status === 401 || backendResponse.status === 403) {
        response.cookies.set("refresh_token", "", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 0,
          path: "/api/auth",
        });
      }

      return response;
    }

    // Get the new refresh token from the backend's Set-Cookie header
    const setCookieHeader = backendResponse.headers.get("set-cookie");
    let newRefreshToken: string | null = null;

    if (setCookieHeader) {
      const match = setCookieHeader.match(/refresh_token=([^;]+)/);
      if (match) {
        newRefreshToken = match[1];
      }
    }

    const response = NextResponse.json(responseData);

    // Set the new refresh token cookie on the frontend domain
    if (newRefreshToken) {
      response.cookies.set("refresh_token", newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
        path: "/api/auth",
      });
    }

    return response;
  } catch (error) {
    console.error("Refresh token error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 },
    );
  }
}
