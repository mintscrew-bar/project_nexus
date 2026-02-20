'use client';

import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

export interface DropdownItem {
  key: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
}

export interface DropdownProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: 'left' | 'right';
  className?: string;
}

export function Dropdown({ trigger, items, align = 'left', className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open]);

  return (
    <div ref={ref} className={cn('relative inline-block', className)}>
      <div onClick={() => setOpen(!open)} className="cursor-pointer">
        {trigger}
      </div>

      {open && (
        <div
          className={cn(
            'absolute z-50 mt-1 min-w-[10rem] py-1 bg-bg-elevated border border-bg-tertiary rounded-lg shadow-xl animate-in fade-in duration-150',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item) => (
            <button
              key={item.key}
              disabled={item.disabled}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors duration-100',
                item.disabled
                  ? 'opacity-40 cursor-not-allowed'
                  : item.danger
                    ? 'text-accent-danger hover:bg-accent-danger/10'
                    : 'text-text-primary hover:bg-bg-tertiary',
              )}
              onClick={() => {
                item.onClick?.();
                setOpen(false);
              }}
            >
              {item.icon && <span className="w-4 h-4 flex-shrink-0">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export interface DropdownMenuButtonProps {
  label: string;
  items: DropdownItem[];
  align?: 'left' | 'right';
  className?: string;
}

export function DropdownMenuButton({ label, items, align = 'left', className }: DropdownMenuButtonProps) {
  return (
    <Dropdown
      align={align}
      items={items}
      trigger={
        <button
          className={cn(
            'flex items-center gap-1 px-4 py-2 bg-bg-tertiary hover:bg-bg-elevated text-text-primary font-medium rounded-lg border border-text-muted transition-colors duration-150',
            className,
          )}
        >
          {label}
          <ChevronDown className="h-4 w-4 text-text-tertiary" />
        </button>
      }
    />
  );
}
