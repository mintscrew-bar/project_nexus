'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserMenu } from '@/components/UserMenu';
import { MobileMenu } from '@/components/MobileMenu';
import { Users, Shield, FlaskConical } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useFriendStore } from '@/stores/friend-store';

const navItems = [
  { href: '/tournaments', label: '내전' },
  { href: '/matches', label: '내전 전적' },
  { href: '/clans', label: '클랜' },
  { href: '/community', label: '커뮤니티' },
];

export function Header() {
  const pathname = usePathname();
  const { isAuthenticated, user } = useAuthStore();
  const { togglePanel, isOpen, pendingRequests } = useFriendStore();
  const incomingCount = pendingRequests.filter((r: any) => r.status === 'PENDING').length;

  // ---------------------------------------------------------------
  // Hydration 불일치 방지:
  // Zustand persist(localStorage)와 auth 상태는 클라이언트에서만 확정된다.
  // 서버 렌더링 시점에는 isAuthenticated=false, isOpen=false로 고정된 빈 상태를
  // 렌더링해야 서버 HTML과 클라이언트 첫 렌더가 일치한다.
  // mounted=true가 되면 실제 클라이언트 상태로 전환하여 UI를 업데이트한다.
  // ---------------------------------------------------------------
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // 마운트 전(SSR/hydration 단계): 클라이언트 전용 상태를 참조하지 않도록
  // isAuthenticated/isOpen/incomingCount를 모두 기본값으로 처리
  const clientIsAuthenticated = mounted && isAuthenticated;
  const clientIsOpen = mounted && isOpen;
  const clientIncomingCount = mounted ? incomingCount : 0;
  const clientUser = mounted ? user : null;

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="bg-bg-secondary border-b border-bg-tertiary px-4 py-3 flex justify-between items-center z-50 sticky top-0">
      {/* Left: Logo + Mobile Menu */}
      <div className="flex items-center gap-2">
        <MobileMenu />
        <Link href="/" className="flex items-center">
          <Logo className="h-8 w-auto" />
        </Link>
      </div>

      {/* Center: Navigation (hidden on mobile) */}
      <nav className="flex-grow justify-center hidden md:flex">
        <ul className="flex space-x-1">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'px-4 py-2 rounded-lg font-medium transition-colors duration-150',
                  isActive(item.href)
                    ? 'bg-accent-primary/10 text-accent-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Right: Friends + Theme Toggle + Auth */}
      <div className="flex items-center gap-3">
        {/* 어드민/모더레이터 전용 링크: 마운트 후에만 표시하여 hydration 불일치 방지 */}
        {clientIsAuthenticated && (clientUser?.role === 'ADMIN' || clientUser?.role === 'MODERATOR') && (
          <>
            {clientUser?.role === 'ADMIN' && (
              <Link
                href="/simulation"
                className={cn(
                  'p-2 rounded-lg transition-colors duration-150',
                  pathname.startsWith('/simulation')
                    ? 'bg-accent-primary/10 text-accent-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
                )}
                title="시뮬레이션"
              >
                <FlaskConical className="h-5 w-5" />
              </Link>
            )}
            <Link
              href="/admin"
              className={cn(
                'p-2 rounded-lg transition-colors duration-150',
                pathname.startsWith('/admin')
                  ? 'bg-accent-primary/10 text-accent-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
              )}
              title="관리자 패널"
            >
              <Shield className="h-5 w-5" />
            </Link>
          </>
        )}
        {/* 친구 목록 버튼: 마운트 후에만 표시하여 뱃지 카운트 hydration 불일치 방지 */}
        {clientIsAuthenticated && (
          <button
            onClick={togglePanel}
            className={cn(
              'relative p-2 rounded-lg transition-colors duration-150',
              clientIsOpen
                ? 'bg-accent-primary/10 text-accent-primary'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
            )}
            title="친구 목록"
          >
            <Users className="h-5 w-5" />
            {clientIncomingCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center bg-accent-danger text-white text-[9px] font-bold rounded-full">
                {clientIncomingCount}
              </span>
            )}
          </button>
        )}
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
