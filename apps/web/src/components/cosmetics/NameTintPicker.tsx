"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import {
  NAME_TINT_LIMITS,
  isDefaultNameTint,
  type NameTint,
} from "@nexus/types";
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

const ORIGINAL: NameTint = { hue: 0, saturation: 100, brightness: 100 };

const sameTint = (a: NameTint, b: NameTint) =>
  a.hue === b.hue &&
  a.saturation === b.saturation &&
  a.brightness === b.brightness;

/** 슬라이더 한 줄 — 이름·현재 값·띠 */
function Slider({
  label,
  value,
  min,
  max,
  unit,
  track,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  /** 띠 배경 — 값이 무엇을 바꾸는지 감 잡게 */
  track: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-[11px] text-text-tertiary">
        {label}
        <span className="tabular-nums">
          {value}
          {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-1.5 w-full cursor-pointer appearance-none rounded-full accent-accent-primary"
        style={{ background: track }}
      />
    </label>
  );
}

/**
 * 닉네임 글꼴 색 고르기 (2026-11-20) — 보관함·프로필 편집에서 언제든 바꾼다.
 *
 * 세 가지를 고른다.
 * - 색: 글꼴의 원래 색 계열을 통째로 돌린다(금빛 → 청록빛, 네온 분홍 → 하늘색).
 * - 채도: 0% 는 무채색(은빛·회색), 200% 는 더 쨍하게.
 * - 밝기: 어둡게(50%) ~ 밝게(150%).
 * 미리보기를 보고 「적용」. 고른 값은 상품마다 따로 기억한다(글꼴을 바꿔 끼워도 남는다).
 */
export function NameTintPicker({
  code,
  tint,
  username,
  className,
}: {
  /** 가진 닉네임 글꼴 상품 코드 */
  code: string;
  /** 지금 저장된 색 — 없으면 원래 색 */
  tint: NameTint | null | undefined;
  username: string;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const style = findCosmetic(code)?.nameStyle;
  const saved = tint ?? ORIGINAL;
  const [draft, setDraft] = useState<NameTint>(saved);
  const [saving, setSaving] = useState(false);
  // 저장된 값이 바뀌면(다른 상품을 고름 등) 고르던 값도 따라간다 — 렌더 중 맞추기
  const [seen, setSeen] = useState({ code, saved });
  if (seen.code !== code || !sameTint(seen.saved, saved)) {
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

  const set = (patch: Partial<NameTint>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const apply = async () => {
    setSaving(true);
    try {
      await shopApi.setNameTint(code, isDefaultNameTint(draft) ? null : draft);
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
        <StyledName code={style} tint={draft}>
          {username}
        </StyledName>
      </div>

      {/* 미리 정한 색 — 칸마다 그 색으로 「가」를 그린다. 채도·밝기는 지금 고른 값 그대로 */}
      <div className="grid grid-cols-8 gap-1">
        {NAME_HUE_PRESETS.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => set({ hue: h })}
            aria-label={h === 0 ? "원래 색" : `색 ${h}도`}
            className={cn(
              "flex aspect-square items-center justify-center rounded-md bg-bg-tertiary text-sm font-black transition",
              draft.hue === h
                ? "ring-2 ring-accent-primary"
                : "hover:bg-bg-elevated",
            )}
          >
            <StyledName code={style} tint={{ ...draft, hue: h }}>
              가
            </StyledName>
          </button>
        ))}
      </div>

      <Slider
        label="색"
        value={draft.hue}
        min={NAME_TINT_LIMITS.hue[0]}
        max={NAME_TINT_LIMITS.hue[1]}
        unit="°"
        track="linear-gradient(90deg, #f87171, #facc15, #4ade80, #22d3ee, #818cf8, #e879f9, #f87171)"
        onChange={(hue) => set({ hue })}
      />
      <Slider
        label="채도"
        value={draft.saturation}
        min={NAME_TINT_LIMITS.saturation[0]}
        max={NAME_TINT_LIMITS.saturation[1]}
        unit="%"
        track="linear-gradient(90deg, #8a8a8a, #f472b6)"
        onChange={(saturation) => set({ saturation })}
      />
      <Slider
        label="밝기"
        value={draft.brightness}
        min={NAME_TINT_LIMITS.brightness[0]}
        max={NAME_TINT_LIMITS.brightness[1]}
        unit="%"
        track="linear-gradient(90deg, #1f1f1f, #f5f5f5)"
        onChange={(brightness) => set({ brightness })}
      />

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setDraft(ORIGINAL)}
          disabled={isDefaultNameTint(draft)}
          className="inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary disabled:opacity-40"
        >
          <Undo2 className="h-3.5 w-3.5" />
          원래 색
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={saving || sameTint(draft, saved)}
          className="rounded-lg bg-accent-primary px-4 py-1.5 text-xs font-bold text-accent-on transition hover:brightness-110 disabled:opacity-40"
        >
          {saving ? "적용 중…" : "적용"}
        </button>
      </div>
    </div>
  );
}
