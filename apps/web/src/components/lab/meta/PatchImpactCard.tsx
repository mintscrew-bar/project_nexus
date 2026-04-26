"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatDelta, formatPosition } from "@/lib/lab-format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import type { PatchImpactResponse } from "@/lib/lab-queries";

interface Props {
  patchImpact: PatchImpactResponse | undefined;
}

export function PatchImpactCard({ patchImpact }: Props) {
  return (
    <Card className="border-white/10 bg-bg-secondary/80">
      <CardHeader>
        <CardTitle>패치 임팩트</CardTitle>
        <CardDescription>
          {patchImpact?.currentPatch && patchImpact?.previousPatch
            ? `${patchImpact.previousPatch} → ${patchImpact.currentPatch} 기준 내전 양상 변화`
            : "패치 비교 데이터 준비 중"}
        </CardDescription>
        {patchImpact?.currentPatch && (
          <a
            href="https://www.leagueoflegends.com/ko-kr/news/tags/patch-notes/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-accent-info hover:text-accent-info/80"
          >
            라이엇 패치 노트
            <ArrowRight className="h-3 w-3" />
          </a>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {/* 수혜 챔피언 */}
          <div className="rounded-xl border border-white/10 bg-bg-primary/50 p-3">
            <p className="mb-2 text-xs font-semibold text-accent-success">수혜 TOP 5</p>
            <div className="space-y-1.5">
              {(patchImpact?.buffed ?? []).length === 0 ? (
                <p className="text-xs text-text-tertiary">데이터 없음</p>
              ) : (
                (patchImpact?.buffed ?? []).slice(0, 5).map((row) => (
                  <Link
                    key={`buff-${row.championId}`}
                    href={`/lab/champions/${row.championId}`}
                    className="flex items-center justify-between rounded text-xs text-text-secondary hover:text-text-primary"
                  >
                    <span>{row.championNameKorean}</span>
                    <span className="text-accent-success">{formatDelta(row.deltaWinRate)}</span>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* 피해 챔피언 */}
          <div className="rounded-xl border border-white/10 bg-bg-primary/50 p-3">
            <p className="mb-2 text-xs font-semibold text-accent-danger">피해 TOP 5</p>
            <div className="space-y-1.5">
              {(patchImpact?.nerfed ?? []).length === 0 ? (
                <p className="text-xs text-text-tertiary">데이터 없음</p>
              ) : (
                (patchImpact?.nerfed ?? []).slice(0, 5).map((row) => (
                  <Link
                    key={`nerf-${row.championId}`}
                    href={`/lab/champions/${row.championId}`}
                    className="flex items-center justify-between rounded text-xs text-text-secondary hover:text-text-primary"
                  >
                    <span>{row.championNameKorean}</span>
                    <span className="text-accent-danger">{formatDelta(row.deltaWinRate)}</span>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* 포지션 변화 */}
          <div className="rounded-xl border border-white/10 bg-bg-primary/50 p-3">
            <p className="mb-2 text-xs font-semibold text-accent-info">포지션 변화 TOP 3</p>
            <div className="space-y-1.5">
              {(patchImpact?.positionShifts ?? []).length === 0 ? (
                <p className="text-xs text-text-tertiary">데이터 없음</p>
              ) : (
                (patchImpact?.positionShifts ?? []).slice(0, 3).map((row) => (
                  <div key={`pos-${row.position}`} className="text-xs text-text-secondary">
                    <span className="font-medium text-text-primary">{formatPosition(row.position)}</span>
                    {" "}승률 {formatDelta(row.deltaWinRate)} · 픽률 {formatDelta(row.deltaPickRate, 2)}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 조합 변화 */}
          <div className="rounded-xl border border-white/10 bg-bg-primary/50 p-3">
            <p className="mb-2 text-xs font-semibold text-accent-purple">조합 변화 TOP 3</p>
            <div className="space-y-1.5">
              {(patchImpact?.compositionShifts ?? []).length === 0 ? (
                <p className="text-xs text-text-tertiary">데이터 없음</p>
              ) : (
                (patchImpact?.compositionShifts ?? []).slice(0, 3).map((row) => (
                  <div key={`comp-${row.type}`} className="text-xs text-text-secondary">
                    <span className="font-medium text-text-primary">{row.label}</span>
                    {" "}픽률 {formatDelta(row.deltaPickRate, 2)} · 승률 {formatDelta(row.deltaWinRate)}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-text-tertiary">
          표본: 현재 {patchImpact?.sample.currentGames ?? 0}경기 / 이전 {patchImpact?.sample.previousGames ?? 0}경기
        </p>
      </CardContent>
    </Card>
  );
}
