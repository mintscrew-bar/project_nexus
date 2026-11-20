"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import { shopApi } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { findCosmetic } from "./catalog";
import {
  NAME_HUE_PRESETS,
  StyledName,
  isNameStyleTintable,
} from "./name-styles";
import { LOADOUT_QUERY_KEY } from "./useCosmeticLoadouts";

/**
 * 닉네임 글꼴 색 고르기 (2026-11-20) — 보관함·프로필 편집에서 언제든 바꾼다.
 *
 * 색은 글꼴의 원래 색 계열을 통째로 돌리는 방식(색상 회전)이라, 금빛은 은빛·청록빛이 되고
 * 네온 분홍은 하늘색이 된다. 미리 정한 칸을 누르거나 슬라이더로 아무 색이나 고른 뒤 「적용」.
 * 고른 색은 상품마다 따로 기억한다(글꼴을 바꿔 끼워도 남는다).
 */
export function NameHuePicker({
  code,
  hue,
  username,
  className,
}: {
  /** 가진 닉네임 글꼴 상품 코드 */
  code: string;
  /** 지금 저장된 색 — 없으면 원래 색 */
  hue: number | null | undefined;
  username: string;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const style = findCosmetic(code)?.nameStyle;
  const saved = hue ?? 0;
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  // 저장된 값이 바뀌면(다른 상품을 고름 등) 고르던 값도 따라간다 — 렌더 중 맞추기
  const [seen, setSeen] = useState({ code, saved });
  if (seen.code !== code || seen.saved !== saved) {
    setSeen({ code, saved });
    setDraft(saved);
  }

  if (!style) return null;
  if (!isNameStyleTintable(style)) {
    return (
      <p className={cn("text-xs text-text-tertiary", className)}>
        이 글꼴은 색이 정해져 있어 바꿀 수 없어요.
      </p>
    );
  }

  const apply = async (value: number) => {
    setSaving(true);
    try {
      await shopApi.setNameHue(code, value === 0 ? null : value);
      // 상점(보유 색)·로비 카드·프로필(장착 정보)을 새로 읽는다
      void queryClient.invalidateQueries({ queryKey: ["shop"] });
      void queryClient.invalidateQueries({ queryKey: [LOADOUT_QUERY_KEY] });
      addToast("닉네임 색을 바꿨어요.", "success");
    } catch {
      addToast("색을 바꾸지 못했어요.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* 미리보기 */}
      <div className="flex h-14 items-center justify-center rounded-lg bg-bg-tertiary/60 text-2xl font-black text-text-primary">
        <StyledName code={style} hue={draft}>
          {username}
        </StyledName>
      </div>

      {/* 미리 정한 색 — 칸마다 그 색으로 「가」를 그려 보여 준다 */}
      <div className="grid grid-cols-8 gap-1">
        {NAME_HUE_PRESETS.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => setDraft(h)}
            aria-label={h === 0 ? "원래 색" : `색 ${h}도`}
            className={cn(
              "flex aspect-square items-center justify-center rounded-md bg-bg-tertiary text-sm font-black transition",
              draft === h
                ? "ring-2 ring-accent-primary"
                : "hover:bg-bg-elevated",
            )}
          >
            <StyledName code={style} hue={h}>
              가
            </StyledName>
          </button>
        ))}
      </div>

      {/* 아무 색이나 */}
      <label className="block">
        <span className="text-[11px] text-text-tertiary">직접 고르기</span>
        <input
          type="range"
          min={0}
          max={359}
          value={draft}
          onChange={(e) => setDraft(Number(e.target.value))}
          className="mt-1 w-full accent-accent-primary"
          // 무지개 띠 — 원래 색에서 몇 도 돌리는지 감 잡게
          style={{
            background:
              "linear-gradient(90deg, #f87171, #facc15, #4ade80, #22d3ee, #818cf8, #e879f9, #f87171)",
            height: 6,
            borderRadius: 999,
            appearance: "none",
          }}
        />
      </label>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setDraft(0)}
          disabled={draft === 0}
          className="inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary disabled:opacity-40"
        >
          <Undo2 className="h-3.5 w-3.5" />
          원래 색
        </button>
        <button
          type="button"
          onClick={() => apply(draft)}
          disabled={saving || draft === saved}
          className="rounded-lg bg-accent-primary px-4 py-1.5 text-xs font-bold text-accent-on transition hover:brightness-110 disabled:opacity-40"
        >
          {saving ? "적용 중…" : "적용"}
        </button>
      </div>
    </div>
  );
}
