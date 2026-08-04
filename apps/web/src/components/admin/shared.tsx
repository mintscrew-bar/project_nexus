"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent, Button } from "@/components/ui";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

/** 관리자 탭들이 공통으로 넘겨받는 토스트 함수 시그니처 */
export type AddToast = (msg: string, type: "success" | "error") => void;

/** 제재 사유 프리셋 — 유저 관리/신고 관리에서 공유한다. */
export const BAN_REASONS = [
  { value: "욕설/비매너", label: "욕설/비매너" },
  { value: "의도적 게임 방해", label: "의도적 게임 방해" },
  { value: "핵/치팅 사용", label: "핵/치팅 사용" },
  { value: "잠수/이탈 반복", label: "잠수/이탈 반복" },
  { value: "부적절한 닉네임/콘텐츠", label: "부적절한 닉네임/콘텐츠" },
  { value: "스팸/도배", label: "스팸/도배" },
  { value: "OTHER", label: "직접 입력" },
] as const;

export function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <Card className="p-0">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="text-accent-primary flex-shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="text-text-muted text-xs truncate">{label}</p>
          <p className="text-xl font-bold text-text-primary">
            {value.toLocaleString()}
          </p>
          {sub && <p className="text-[10px] text-text-muted truncate">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 py-4">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm text-text-secondary">
        {page} / {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  size = "md",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: "md" | "lg";
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div
        className={cn(
          "max-h-[90vh] w-full overflow-y-auto rounded-xl border border-bg-tertiary bg-bg-secondary",
          size === "lg" ? "max-w-3xl" : "max-w-md",
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-bg-tertiary">
          <h3 className="font-semibold text-text-primary">{title}</h3>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
