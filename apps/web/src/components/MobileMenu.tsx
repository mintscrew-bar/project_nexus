'use client';

import { cn } from '@/lib/utils';
import { X, Menu, Home, Swords, Trophy, Users, Radio, MessageSquare, Settings, User, ExternalLink, Shield, Moon, Sun, BookOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { Logo } from './Logo';
import { DiscordIcon } from './icons/DiscordIcon';
import { NEXUS_DISCORD_INVITE_URL } from '@/lib/constants';
import { useAuthStore } from '@/stores/auth-store';
import { usePersistentTheme } from '@/hooks/usePersistentTheme';
import { acquireBodyScrollLock, releaseBodyScrollLock } from '@/lib/body-scroll-lock';

interface MobileMenuProps {
  className?: string;
}

export function MobileMenu({ className }: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { user, isAuthenticated } = useAuthStore();
  const { resolvedTheme, toggleTheme } = usePersistentTheme();
  const [mounted, setMounted] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const scrollLockOwnerRef = useRef(Symbol('mobile-menu'));
  const wasOpenRef = useRef(false);

  // 관리자/모더레이터 여부 (마운트 후에만 확정 → hydration 불일치 방지)
  const isStaff = mounted && (user?.role === 'ADMIN' || user?.role === 'MODERATOR');

  // Close menu on route change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Lock body scroll when menu is open
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const scrollLockOwner = scrollLockOwnerRef.current;
    if (isOpen) {
      wasOpenRef.current = true;
      acquireBodyScrollLock(scrollLockOwner);
      drawerRef.current?.querySelector<HTMLElement>('[data-mobile-menu-close]')?.focus();
    } else {
      releaseBodyScrollLock(scrollLockOwner);
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        menuButtonRef.current?.focus();
      }
    }
    return () => {
      releaseBodyScrollLock(scrollLockOwner);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const navItems = [
    { href: '/', label: '홈', icon: Home },
    { href: '/tournaments', label: '내전', icon: Swords },
    { href: '/matches', label: '내전 전적', icon: Trophy },
    { href: '/clans', label: '클랜', icon: Users },
    { href: '/streamers', label: '스트리머', icon: Radio },
    { href: '/community', label: '커뮤니티', icon: MessageSquare },
    { href: '/guide', label: '가이드', icon: BookOpen },
  ];

  const sidebarItems = [
    { href: '/profile', label: '마이페이지', icon: User },
    { href: '/ranking', label: '랭킹', icon: Trophy },
    { href: '/settings', label: '설정', icon: Settings },
  ];

  const isActive = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href));

  return (
    <div className={cn('nav:hidden', className)}>
      {/* Menu Button */}
      <button
        ref={menuButtonRef}
        onClick={() => setIsOpen(true)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
        aria-label="메뉴 열기"
        aria-expanded={isOpen}
      >
        <Menu className="h-6 w-6" />
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fade-in"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={cn(
          'fixed top-0 left-0 bottom-0 w-72 bg-bg-secondary border-r border-bg-tertiary z-50 flex flex-col transform transition-transform duration-300 ease-out',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        aria-hidden={!isOpen}
        role="dialog"
        aria-modal={isOpen ? true : undefined}
        aria-label="사이트 메뉴"
        inert={!isOpen}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-bg-tertiary flex-shrink-0">
          <Link href="/" className="flex items-center gap-2" onClick={() => setIsOpen(false)}>
            <Logo size="sm" variant="icon-only" />
            <span className="text-xl font-bold text-text-primary">Nexus</span>
          </Link>
          <button
            data-mobile-menu-close
            onClick={() => setIsOpen(false)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
            aria-label="메뉴 닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation — 내용이 화면보다 길 때 스크롤 */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-6">
          <div>
            <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2 px-3">
              메뉴
            </h3>
            <ul className="space-y-1">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                      isActive(item.href)
                        ? 'bg-accent-primary/10 text-accent-primary'
                        : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {mounted && isAuthenticated ? (
          <div>
            <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2 px-3">
              내 계정
            </h3>
            <ul className="space-y-1">
              {sidebarItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                      isActive(item.href)
                        ? 'bg-accent-primary/10 text-accent-primary'
                        : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          ) : mounted ? (
            <div>
              <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                내 계정
              </h3>
              <Link
                href="/auth/login"
                onClick={() => setIsOpen(false)}
                className="flex min-h-11 items-center gap-3 rounded-lg bg-accent-primary px-3 py-2.5 font-semibold text-white transition-colors hover:bg-accent-hover"
              >
                <User className="h-5 w-5" />
                Discord로 로그인
              </Link>
            </div>
          ) : null}

          <div>
            <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2 px-3">
              환경설정
            </h3>
            <ul className="space-y-1">
              {/* 테마 토글 — 헤더에서 모바일 한정으로 이곳으로 이동 */}
              {mounted && (
                <li>
                  <button
                    onClick={toggleTheme}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
                  >
                    <span className="flex items-center gap-3">
                      {resolvedTheme === 'dark' ? (
                        <Sun className="h-5 w-5" />
                      ) : (
                        <Moon className="h-5 w-5" />
                      )}
                      <span className="font-medium">
                        {resolvedTheme === 'dark' ? '라이트 모드' : '다크 모드'}
                      </span>
                    </span>
                  </button>
                </li>
              )}
              {/* 관리자 패널 — 관리자/모더레이터만 노출 (헤더에서 이동) */}
              {isStaff && (
                <li>
                  <Link
                    href="/admin"
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                      isActive('/admin')
                        ? 'bg-accent-primary/10 text-accent-primary'
                        : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
                    )}
                  >
                    <Shield className="h-5 w-5" />
                    <span className="font-medium">관리자 패널</span>
                  </Link>
                </li>
              )}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2 px-3">
              커뮤니티
            </h3>
            <a
              href={NEXUS_DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-lg border border-[#5865F2]/30 bg-[#5865F2]/10 px-3 py-3 font-medium text-[#5865F2] transition-colors hover:bg-[#5865F2]/20 dark:border-[#5865F2]/20 dark:text-[#C7D2FE]"
            >
              <span className="flex items-center gap-3">
                <DiscordIcon className="h-5 w-5" />
                <span className="font-medium">Discord 참가</span>
              </span>
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </nav>
      </div>
    </div>
  );
}
