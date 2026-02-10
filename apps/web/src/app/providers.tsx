"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode, useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { RiotAccountChecker } from "@/components/RiotAccountChecker";
import { ToastProvider } from "@/components/ui/Toast";
import { KeyboardShortcutsProvider } from "@/components/KeyboardShortcuts";

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
      })
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <KeyboardShortcutsProvider>
            <AuthInitializer>
              <RiotAccountChecker>{children}</RiotAccountChecker>
            </AuthInitializer>
          </KeyboardShortcutsProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
