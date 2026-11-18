"use client";

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { userApi } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { useToast } from "@/components/ui/Toast";
import { useIsClient } from "@/hooks/useIsClient";

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
  // 브라우저에서 그리는 중인가 — 효과로 세우지 않고 useIsClient(useSyncExternalStore)로 안다
  const mounted = useIsClient();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const { addToast } = useToast();


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
