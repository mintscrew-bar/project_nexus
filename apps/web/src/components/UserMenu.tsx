'use client';

import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { Avatar } from './ui/Avatar';
import { LogOut, User, Settings, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';

export function UserMenu() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isAuthenticated || !user) {
    return (
      <Link
        href="/auth/login"
        className="px-6 py-2.5 bg-accent-primary hover:bg-accent-hover active:bg-accent-active text-white font-medium rounded-lg transition-colors duration-150 text-sm"
      >
        로그인
      </Link>
    );
  }

  // user.avatar is already a full URL from the backend
  const avatarUrl = user.avatar || null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-bg-tertiary transition-colors"
      >
        <Avatar
          src={avatarUrl}
          fallback={user.username}
          size="sm"
          status="online"
        />
        <span className="text-text-primary font-medium hidden sm:block">
          {user.username}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-text-tertiary transition-transform duration-200 hidden sm:block',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-bg-secondary border border-bg-tertiary rounded-xl shadow-xl animate-scale-in origin-top-right overflow-hidden">
          <div className="p-3 border-b border-bg-tertiary">
            <p className="font-semibold text-text-primary">{user.username}</p>
            <p className="text-sm text-text-tertiary">{user.email || `#${user.discriminator}`}</p>
          </div>

          <div className="p-1">
            <Link
              href="/profile"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-3 py-2 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded-lg transition-colors"
            >
              <User className="h-4 w-4" />
              <span>프로필</span>
            </Link>
            <Link
              href="/settings"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-3 py-2 text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded-lg transition-colors"
            >
              <Settings className="h-4 w-4" />
              <span>설정</span>
            </Link>
          </div>

          <div className="p-1 border-t border-bg-tertiary">
            <button
              onClick={() => {
                setIsOpen(false);
                logout();
              }}
              className="flex items-center gap-3 px-3 py-2 w-full text-accent-danger hover:bg-accent-danger/10 rounded-lg transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span>로그아웃</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
