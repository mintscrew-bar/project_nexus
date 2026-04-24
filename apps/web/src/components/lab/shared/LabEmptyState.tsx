"use client";

import { FlaskConical } from "lucide-react";

type LabConfidenceLevel = "insufficient" | "low" | "moderate" | "high";

const MESSAGES: Record<LabConfidenceLevel, { title: string; desc: (section?: string) => string }> = {
  insufficient: {
    title: "아직 충분한 게임 데이터가 없어요",
    desc: (section) =>
      section
        ? `${section} 분석을 위한 데이터가 부족합니다. 내전이 더 진행되면 자동으로 활성화됩니다.`
        : "내전 데이터가 쌓이면 분석이 시작됩니다.",
  },
  low: {
    title: "데이터가 적어 참고용으로만 활용하세요",
    desc: (section) =>
      section
        ? `${section}의 표본이 5~14게임 수준입니다. 결과가 실제와 다를 수 있습니다.`
        : "표본이 적어 통계 신뢰도가 낮습니다.",
  },
  moderate: {
    title: "데이터를 수집 중입니다",
    desc: (section) =>
      section ? `${section} 데이터를 불러오는 중입니다.` : "잠시 후 다시 확인해 주세요.",
  },
  high: {
    title: "데이터를 불러오는 중입니다",
    desc: () => "잠시 후 다시 확인해 주세요.",
  },
};

export function LabEmptyState({
  level = "insufficient",
  section,
  className,
}: {
  level?: LabConfidenceLevel;
  section?: string;
  className?: string;
}) {
  const { title, desc } = MESSAGES[level];
  const textColor =
    level === "insufficient"
      ? "text-text-tertiary"
      : level === "low"
        ? "text-accent-warning"
        : "text-text-secondary";

  return (
    <div className={`flex flex-col items-center justify-center py-10 text-center ${className ?? ""}`}>
      <div className="mb-3 rounded-full bg-bg-tertiary p-4">
        <FlaskConical className={`h-7 w-7 ${textColor}`} />
      </div>
      <p className={`font-semibold ${textColor}`}>{title}</p>
      <p className="mt-1 max-w-xs text-xs text-text-tertiary">{desc(section)}</p>
    </div>
  );
}
