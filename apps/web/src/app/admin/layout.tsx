"use client";

import { useEffect } from "react";
import { notFound } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { LoadingSpinner } from "@/components/ui";

/**
 * /admin 및 모든 하위 라우트에 대한 권한 가드.
 *
 * - 미인증: 404 (admin 존재 자체를 cloak)
 * - USER 권한: 404
 * - ADMIN / MODERATOR: 통과
 *
 * 백엔드 API는 RolesGuard로 별도 보호되므로 이 가드는 UI 차단 용도.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuthStore();

  const hasAdminAccess = user?.role === "ADMIN" || user?.role === "MODERATOR";

  useEffect(() => {
    // 인증 초기화가 끝났는데 권한이 없으면 404 페이지로 cloak
    if (!isLoading && (!isAuthenticated || !hasAdminAccess)) {
      notFound();
    }
  }, [isLoading, isAuthenticated, hasAdminAccess]);

  // 인증 초기화 중에는 admin 콘텐츠를 렌더링하지 않음 (role 정보 도착 전 누출 방지)
  if (isLoading || !isAuthenticated || !hasAdminAccess) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return <>{children}</>;
}
