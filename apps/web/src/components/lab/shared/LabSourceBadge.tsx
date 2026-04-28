"use client";

import { Badge } from "@/components/ui";
import type { LabDataSource } from "@/lib/lab-queries";

/** 스냅샷/실시간 데이터 출처 표시 배지 */
export function LabSourceBadge({ source }: { source?: "snapshot" | "realtime" }) {
  if (!source) return null;
  return source === "snapshot" ? (
    <Badge variant="success" size="sm">스냅샷</Badge>
  ) : (
    <Badge variant="warning" size="sm">실시간 집계</Badge>
  );
}

export function LabDataSourceBadge({ source }: { source?: LabDataSource }) {
  if (!source) return null;
  if (source === "custom") return <Badge variant="success" size="sm">내전</Badge>;
  if (source === "ranked-community") return <Badge variant="primary" size="sm">랭크</Badge>;
  return <Badge variant="warning" size="sm">랭크 메타</Badge>;
}

export function LabConfidenceBadge({
  confidence,
  games,
}: {
  confidence?: "high" | "moderate" | "low" | "insufficient";
  games?: number;
}) {
  if (!confidence) return null;

  const label =
    confidence === "high"
      ? "신뢰 높음"
      : confidence === "moderate"
        ? "신뢰 보통"
        : confidence === "low"
          ? "신뢰 낮음"
          : "표본 부족";
  const variant =
    confidence === "high"
      ? "success"
      : confidence === "moderate"
        ? "primary"
        : confidence === "low"
          ? "warning"
          : "secondary";

  return (
    <Badge variant={variant} size="sm">
      {label}{typeof games === "number" ? ` · ${games}게임` : ""}
    </Badge>
  );
}

/** 밴 메타 출처 배지 */
export function BanMetaSourceBadge({
  source,
}: {
  source?: "custom" | "hybrid" | "ranked_only" | "none";
}) {
  if (!source || source === "none") return null;
  if (source === "custom") return <Badge variant="success" size="sm">내전 메타</Badge>;
  if (source === "hybrid") return <Badge variant="warning" size="sm">하이브리드 메타</Badge>;
  return <Badge variant="warning" size="sm">외부 랭크 메타</Badge>;
}
