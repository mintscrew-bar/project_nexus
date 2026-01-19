"use client";

import { useAuthStore } from "@/stores/auth-store";
import Link from "next/link";

export function AuthButton() {
  const { user, isAuthenticated, logout } = useAuthStore();

  if (isAuthenticated && user) {
    return (
      <div className="flex items-center gap-4">
        <Link
          href="/profile"
          className="text-gray-300 hover:text-primary-500 transition-colors"
        >
          {user.username}
        </Link>
        <button
          onClick={() => logout()}
          className="text-gray-300 hover:text-primary-500 transition-colors"
        >
          로그아웃
        </button>
      </div>
    );
  }

  return (
    <Link
      href="/auth/login"
      className="text-gray-300 hover:text-primary-500 transition-colors"
    >
      로그인
    </Link>
  );
}
