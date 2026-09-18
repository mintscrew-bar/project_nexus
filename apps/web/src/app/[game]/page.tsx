"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { ErrorBoundary, Skeleton } from "@/components/ui";
import { GAMES, gameFromSlug } from "@nexus/types";

const DashboardContent = dynamic(
  () => import("@/components/home/DashboardContent").then((mod) => mod.DashboardContent),
  { ssr: false, loading: () => <Skeleton className="h-[70vh] rounded-[28px]" /> },
);

export default function GameHome() {
  const { game } = useParams<{ game: string }>();
  const title = gameFromSlug(game);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);

  if (!title) return null;
  if (isLoading) return <div className="flex flex-1 p-4 md:p-6"><Skeleton className="h-[70vh] w-full rounded-[28px]" /></div>;
  if (!isAuthenticated) {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center p-6">
        <div className="card w-full max-w-md text-center">
          <h1 className="text-2xl font-bold">{GAMES[title].label} 홈</h1>
          <p className="mt-3 text-sm text-text-secondary">Discord 로그인 후 참가자·방·기록을 확인할 수 있습니다.</p>
          <Link href={`/auth/login?redirect=/${game}`} className="btn-primary mt-6 inline-flex">Discord로 로그인</Link>
        </div>
      </main>
    );
  }

    // 가로 flex 였을 때는 대시보드 본문이 flex 아이템이라 폭을 채우지 않고
  // 내용 크기(약 1224px)로 줄어든 뒤 왼쪽에 붙었다 — 틀은 가운데인데 내용만
  // 왼쪽으로 쏠려 보였다. 세로 방향이면 교차축 stretch 로 폭을 다 쓴다.
  return <div className="container mx-auto flex w-full max-w-[1480px] flex-1 flex-col animate-fade-in p-4 md:p-6 lg:py-8"><ErrorBoundary><DashboardContent gameTitle={title} /></ErrorBoundary></div>;
}
