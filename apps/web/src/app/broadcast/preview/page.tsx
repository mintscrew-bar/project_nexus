"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import { LoadingSpinner } from "@/components/ui";
import { useAuthStore } from "@/stores/auth-store";
import { PreviewStage, SCENES } from "./_mocks";

/**
 * /broadcast/preview — 방송 오버레이 디자인 확인용 목업 프리뷰(백엔드 불필요).
 * 실제 씬 컴포넌트를 목 스냅샷으로 렌더한다. 배포/OBS와 무관한 개발 편의 페이지.
 * 목업 데이터와 장면 그리기는 _mocks.tsx (방송 설정 화면 미리보기와 공유).
 */

export default function BroadcastPreviewPage() {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const isProduction = process.env.NODE_ENV === "production";
  const hasPreviewAccess = user?.role === "ADMIN" || user?.role === "MODERATOR";

  const [sceneKey, setSceneKey] = useState("auction");
  const [bg, setBg] = useState<"transparent" | "opaque">("opaque");

  if (isProduction && isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <LoadingSpinner />
      </div>
    );
  }

  if (isProduction && (!isAuthenticated || !hasPreviewAccess)) {
    notFound();
  }

  return (
    <div className="fixed inset-0 bg-neutral-900">
      {/* 컨트롤 바 (프리뷰 전용, OBS엔 없음) */}
      <div className="pointer-events-auto fixed left-3 top-3 z-50 flex flex-wrap items-center gap-2 rounded-xl bg-black/80 p-2 text-sm text-white shadow-lg">
        {SCENES.map((s) => (
          <button
            key={s.key}
            onClick={() => setSceneKey(s.key)}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              sceneKey === s.key
                ? "bg-violet-500 text-white"
                : "bg-white/10 text-white/70 hover:bg-white/20"
            }`}
          >
            {s.label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-white/20" />
        <button
          onClick={() =>
            setBg((b) => (b === "opaque" ? "transparent" : "opaque"))
          }
          className="rounded-lg bg-white/10 px-3 py-1.5 font-medium text-white/70 hover:bg-white/20"
        >
          배경: {bg === "opaque" ? "풀씬" : "투명(체커)"}
        </button>
      </div>

      {/* 투명 배경일 때 실제 합성 느낌을 주는 체커보드 */}
      {bg === "transparent" && (
        <div
          className="fixed inset-0"
          style={{
            backgroundImage:
              "linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%)",
            backgroundSize: "40px 40px",
            backgroundPosition: "0 0, 0 20px, 20px -20px, -20px 0px",
          }}
        />
      )}

      <PreviewStage sceneKey={sceneKey} bg={bg} />
    </div>
  );
}
