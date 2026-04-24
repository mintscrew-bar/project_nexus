"use client";

import { Badge } from "@/components/ui";

/** 스냅샷/실시간 데이터 출처 표시 배지 */
export function LabSourceBadge({ source }: { source?: "snapshot" | "realtime" }) {
  if (!source) return null;
  return source === "snapshot" ? (
    <Badge variant="success" size="sm">스냅샷</Badge>
  ) : (
    <Badge variant="warning" size="sm">실시간 집계</Badge>
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
