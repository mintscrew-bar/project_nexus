'use client';

import { cn } from '@/lib/utils';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LucideIcon } from 'lucide-react';

interface SidebarLinkProps {
  href: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}

export function SidebarLink({ href, icon: Icon, children, className }: SidebarLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200',
        isActive
          ? 'bg-accent-primary/10 text-accent-primary border-l-2 border-accent-primary'
          : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary',
        className
      )}
    >
      {Icon && <Icon className="h-5 w-5" />}
      <span className="font-medium">{children}</span>
    </Link>
  );
}
