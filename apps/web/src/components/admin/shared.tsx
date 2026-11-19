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

/** 숫자 카드 호버에 띄우는 한 줄 */
export interface StatDetail {
  label: string;
  value: string;
}

/** 지난 기간 대비 증감 — 위·아래·같음에 따라 색을 바꾼다 */
export interface StatDelta {
  /** 화면에 그대로 쓰는 글자(예: "+12%", "-3") */
  text: string;
  tone: "up" | "down" | "flat";
  /** 무엇과 비교했는지(예: "지난 7일 대비") */
  basis: string;
}

const DELTA_TONE: Record<StatDelta["tone"], string> = {
  up: "text-green-400",
  down: "text-red-400",
  flat: "text-text-muted",
};

/**
 * 지난 기간 대비 증감을 만든다. 지난 값이 0 이면 비율 대신 차이를 쓴다.
 * 값이 없으면(기록 전) null.
 */
export function makeDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
  basis: string,
): StatDelta | null {
  if (current == null || previous == null) return null;
  const diff = current - previous;
  const tone = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  const text =
    previous === 0
      ? `${diff > 0 ? "+" : ""}${diff.toLocaleString()}`
      : `${diff > 0 ? "+" : ""}${Math.round((diff / previous) * 100)}%`;
  return { text, tone, basis };
}

/**
 * 숫자 카드.
 *
 * - `details`·`delta` 가 있으면 마우스를 올렸을 때(키보드는 포커스했을 때) 아래에 세부 내역이 뜬다.
 * - `onClick` 이 있으면 카드 전체가 버튼이 되어 관련 화면으로 간다(`actionLabel` 로 어디로 가는지 적는다).
 */
export function StatCard({
  icon,
  label,
  value,
  sub,
  details,
  delta,
  onClick,
  actionLabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  details?: StatDetail[];
  delta?: StatDelta | null;
  onClick?: () => void;
  actionLabel?: string;
}) {
  const hasPopover = !!(details?.length || delta || actionLabel);
  const body = (
    <>
      <div className="text-accent-primary flex-shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-text-muted text-xs truncate">{label}</p>
        <div className="flex items-baseline gap-1.5">
          <p className="text-xl font-bold text-text-primary tabular-nums">
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
          {delta && (
            <span
              className={cn(
                "text-[11px] font-semibold tabular-nums",
                DELTA_TONE[delta.tone],
              )}
            >
              {delta.text}
            </span>
          )}
        </div>
        {sub && <p className="text-[10px] text-text-muted truncate">{sub}</p>}
      </div>
    </>
  );

  return (
    <div className="group relative">
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="flex w-full items-center gap-3 rounded-xl border border-bg-tertiary bg-bg-secondary p-4 text-left transition-colors hover:border-accent-primary/40 hover:bg-bg-tertiary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
        >
          {body}
        </button>
      ) : (
        <Card className="p-0">
          <CardContent className="p-4 flex items-center gap-3">
            {body}
          </CardContent>
        </Card>
      )}
      {hasPopover && (
        <div
          role="tooltip"
          className="pointer-events-none invisible absolute left-0 top-full z-30 mt-1.5 w-full min-w-[220px] rounded-lg border border-bg-elevated bg-bg-primary p-3 text-xs opacity-0 shadow-xl transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
        >
          {delta && (
            <p className="mb-1.5 flex items-center justify-between gap-3">
              <span className="text-text-muted">{delta.basis}</span>
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  DELTA_TONE[delta.tone],
                )}
              >
                {delta.text}
              </span>
            </p>
          )}
          {details?.map((d) => (
            <p
              key={d.label}
              className="flex items-center justify-between gap-3 py-0.5"
            >
              <span className="text-text-muted">{d.label}</span>
              <span className="font-medium tabular-nums text-text-primary">
                {d.value}
              </span>
            </p>
          ))}
          {actionLabel && onClick && (
            <p className="mt-2 border-t border-bg-tertiary pt-2 text-[11px] text-accent-primary">
              눌러서 {actionLabel} →
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 표의 한 행에서 마우스를 올렸을 때만 보이는 빠른 동작 묶음.
 *
 * 행(`<tr>`)에 `group` 클래스를 줘야 한다. 마우스가 없는 기기(터치)에서는 늘 보이고,
 * 키보드로 버튼에 포커스하면 그 행에서도 보인다.
 */
export function RowActions({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "admin-row-actions flex flex-wrap items-center gap-1 transition-opacity duration-150",
        className,
      )}
    >
      {children}
    </div>
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
