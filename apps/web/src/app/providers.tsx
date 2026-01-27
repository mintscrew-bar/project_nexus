"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
<<<<<<< HEAD
import { useState, type ReactNode, useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";

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
=======
import { useState, type ReactNode } from "react";
>>>>>>> 3b553b2d94a3c353197231914982b5253fba61fc

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
<<<<<<< HEAD
      <QueryClientProvider client={queryClient}>
        <AuthInitializer>{children}</AuthInitializer>
      </QueryClientProvider>
=======
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
>>>>>>> 3b553b2d94a3c353197231914982b5253fba61fc
    </ThemeProvider>
  );
}
