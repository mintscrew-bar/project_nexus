"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode, useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { RiotAccountChecker } from "@/components/RiotAccountChecker";

function AuthInitializer({ children }: { children: ReactNode }) {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);
  const isLoading = useAuthStore((state) => state.isLoading);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // Optionally, show a loading spinner while auth state is being determined
  if (isLoading) {
    return <div>Loading...</div>; // Replace with a proper global spinner/loader
  }

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
        <AuthInitializer>
          <RiotAccountChecker>{children}</RiotAccountChecker>
        </AuthInitializer>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
