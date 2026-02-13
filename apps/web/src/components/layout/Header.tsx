'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserMenu } from '@/components/UserMenu';
import { MobileMenu } from '@/components/MobileMenu';
import { Users } from 'lucide-react';
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
  const { isAuthenticated } = useAuthStore();
  const { togglePanel, isOpen, pendingRequests } = useFriendStore();
  const incomingCount = pendingRequests.filter((r: any) => r.status === 'PENDING').length;

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
        {isAuthenticated && (
          <button
            onClick={togglePanel}
            className={cn(
              'relative p-2 rounded-lg transition-colors duration-150',
              isOpen
                ? 'bg-accent-primary/10 text-accent-primary'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
            )}
            title="친구 목록"
          >
            <Users className="h-5 w-5" />
            {incomingCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center bg-accent-danger text-white text-[9px] font-bold rounded-full">
                {incomingCount}
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
