"use client";

import { Sparkles } from "lucide-react";
import {
  useCosmeticFxStore,
  type CosmeticFxMode,
} from "@/stores/cosmetic-fx-store";
import { cn } from "@/lib/utils";

const OPTIONS: { mode: CosmeticFxMode; label: string; hint: string }[] = [
  { mode: "full", label: "움직임 그대로", hint: "장식이 움직여요" },
  { mode: "still", label: "멈춘 그림", hint: "장식은 보이고 움직이지 않아요" },
  {
    mode: "off",
    label: "숨기기",
    hint: "다른 사람 장식도 안 보여요",
  },
];

/**
 * 설정 > 화면 설정 — 꾸미기 효과 보기 (Task 22).
 * 로비 카드·아바타·닉네임 장식의 움직임을 이 브라우저에서만 줄이거나 끈다.
 * 다른 사람에게 내 장식이 어떻게 보이는지는 바뀌지 않는다.
 */
export function CosmeticFxSection() {
  const mode = useCosmeticFxStore((s) => s.mode);
  const setMode = useCosmeticFxStore((s) => s.setMode);

  return (
    <div className="border-t border-bg-tertiary pt-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-bg-tertiary p-2 text-text-secondary">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <p className="font-medium text-text-primary">꾸미기 효과</p>
          <p className="mt-1 text-sm text-text-secondary">
            로비 카드·아바타·닉네임 장식을 어떻게 볼지 정해요. 이 브라우저에만
            적용돼요.
          </p>
        </div>
      </div>
      <div
        role="radiogroup"
        aria-label="꾸미기 효과"
        className="mt-4 grid grid-cols-3 gap-2"
      >
        {OPTIONS.map((o) => (
          <button
            key={o.mode}
            type="button"
            role="radio"
            aria-checked={mode === o.mode}
            onClick={() => setMode(o.mode)}
            className={cn(
              "rounded-lg border-2 p-3 text-left transition-colors",
              mode === o.mode
                ? "border-accent-primary bg-bg-tertiary"
                : "border-bg-tertiary bg-bg-tertiary hover:border-accent-primary/50",
            )}
          >
            <p className="text-sm font-bold text-text-primary">{o.label}</p>
            <p className="mt-0.5 text-xs text-text-tertiary">{o.hint}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
