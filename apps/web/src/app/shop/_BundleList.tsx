"use client";

import { useState } from "react";
import { Check, Medal, Package } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui";
import { CosmeticPreview } from "@/components/cosmetics/CosmeticPreview";
import {
  MEDAL_LABEL,
  SLOT_LABEL,
  findCosmetic,
  useCosmeticCatalog,
} from "@/components/cosmetics/catalog";
import type { ShopBundleView } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/**
 * 상점 「묶음」 탭 (번들, 2026-11-24).
 *
 * 묶음마다 들어 있는 상품을 작게 입혀 보이고, 이미 가진 상품은 「보유」로 표시한다.
 * 값은 이미 가진 것을 뺀 나머지의 할인 전 합(취소선)과 묶음 할인 뒤 값.
 * 다 가진 묶음은 살 수 없다고 알린다.
 */
export function BundleList({
  bundles,
  balance,
  username,
  avatar,
  buying,
  onBuy,
}: {
  bundles: ShopBundleView[];
  balance: number;
  username: string;
  avatar: string;
  buying: boolean;
  onBuy: (bundle: ShopBundleView) => void;
}) {
  // 관리자가 추가한 상품도 그리게 상품표가 들어오면 다시 그린다
  useCosmeticCatalog();
  const [confirm, setConfirm] = useState<ShopBundleView | null>(null);

  if (bundles.length === 0) {
    return (
      <div className="rounded-lg bg-bg-secondary py-16 text-center text-sm text-text-tertiary">
        지금 파는 묶음이 없어요.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {bundles.map((b) => {
        const allOwned = b.remaining.length === 0;
        const short = !allOwned && balance < b.price;
        return (
          <section
            key={b.id}
            className="overflow-hidden rounded-lg border border-white/[0.06] bg-bg-secondary"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4">
              <div className="min-w-0">
                <h3 className="flex items-center gap-2 text-base font-black text-text-primary">
                  <Package className="h-4 w-4 text-amber-300" />
                  {b.name}
                  <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] font-bold text-red-400">
                    -{b.percent}%
                  </span>
                </h3>
                {b.description && (
                  <p className="mt-1 text-sm text-text-secondary">
                    {b.description}
                  </p>
                )}
                <p className="mt-1 text-xs text-text-tertiary">
                  {b.itemCodes.length}개 묶음
                  {b.owned.length > 0 &&
                    ` · ${b.owned.length}개는 이미 있어 빼고 계산했어요`}
                </p>
              </div>
            </div>

            {/* 들어 있는 상품 */}
            <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 xl:grid-cols-4">
              {b.itemCodes.map((code) => {
                const item = findCosmetic(code);
                if (!item) return null;
                const owned = b.owned.includes(code);
                return (
                  <div
                    key={code}
                    className={cn(
                      "relative overflow-hidden rounded-md bg-bg-tertiary/40",
                      item.slot === "PROFILE_BANNER" && "col-span-2",
                      owned && "opacity-60",
                    )}
                  >
                    <CosmeticPreview
                      item={item}
                      username={username}
                      avatar={avatar}
                      height={item.slot === "CARD_FRAME" ? 168 : 120}
                    />
                    <div className="flex items-center justify-between gap-1 px-2 py-1.5 text-[11px]">
                      <span className="truncate font-bold text-text-primary">
                        {item.name}
                      </span>
                      <span className="flex-shrink-0 text-text-tertiary">
                        {owned ? (
                          <span className="inline-flex items-center gap-0.5">
                            <Check className="h-3 w-3" />
                            보유
                          </span>
                        ) : (
                          SLOT_LABEL[item.slot]
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 값 · 사기 */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3">
              {allOwned ? (
                <p className="text-sm text-text-tertiary">
                  묶음의 상품을 다 가지고 있어요.
                </p>
              ) : (
                <p className="flex items-baseline gap-2 tabular-nums">
                  {b.fullPrice > b.price && (
                    <span className="text-sm text-text-tertiary line-through">
                      {b.fullPrice.toLocaleString()}
                    </span>
                  )}
                  <span className="text-lg font-black text-text-primary">
                    {b.price.toLocaleString()}
                  </span>
                  <span className="text-xs text-text-secondary">
                    {MEDAL_LABEL}
                  </span>
                </p>
              )}
              {!allOwned && (
                <button
                  type="button"
                  disabled={short || buying}
                  onClick={() => setConfirm(b)}
                  className={cn(
                    "flex h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-black transition",
                    short
                      ? "cursor-not-allowed bg-bg-tertiary text-text-tertiary"
                      : "bg-accent-primary text-accent-on hover:brightness-110",
                  )}
                >
                  <Medal className="h-4 w-4" />
                  {short
                    ? `${(b.price - balance).toLocaleString()} 부족`
                    : `묶음 사기 (${b.remaining.length}개)`}
                </button>
              )}
            </div>
          </section>
        );
      })}

      <Modal
        isOpen={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title="묶음 구매 확인"
        size="sm"
      >
        {confirm && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              <span className="font-black text-text-primary">
                「{confirm.name}」
              </span>
              의 상품 {confirm.remaining.length}개를{" "}
              <span className="font-black text-text-primary">
                {confirm.price.toLocaleString()} {MEDAL_LABEL}
              </span>
              에 살까요?
            </p>
            <ul className="space-y-1 text-xs text-text-secondary">
              {confirm.remaining.map((c) => (
                <li key={c}>· {findCosmetic(c)?.name ?? c}</li>
              ))}
            </ul>
            <p className="text-xs text-text-tertiary">
              산 뒤 잔액 {(balance - confirm.price).toLocaleString()}{" "}
              {MEDAL_LABEL} · 산 상품은 보관함에서 장착해요.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                취소
              </Button>
              <Button
                disabled={buying}
                onClick={() => {
                  onBuy(confirm);
                  setConfirm(null);
                }}
              >
                사기
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
