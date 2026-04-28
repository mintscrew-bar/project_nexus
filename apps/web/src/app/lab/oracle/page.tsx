"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { useLabStore } from "@/stores/lab-store";
import { labQueryOptions, type AuctionEfficiencyResponse } from "@/lib/lab-queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, LoadingSpinner } from "@/components/ui";
import { LabEmptyState } from "@/components/lab/shared/LabEmptyState";
import { OracleSubNav } from "@/components/lab/oracle/OracleSubNav";
import { AuctionEfficiencyCard } from "@/components/lab/oracle/AuctionEfficiencyCard";

export default function LabOracleAuctionPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { period: activePeriod } = useLabStore();
  const canFetch = !authLoading && isAuthenticated;

  const { data: auctionData, isLoading: auctionLoading } = useQuery<AuctionEfficiencyResponse>({
    ...labQueryOptions.auctionEfficiency(activePeriod),
    enabled: canFetch,
  });

  if (auctionLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OracleSubNav />

      <Card className="border-white/10 bg-bg-secondary/80">
        <CardHeader>
          <CardTitle>경매 효율 분석</CardTitle>
          <CardDescription>경매가 대비 퍼포먼스를 산점도와 회귀선으로 시각화합니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {auctionData ? (
            auctionData.scatter.length === 0 ? (
              <LabEmptyState level="insufficient" section="경매 효율" />
            ) : (
              <AuctionEfficiencyCard data={auctionData} />
            )
          ) : (
            <LabEmptyState level="insufficient" section="경매 효율" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
