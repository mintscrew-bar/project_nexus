"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Dashboard is now integrated into Profile page
// This page redirects to /profile for backwards compatibility
export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    // Defer navigation to next tick to avoid render-phase state updates
    const timeoutId = setTimeout(() => {
      router.replace("/profile");
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [router]);

  return null;
}
