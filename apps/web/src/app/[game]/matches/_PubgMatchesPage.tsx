"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { PUBG_PLATFORM_LABELS } from "@nexus/types";
import { pubgApi, userApi, type PubgHistoryResponse } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import { useGamePrefix } from "@/hooks/useCurrentGame";
import { PubgMatchHistory } from "@/components/pubg/PubgMatchHistory";
import { PubgPlayerSearch } from "@/components/pubg/PubgPlayerSearch";
import {
  Avatar,
  Button,
  Card,
  CardContent,
  LoadingSpinner,
} from "@/components/ui";

/** 보고 있는 사람의 헤더에 쓰는 정보 */
interface TargetInfo {
  username: string;
  avatar: string | null;
  playerName: string | null;
  platform: "STEAM" | "KAKAO" | null;
}

type LoadState = "loading" | "ready" | "hidden" | "failed";

/**
 * 배그 내전 전적.
 *
 * 롤 전적은 소환사 검색이 중심이지만 배그는 PUBG API 로 남의 내전 기록을 찾아올 방법이 없어서
 * Nexus 안에서 치른 스크림·킬내기만 남는다. 기본은 본인 기록이고, 검색으로 다른 유저를 고르면
 * `?user=<id>` 로 그 사람의 기록을 본다(공유 가능한 주소). 로그인한 사용자만 볼 수 있다.
 * 상대가 전적을 공개하지 않으면 서버가 403 을 준다.
 */
export function PubgMatchesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const gamePrefix = useGamePrefix();
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();

  const requested = searchParams.get("user");
  const targetUserId = requested || user?.id || null;
  const isSelf = !!user && targetUserId === user.id;

  const [history, setHistory] = useState<PubgHistoryResponse | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [target, setTarget] = useState<TargetInfo | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !user) {
      // 돌아올 주소에 ?user= 도 실어서 공유받은 링크가 로그인 뒤에도 그 사람의 기록을 연다.
      const back = `${pathname}${searchParams.toString() ? `?${searchParams}` : ""}`;
      router.push(`/auth/login?redirect=${encodeURIComponent(back)}`);
    }
  }, [authLoading, isAuthenticated, user, router, pathname, searchParams]);

  useEffect(() => {
    if (authLoading || !isAuthenticated || !targetUserId) return;
    let cancelled = false;
    setState("loading");
    setHistory(null);
    void (async () => {
      try {
        const data = await pubgApi.getHistory(targetUserId);
        if (cancelled) return;
        setHistory(data);
        setState("ready");
      } catch (error: any) {
        if (cancelled) return;
        // 403 은 상대가 공개하지 않은 것이고, 나머지는 실패다.
        setState(error?.response?.status === 403 ? "hidden" : "failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, targetUserId]);

  // 다른 사람을 보고 있을 때만 그 사람의 이름·계정을 가져온다.
  useEffect(() => {
    if (!requested || isSelf) {
      setTarget(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const profile = await userApi.getHoverProfile(requested, "PUBG");
        if (cancelled) return;
        setTarget({
          username: profile.username,
          avatar: profile.avatar,
          playerName: profile.pubgAccount?.playerName ?? null,
          platform: profile.pubgAccount?.lastMatchShard ?? null,
        });
      } catch {
        if (!cancelled) setTarget(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requested, isSelf]);

  if (authLoading || !isAuthenticated || !user) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <LoadingSpinner />
      </div>
    );
  }

  const select = (userId: string) =>
    router.push(
      userId === user.id
        ? `${gamePrefix}/matches`
        : `${gamePrefix}/matches?user=${encodeURIComponent(userId)}`,
    );

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

        <PubgPlayerSearch onSelect={(result) => select(result.userId)} />

        {!isSelf && requested && (
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar
                  src={target?.avatar}
                  alt={target?.username ?? "유저"}
                  fallback={target?.username?.[0] ?? "?"}
                  size="lg"
                />
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold text-text-primary">
                    {target ? `${target.username}님의 내전 기록` : "내전 기록"}
                  </p>
                  {target?.playerName && (
                    <p className="truncate text-xs text-text-secondary">
                      {target.platform
                        ? `${PUBG_PLATFORM_LABELS[target.platform].short} · `
                        : ""}
                      {target.playerName}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Link href={`/users/${requested}?game=pubg`}>
                  <Button variant="outline" size="sm">
                    프로필
                  </Button>
                </Link>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => router.push(`${gamePrefix}/matches`)}
                >
                  <ArrowLeft className="mr-1.5 h-4 w-4" />내 기록
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {state === "loading" && (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {state === "hidden" && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Lock className="h-6 w-6 text-text-tertiary" aria-hidden />
              <p className="text-sm font-semibold text-text-primary">
                이 유저는 내전 전적을 공개하지 않습니다
              </p>
            </CardContent>
          </Card>
        )}

        {state === "failed" && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-accent-danger">
              전적을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
            </CardContent>
          </Card>
        )}

        {state === "ready" && history && <PubgMatchHistory history={history} />}
      </div>
    </div>
  );
}
