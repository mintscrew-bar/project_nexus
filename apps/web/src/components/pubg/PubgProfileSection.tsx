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
  /** 등급이 어디서 나왔는지. NONE 은 "판단할 자료가 없다"는 뜻이다. */
  nexusTierSource?: "NONE" | "SELF" | "ADMIN" | "AUTO";
  balanceVersion?: number | null;
  balanceSampleSize?: number | null;
  balanceComputedAt?: string | null;
}

const TIER_SOURCE_LABEL: Record<string, string> = {
  SELF: "본인 입력",
  ADMIN: "운영자 지정",
  AUTO: "자동 산정",
};

/** 등급 아래 한 줄. 숫자만 두면 어디서 나온 값인지 알 수 없다. */
function tierFootnote(account: PubgAccountSummary): string | null {
  const source = account.nexusTierSource;
  if (!source || source === "NONE") return null;
  const parts = [TIER_SOURCE_LABEL[source] ?? source];
  if (source === "AUTO") {
    if (account.balanceSampleSize != null) {
      parts.push(`${account.balanceSampleSize}라운드 기준`);
    }
    if (account.balanceComputedAt) {
      const date = new Date(account.balanceComputedAt);
      parts.push(`${date.getMonth() + 1}/${date.getDate()} 산정`);
    }
    if (account.balanceVersion != null) {
      parts.push(`v${account.balanceVersion}`);
    }
  }
  return parts.join(" · ");
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
                  {account.nexusTier ? (
                    <Badge variant="primary">
                      NEXUS {account.nexusTier}티어
                    </Badge>
                  ) : (
                    // 등급 없음과 최하위 등급은 다르다. 그대로 적는다.
                    <Badge variant="secondary">등급 산정 전</Badge>
                  )}
                </span>
                {tierFootnote(account) && (
                  <p className="w-full text-[11px] text-text-tertiary">
                    {tierFootnote(account)}
                  </p>
                )}
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
