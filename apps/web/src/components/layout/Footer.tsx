'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Footer() {
  const pathname = usePathname();

  if (pathname.startsWith('/matches')) {
    return null;
  }

  return (
    <footer className="bg-bg-secondary border-t border-bg-tertiary px-6 py-5">
      <div className="max-w-7xl mx-auto flex flex-col gap-3 text-sm text-text-tertiary">
        {/* 상단: 저작권 + 링크 */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>&copy; {new Date().getFullYear()} Project Nexus</p>
          <nav className="flex flex-wrap justify-center gap-x-4 gap-y-2 sm:justify-end">
            <Link href="/about" className="hover:text-text-secondary transition-colors duration-150">
              서비스 소개
            </Link>
            <Link href="/resources" className="hover:text-text-secondary transition-colors duration-150">
              자료실
            </Link>
            <Link href="/guide" className="hover:text-text-secondary transition-colors duration-150">
              이용 가이드
            </Link>
            <Link href="/community" className="hover:text-text-secondary transition-colors duration-150">
              커뮤니티
            </Link>
            <Link href="/privacy" className="hover:text-text-secondary transition-colors duration-150">
              개인정보처리방침
            </Link>
            <Link href="/terms" className="hover:text-text-secondary transition-colors duration-150">
              이용약관
            </Link>
          </nav>
        </div>

        {/* Riot Games Attribution — API 정책 필수 표기 */}
        <p className="text-xs text-text-tertiary/70 text-center sm:text-left leading-relaxed">
          Project Nexus isn&apos;t endorsed by Riot Games and doesn&apos;t reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. League of Legends and Riot Games are trademarks or registered trademarks of Riot Games, Inc.
        </p>
      </div>
    </footer>
  );
}
