'use client';

import { LayoutDashboard, Users, Settings } from 'lucide-react';
import { SidebarLink } from '@/components/SidebarLink';

const sidebarItems = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/friends', label: '친구', icon: Users },
  { href: '/settings', label: '설정', icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="w-64 bg-bg-secondary border-r border-bg-tertiary p-4 hidden md:block flex-shrink-0">
      <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-4 px-3">
        내 계정
      </h2>
      <nav className="space-y-1">
        {sidebarItems.map((item) => (
          <SidebarLink key={item.href} href={item.href} icon={item.icon}>
            {item.label}
          </SidebarLink>
        ))}
      </nav>
    </aside>
  );
}
