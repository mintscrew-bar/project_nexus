'use client';

import { cn } from '@/lib/utils';
import { X, Menu, Home, Swords, Trophy, Users, MessageSquare, Settings, LayoutDashboard } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Logo } from './Logo';

interface MobileMenuProps {
  className?: string;
}

export function MobileMenu({ className }: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  // Close menu on route change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Lock body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const navItems = [
    { href: '/', label: '홈', icon: Home },
    { href: '/tournaments', label: '내전', icon: Swords },
    { href: '/matches', label: '내전 전적', icon: Trophy },
    { href: '/clans', label: '클랜', icon: Users },
    { href: '/community', label: '커뮤니티', icon: MessageSquare },
  ];

  const sidebarItems = [
    { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
    { href: '/friends', label: '친구', icon: Users },
    { href: '/settings', label: '설정', icon: Settings },
  ];

  const isActive = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href));

  return (
    <div className={cn('md:hidden', className)}>
      {/* Menu Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
        aria-label="Open menu"
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
        className={cn(
          'fixed top-0 left-0 bottom-0 w-72 bg-bg-secondary border-r border-bg-tertiary z-50 transform transition-transform duration-300 ease-out',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-bg-tertiary">
          <Link href="/" className="flex items-center gap-2" onClick={() => setIsOpen(false)}>
            <Logo className="h-8 w-auto" />
            <span className="text-xl font-bold text-text-primary">Nexus</span>
          </Link>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-6">
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
        </nav>
      </div>
    </div>
  );
}
