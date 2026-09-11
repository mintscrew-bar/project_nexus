"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { pubgApi, type PubgHistoryResponse } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { PubgMatchHistory } from "@/components/pubg/PubgMatchHistory";
import { LoadingSpinner } from "@/components/ui";

/**
 * 배그 내전 전적.
 *
 * 롤 전적은 소환사 검색이 중심이지만 배그는 그 축이 없다 — PUBG API 로
 * 남의 내전 기록을 찾아올 방법이 없어서, Nexus 안에서 치른 스크림·킬내기만 남는다.
 * 그래서 우선 본인 기록을 보여준다.
 */
export function PubgMatchesPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const [history, setHistory] = useState<PubgHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !user) {
      router.push("/auth/login?redirect=/pubg/matches");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await pubgApi.getHistory(user.id);
        if (!cancelled) setHistory(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, user, router]);

  if (authLoading || loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="flex-grow px-5 py-8 sm:px-6 md:py-10 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <p className="text-sm font-semibold text-accent-primary">
            PUBG RECORDS
          </p>
          <h1 className="mt-1 text-2xl font-bold text-text-primary">
            배그 내전 전적
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Nexus에서 치른 배틀로얄 스크림과 킬내기 기록입니다. 인게임 일반
            전적은 포함되지 않습니다.
          </p>
        </header>

        {history && <PubgMatchHistory history={history} />}
      </div>
    </div>
  );
}
