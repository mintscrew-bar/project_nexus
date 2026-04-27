import { Suspense } from "react";
import { LoadingSpinner } from "@/components/ui";
import LabLayoutClient from "./_components/LabLayoutClient";

// /lab/* 전체를 동적 렌더링으로 고정 — 관리자 전용 실시간 데이터 기반
export const dynamic = "force-dynamic";

export default function LabLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <LoadingSpinner />
        </div>
      }
    >
      <LabLayoutClient>{children}</LabLayoutClient>
    </Suspense>
  );
}
