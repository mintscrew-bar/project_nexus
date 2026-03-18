'use client';

import { cn } from '@/lib/utils';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useToastStore } from '@/stores/toast-store';

type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
}

// 기존 useToast() 호환성 유지 — 내부적으로 toast-store 사용
export function useToast() {
  const { toasts, addToast, removeToast } = useToastStore();
  return { toasts, addToast, removeToast };
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ToastContainer />
    </>
  );
}

function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (typeof window === 'undefined' || toasts.length === 0) return null;

  return createPortal(
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>,
    document.body
  );
}

interface ToastItemProps {
  toast: Toast;
  onClose: () => void;
}

function ToastItem({ toast, onClose }: ToastItemProps) {
  const icons = {
    success: CheckCircle,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
  };

  const styles = {
    success: 'border-accent-success/50 bg-accent-success/10',
    error: 'border-accent-danger/50 bg-accent-danger/10',
    warning: 'border-accent-warning/50 bg-accent-warning/10',
    info: 'border-accent-primary/50 bg-accent-primary/10',
  };

  const iconColors = {
    success: 'text-accent-success',
    error: 'text-accent-danger',
    warning: 'text-accent-warning',
    info: 'text-accent-primary',
  };

  const Icon = icons[toast.variant];

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border backdrop-blur-sm animate-slide-in',
        styles[toast.variant]
      )}
      role="alert"
    >
      <Icon className={cn('h-5 w-5 flex-shrink-0', iconColors[toast.variant])} />
      <p className="text-sm text-text-primary flex-1">{toast.message}</p>
      <button
        onClick={onClose}
        className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
