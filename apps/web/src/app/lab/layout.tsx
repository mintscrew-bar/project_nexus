import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingSpinner } from "@/components/ui";
import LabLayoutClient from "./_components/LabLayoutClient";

// /lab/* 전체를 동적 렌더링으로 고정 — 관리자 전용 실시간 데이터 기반
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "롤 전적 랩",
  description:
    "Nexus Lab에서 롤 내전 전적과 랭크 기록을 구분한 챔피언 통계, 패치 변화, 조합 분석, 장인 빌드를 확인하세요.",
  // 아직 비공개(보류) — 검색 색인 금지. 공개 시 이 robots 블록 제거.
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
  alternates: {
    canonical: "/lab",
  },
  openGraph: {
    title: "Nexus Lab - 롤 전적, 챔피언 통계와 장인 빌드",
    description:
      "내전과 랭크 데이터를 나눠 보고, 챔피언별 통계와 빌드 흐름을 비교하는 Nexus 실험실입니다.",
    url: "/lab",
  },
};

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
