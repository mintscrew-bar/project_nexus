"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// 기존 /dashboard URL 호환성을 위해 / 로 리다이렉트
export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return null;
}
