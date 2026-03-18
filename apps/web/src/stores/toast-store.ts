import { create } from "zustand";

// 토스트 알림 전역 스토어
// React Context 없이 어디서든 (스토어, 유틸 등) 토스트를 호출할 수 있음

type ToastVariant = "success" | "error" | "warning" | "info";

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
    const id = Math.random().toString(36).slice(2);
    set((state) => ({
      toasts: [...state.toasts, { id, message, variant, duration }],
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
  info: (message: string) =>
    useToastStore.getState().addToast(message, "info"),
};
