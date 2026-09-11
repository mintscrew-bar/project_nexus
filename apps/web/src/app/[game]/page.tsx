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

  return <div className="container mx-auto flex w-full max-w-[1480px] flex-1 animate-fade-in p-4 md:p-6 lg:py-8"><ErrorBoundary><DashboardContent gameTitle={title} /></ErrorBoundary></div>;
}
