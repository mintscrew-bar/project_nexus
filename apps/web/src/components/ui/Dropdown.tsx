'use client';

import React, { useId, useState, useRef, useEffect } from 'react';
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
  trigger: React.ReactElement;
  items: DropdownItem[];
  align?: 'left' | 'right';
  className?: string;
}

export function Dropdown({ trigger, items, align = 'left', className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const initialFocusIndexRef = useRef(0);
  const menuId = useId();

  const focusItem = (index: number) => {
    const enabledItems = itemRefs.current.filter(
      (item): item is HTMLButtonElement => !!item && !item.disabled,
    );
    if (enabledItems.length === 0) return;
    enabledItems[(index + enabledItems.length) % enabledItems.length]?.focus();
  };

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

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => focusItem(initialFocusIndexRef.current));
  }, [open]);

  const triggerProps = trigger.props as Record<string, unknown>;
  const enhancedTrigger = React.cloneElement(trigger as React.ReactElement<any>, {
    ref: triggerRef,
    id: `${menuId}-trigger`,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      (triggerProps.onClick as ((event: React.MouseEvent<HTMLElement>) => void) | undefined)?.(event);
      if (!event.defaultPrevented) {
        initialFocusIndexRef.current = 0;
        setOpen((current) => !current);
      }
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      (triggerProps.onKeyDown as ((event: React.KeyboardEvent<HTMLElement>) => void) | undefined)?.(event);
      if (event.defaultPrevented) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        initialFocusIndexRef.current = event.key === 'ArrowDown' ? 0 : -1;
        setOpen(true);
      }
    },
  });

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const enabledItems = itemRefs.current.filter(
      (item): item is HTMLButtonElement => !!item && !item.disabled,
    );
    const currentIndex = enabledItems.indexOf(document.activeElement as HTMLButtonElement);

    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusItem(currentIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusItem(currentIndex - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusItem(-1);
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className={cn('relative inline-block', className)}>
      {enhancedTrigger}

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-labelledby={`${menuId}-trigger`}
          onKeyDown={handleMenuKeyDown}
          className={cn(
            'absolute z-50 mt-1 min-w-[10rem] py-1 bg-bg-elevated border border-bg-tertiary rounded-lg shadow-xl animate-in fade-in duration-150',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, index) => (
            <button
              key={item.key}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
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
                requestAnimationFrame(() => triggerRef.current?.focus());
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
