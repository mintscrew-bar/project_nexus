import { create } from "zustand";
import { reportClientError } from "@/lib/client-error-reporting";

// 토스트 알림 전역 스토어
// React Context 없이 어디서든 (스토어, 유틸 등) 토스트를 호출할 수 있음

type ToastVariant = "success" | "error" | "warning" | "info";

const ACTIONABLE_MESSAGE =
  /(입력|선택|먼저|필요|이상이어야|이하여야|없습니다|권한|로그인|연동|확인|해주세요|해야 합니다|할 수 없|가능하지 않|이미|만료)/;

function normalizeVariant(
  message: string,
  variant: ToastVariant,
): ToastVariant {
  return variant === "error" && ACTIONABLE_MESSAGE.test(message)
    ? "warning"
    : variant;
}

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (
    message: string,
    variant?: ToastVariant,
    duration?: number,
  ) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  addToast: (message, variant = "info", duration = 5000) => {
    const normalizedVariant = normalizeVariant(message, variant);
    if (normalizedVariant === "error") reportClientError(message);
    const id = Math.random().toString(36).slice(2);
    set((state) => ({
      toasts: [
        ...state.toasts,
        { id, message, variant: normalizedVariant, duration },
      ],
    }));

    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));

// 스토어 외부에서 직접 호출 가능한 헬퍼
export const toast = {
  success: (message: string) =>
    useToastStore.getState().addToast(message, "success"),
  error: (message: string) =>
    useToastStore.getState().addToast(message, "error"),
  warning: (message: string) =>
    useToastStore.getState().addToast(message, "warning"),
  info: (message: string) => useToastStore.getState().addToast(message, "info"),
};
