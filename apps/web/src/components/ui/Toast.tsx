"use client";

import { cn } from "@/lib/utils";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useToastStore } from "@/stores/toast-store";
import { useAuthStore } from "@/stores/auth-store";

type ToastVariant = "success" | "error" | "warning" | "info";

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
  const role = useAuthStore((state) => state.user?.role);
  const isStaff = role === "ADMIN" || role === "MODERATOR";

  if (typeof window === "undefined" || toasts.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none fixed left-1/2 top-4 z-[70] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={normalizeToastForViewer(toast, isStaff)}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>,
    document.body,
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
    success: "border-accent-success/35 before:bg-accent-success",
    error: "border-accent-danger/35 before:bg-accent-danger",
    warning: "border-accent-warning/35 before:bg-accent-warning",
    info: "border-accent-primary/35 before:bg-accent-primary",
  };

  const iconColors = {
    success: "text-accent-success",
    error: "text-accent-danger",
    warning: "text-accent-warning",
    info: "text-accent-primary",
  };

  const Icon = icons[toast.variant];
  const titles = {
    success: "완료",
    error: "오류",
    warning: "확인해 주세요",
    info: "안내",
  };

  return (
    <div
      className={cn(
        "pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-xl border bg-bg-secondary/95 p-4 pl-5 shadow-xl backdrop-blur-sm animate-slide-in before:absolute before:inset-y-0 before:left-0 before:w-1",
        styles[toast.variant],
      )}
      role={
        toast.variant === "error" || toast.variant === "warning"
          ? "alert"
          : "status"
      }
    >
      <Icon
        className={cn(
          "mt-0.5 h-5 w-5 flex-shrink-0",
          iconColors[toast.variant],
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text-primary">
          {titles[toast.variant]}
        </p>
        <p className="mt-0.5 text-sm leading-5 text-text-secondary">
          {toast.message}
        </p>
      </div>
      <button
        onClick={onClose}
        className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
        aria-label="알림 닫기"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** 일반 사용자에게 서버 원문이나 기술 오류를 노출하지 않는다. */
function normalizeToastForViewer(toast: Toast, isStaff: boolean): Toast {
  if (toast.variant !== "error" || isStaff) return toast;

  return {
    ...toast,
    variant: "warning",
    message: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  };
}
