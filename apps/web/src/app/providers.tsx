"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode, useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { RiotAccountChecker } from "@/components/RiotAccountChecker";
import { ToastProvider } from "@/components/ui/Toast";
import { KeyboardShortcutsProvider } from "@/components/KeyboardShortcuts";
import { BgmPlayer } from "@/components/bgm/BgmPlayer";
import { useSfxStore } from "@/stores/sfx-store";

function SfxSettingsInitializer() {
  const hydrate = useSfxStore((state) => state.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return null;
}

function AuthInitializer({ children }: { children: ReactNode }) {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // Don't block rendering — auth state loads in background and pages react to it
  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <SfxSettingsInitializer />
          <KeyboardShortcutsProvider>
            <AuthInitializer>
              <RiotAccountChecker>{children}</RiotAccountChecker>
              {/* 배경음악. 최상위에 한 번만 둬야 화면을 옮겨도 곡이 이어진다. */}
              <BgmPlayer />
            </AuthInitializer>
          </KeyboardShortcutsProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
