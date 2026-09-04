"use client";

import { useEffect, useState } from "react";
import { Gamepad2 } from "lucide-react";
import { PUBG_PLATFORM_LABELS } from "@nexus/types";
import { pubgApi, type PubgHistoryResponse } from "@/lib/api-client";
import { PubgMatchHistory } from "./PubgMatchHistory";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@/components/ui";

interface PubgAccountSummary {
  id: string;
  playerName: string;
  lastMatchShard: "STEAM" | "KAKAO" | null;
  isPrimary: boolean;
  pubgTier: string | null;
  nexusTier: string | null;
  nexusScore: number | null;
}

/**
 * 프로필의 배그 탭.
 *
 * 롤 티어·라인·챔피언은 여기 오지 않는다. 공식 PUBG 랭크와 NEXUS 편성 등급은
 * 서로 다른 값이라 라벨을 갈라 적는다 — 같이 붙여두면 공식 랭크로 오해한다.
 */
export function PubgProfileSection({
  userId,
  accounts,
}: {
  userId: string;
  accounts: PubgAccountSummary[];
}) {
  const [history, setHistory] = useState<PubgHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await pubgApi.getHistory(userId);
        if (!cancelled) setHistory(data);
      } catch {
        // 전적을 못 불러와도 계정 카드는 보여준다.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>PUBG 계정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {accounts.length === 0 ? (
            <p className="text-sm text-text-tertiary">
              등록된 계정이 없습니다.
            </p>
          ) : (
            accounts.map((account) => (
              <div
                key={account.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-bg-tertiary/50 px-3 py-2.5"
              >
                <span className="flex items-center gap-2 font-semibold text-text-primary">
                  <Gamepad2 className="h-4 w-4 text-accent-primary" />
                  {account.playerName}
                  {account.isPrimary && (
                    <Badge variant="secondary">대표</Badge>
                  )}
                </span>
                <span className="flex items-center gap-2 text-xs text-text-secondary">
                  <span>
                    {account.lastMatchShard
                      ? PUBG_PLATFORM_LABELS[account.lastMatchShard].short
                      : "플랫폼 미확인"}
                  </span>
                  {/* 공식 랭크와 NEXUS 편성 등급은 다른 값이다. 라벨을 갈라 적는다. */}
                  {account.pubgTier && (
                    <Badge variant="secondary">공식 {account.pubgTier}</Badge>
                  )}
                  {account.nexusTier && (
                    <Badge variant="primary">
                      NEXUS {account.nexusTier}티어
                    </Badge>
                  )}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        history && <PubgMatchHistory history={history} />
      )}
    </div>
  );
}
