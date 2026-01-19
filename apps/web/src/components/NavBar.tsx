"use client";

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { AuthButton } from "@/components/AuthButton";

export function NavBar() {
  return (
    <header className="border-b border-dark-400 bg-dark-600/50 backdrop-blur-sm sticky top-0 z-50">
      <nav className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <Logo size="md" variant="icon-only" />
          <span className="text-xl font-bold bg-gradient-to-r from-primary-500 to-accent-blue bg-clip-text text-transparent">
            NEXUS
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/auctions"
            className="text-gray-300 hover:text-primary-500 transition-colors"
          >
            옥션
          </Link>
          <Link
            href="/matches"
            className="text-gray-300 hover:text-primary-500 transition-colors"
          >
            경기
          </Link>
          <Link
            href="/dashboard"
            className="text-gray-300 hover:text-primary-500 transition-colors"
          >
            대시보드
          </Link>
          <AuthButton />
        </div>
      </nav>
    </header>
  );
}
