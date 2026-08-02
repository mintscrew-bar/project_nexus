'use client';

import { cn } from '@/lib/utils';
import { createContext, useContext, useId, useState, ReactNode, KeyboardEvent } from 'react';

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (value: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | undefined>(undefined);

function useTabs() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('Tabs components must be used within a Tabs provider');
  }
  return context;
}

interface TabsProps {
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
}

export function Tabs({
  defaultValue,
  value,
  onValueChange,
  children,
  className,
}: TabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const baseId = useId();

  const activeTab = value ?? internalValue;
  const setActiveTab = (newValue: string) => {
    if (!value) {
      setInternalValue(newValue);
    }
    onValueChange?.(newValue);
  };

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab, baseId }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

interface TabsListProps {
  children: ReactNode;
  className?: string;
}

export function TabsList({ children, className }: TabsListProps) {
  return (
    <div
      className={cn(
        'scrollbar-none flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl p-1.5',
        'border border-bg-elevated bg-bg-tertiary',
        className
      )}
      role="tablist"
    >
      {children}
    </div>
  );
}

interface TabsTriggerProps {
  value: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}

export function TabsTrigger({
  value,
  children,
  className,
  disabled = false,
}: TabsTriggerProps) {
  const { activeTab, setActiveTab, baseId } = useTabs();
  const isActive = activeTab === value;

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

    const tabs = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)') ?? []
    );
    const currentIndex = tabs.indexOf(event.currentTarget);
    if (currentIndex < 0 || tabs.length === 0) return;

    event.preventDefault();
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[nextIndex]?.focus();
    tabs[nextIndex]?.click();
  };

  return (
    <button
      role="tab"
      id={`${baseId}-tab-${value}`}
      aria-selected={isActive}
      aria-controls={`${baseId}-panel-${value}`}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      className={cn(
        'relative isolate shrink-0 overflow-hidden rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary',
        isActive
          ? 'border border-accent-primary/30 bg-bg-secondary text-accent-primary shadow-sm'
          : 'border border-transparent text-text-secondary hover:-translate-y-px hover:border-bg-elevated hover:bg-bg-elevated/60 hover:text-text-primary',
        disabled && 'cursor-not-allowed opacity-40 hover:translate-y-0',
        className
      )}
      onClick={() => !disabled && setActiveTab(value)}
      onKeyDown={handleKeyDown}
    >
      {children}
    </button>
  );
}

interface TabsContentProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function TabsContent({ value, children, className }: TabsContentProps) {
  const { activeTab, baseId } = useTabs();

  if (activeTab !== value) return null;

  return (
    <div
      id={`${baseId}-panel-${value}`}
      role="tabpanel"
      aria-labelledby={`${baseId}-tab-${value}`}
      tabIndex={0}
      className={cn('animate-fade-in focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50', className)}
    >
      {children}
    </div>
  );
}
