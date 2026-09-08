"use client";

import { useAuthStore } from "@/stores/auth-store";
import Link from "next/link";
import { useGamePrefix } from "@/hooks/useCurrentGame";

export function AuthButton() {
  const gamePrefix = useGamePrefix();
  const { user, isAuthenticated, logout } = useAuthStore();

  if (isAuthenticated && user) {
    return (
      <div className="flex items-center gap-4">
        <Link
          href={`${gamePrefix}/profile`}
          className="text-text-secondary hover:text-accent-primary transition-colors"
        >
          {user.username}
        </Link>
        <button
          onClick={() => logout()}
          className="text-text-secondary hover:text-accent-primary transition-colors"
        >
          로그아웃
        </button>
      </div>
    );
  }

  return (
    <Link
      href="/auth/login"
      className="text-text-secondary hover:text-accent-primary transition-colors"
    >
      로그인
    </Link>
  );
}
