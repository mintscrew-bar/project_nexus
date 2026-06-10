"use client";

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { userApi } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { useToast } from "@/components/ui/Toast";

const THEME_STORAGE_KEY = "theme";

export type PersistedTheme = "dark" | "light" | "system";

export function isPersistedTheme(value: string | undefined | null): value is PersistedTheme {
  return value === "dark" || value === "light" || value === "system";
}

export function getStoredThemePreference(): PersistedTheme | null {
  if (typeof window === "undefined") return null;

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isPersistedTheme(storedTheme) ? storedTheme : null;
  } catch {
    return null;
  }
}

export function usePersistentTheme() {
  const [mounted, setMounted] = useState(false);
  const { theme, resolvedTheme, setTheme } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const { addToast } = useToast();

  useEffect(() => {
    setMounted(true);
  }, []);

  const applyTheme = useCallback(
    (nextTheme: PersistedTheme) => {
      const previousTheme = isPersistedTheme(theme) ? theme : undefined;
      setTheme(nextTheme);

      if (!isAuthenticated) return;

      void userApi.updateSettings({ theme: nextTheme }).catch((error) => {
        console.error("Theme update error:", error);
        if (previousTheme) {
          setTheme(previousTheme);
        }
        addToast("테마 저장에 실패했습니다.", "error");
      });
    },
    [addToast, isAuthenticated, setTheme, theme],
  );

  const toggleTheme = useCallback(() => {
    applyTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [applyTheme, resolvedTheme]);

  return {
    mounted,
    resolvedTheme,
    applyTheme,
    toggleTheme,
  };
}
