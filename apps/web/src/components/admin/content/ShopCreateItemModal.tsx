"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Upload } from "lucide-react";
import { COSMETIC_MEDIA_SIZE } from "@nexus/types";
import { adminShopApi, type AdminShopItem } from "@/lib/api-client";
import { Button, LoadingSpinner, Modal } from "@/components/ui";
import {
  RARITY_LABEL,
  SLOT_LABEL,
  buildCustomCosmetic,
  useCosmeticCatalog,
  type CosmeticItem,
  type CosmeticSlot,
} from "@/components/cosmetics/catalog";
import { CosmeticPreview } from "@/components/cosmetics/CosmeticPreview";
import { LiveBanner } from "@/components/cosmetics/live-banner";
import { cn } from "@/lib/utils";
import type { AddToast } from "../shared";

type Rarity = AdminShopItem["rarity"];
const RARITIES: Rarity[] = ["STARTER", "COMMON", "PREMIUM", "RARE"];
const SLOTS = Object.keys(SLOT_LABEL) as CosmeticSlot[];
type MediaKind = "video" | "mp4" | "image";
type Mode = "base" | "file";

const errMsg = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data
    ?.message ?? fallback;

/** 자리별로 올릴 파일 — 아바타 장식은 투명 영상·투명 그림, 사파리용 MP4 는 안 받는다 */
const FILE_FIELDS: Record<
  Exclude<CosmeticSlot, "NAME_STYLE">,
  Array<{ kind: MediaKind; label: string; accept: string; required: boolean }>
> = {
  CARD_FRAME: [
    {
      kind: "image",
      label: "정지 그림 (WebP·PNG)",
      accept: ".webp,.png",
      required: true,
    },
    { kind: "video", label: "영상 (WebM)", accept: ".webm", required: false },
    {
      kind: "mp4",
      label: "사파리용 영상 (MP4·H.264)",
      accept: ".mp4",
      required: false,
    },
  ],
  AVATAR_FRAME: [
    {
      kind: "image",
      label: "투명 정지 그림 (WebP·PNG)",
      accept: ".webp,.png",
      required: true,
    },
    {
      kind: "video",
      label: "투명 영상 (WebM VP9+알파)",
      accept: ".webm",
      required: false,
    },
  ],
  PROFILE_BANNER: [
    {
      kind: "image",
      label: "정지 그림 (WebP·PNG)",
      accept: ".webp,.png",
      required: true,
    },
    { kind: "video", label: "영상 (WebM)", accept: ".webm", required: false },
    {
      kind: "mp4",
      label: "사파리용 영상 (MP4·H.264)",
      accept: ".mp4",
      required: false,
    },
  ],
};

const inputCls =
  "mt-1 w-full rounded-lg bg-bg-tertiary px-3 py-2 text-text-primary focus:outline-none";

/**
 * 새 상품 추가 창 (상점 관리 2단계, 2026-11-20).
 *
 * 그림은 둘 중 하나:
 * - 기존 그림 쓰기 — 같은 자리의 기본 상품 그림을 빌린다(이벤트판·가격만 다른 판). 닉네임 글꼴은 이것만.
 * - 파일 올리기 — 다 만든 WebM·MP4·WebP·PNG 를 그대로 올린다(서버는 변환하지 않는다).
 * 올리는 즉시 미리보기에 입혀 보인다. 만든 뒤 가격·판매·숨김은 표에서 기존 상품처럼 바꾼다.
 */
export function ShopCreateItemModal({
  onClose,
  onCreated,
  addToast,
}: {
  onClose: () => void;
  onCreated: () => void;
  addToast: AddToast;
}) {
  const all = useCosmeticCatalog();
  const [slot, setSlot] = useState<CosmeticSlot>("CARD_FRAME");
  const [mode, setMode] = useState<Mode>("file");
  const [baseCode, setBaseCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("1000");
  const [rarity, setRarity] = useState<Rarity>("PREMIUM");
  // 만들자마자 팔지, 미리 만들어 두고 나중에 판매 시작할지
  const [onSale, setOnSale] = useState(false);
  const [urls, setUrls] = useState<Partial<Record<MediaKind, string>>>({});
  const [uploading, setUploading] = useState<MediaKind | null>(null);

  // 닉네임 글꼴은 파일로 만들 수 없다 — 그림 빌리기만
  const effMode: Mode = slot === "NAME_STYLE" ? "base" : mode;
  const bases = useMemo(
    () => all.filter((c) => c.slot === slot && !c.custom),
    [all, slot],
  );

  const pickSlot = (s: CosmeticSlot) => {
    setSlot(s);
    setBaseCode("");
    setUrls({});
  };

  const upload = async (kind: MediaKind, file: File | undefined) => {
    if (!file) return;
    setUploading(kind);
    try {
      const url = await adminShopApi.uploadMedia(file, kind);
      setUrls((u) => ({ ...u, [kind]: url }));
    } catch (e) {
      addToast(errMsg(e, "파일을 올리지 못했어요."), "error");
    } finally {
      setUploading(null);
    }
  };

  // 미리보기 — 저장 전 상품을 화면 정의로 만들어 입혀 본다
  const preview: CosmeticItem | null = useMemo(() => {
    const entry = {
      code: "CX_PREVIEW",
      slot,
      rarity,
      price: Number(price) || 0,
      name: name.trim() || "새 상품",
      description: description.trim() || null,
      custom: true,
      baseCode: effMode === "base" ? baseCode || null : null,
      media:
        effMode === "file" && urls.image
          ? {
              video: urls.video ?? null,
              mp4: slot === "AVATAR_FRAME" ? null : (urls.mp4 ?? null),
              poster: urls.image,
            }
          : null,
    };
    if (entry.baseCode) {
      // 빌린 그림은 원래 코드로 그려야 로비 카드 미리보기가 그 장식을 찾는다
      const base = bases.find((b) => b.code === entry.baseCode);
      return base ? { ...base, name: entry.name } : null;
    }
    return buildCustomCosmetic(entry);
  }, [slot, rarity, price, name, description, effMode, baseCode, urls, bases]);

  const create = useMutation({
    mutationFn: () =>
      adminShopApi.createItem({
        slot,
        name: name.trim(),
        description: description.trim() || null,
        price: Math.round(Number(price)),
        rarity,
        onSale,
        baseCode: effMode === "base" ? baseCode : null,
        videoUrl: effMode === "file" ? (urls.video ?? null) : null,
        mp4Url: effMode === "file" ? (urls.mp4 ?? null) : null,
        posterUrl: effMode === "file" ? (urls.image ?? null) : null,
      }),
    onSuccess: (item) => {
      addToast(`「${item.name ?? name}」을 추가했어요.`, "success");
      onCreated();
    },
    onError: (e) => addToast(errMsg(e, "추가하지 못했어요."), "error"),
  });

  const priceOk = Number(price) >= 1 && Number(price) <= 100000;
  const artOk = effMode === "base" ? Boolean(baseCode) : Boolean(urls.image);
  const ready =
    Boolean(name.trim()) && priceOk && artOk && !uploading && !create.isPending;
  const size = slot !== "NAME_STYLE" ? COSMETIC_MEDIA_SIZE[slot] : null;

  return (
    <Modal isOpen onClose={onClose} title="새 상품 추가" size="xl">
      <div className="grid gap-5 text-sm md:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          {/* 자리 */}
          <div>
            <span className="text-xs text-text-muted">자리</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {SLOTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => pickSlot(s)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-semibold",
                    slot === s
                      ? "bg-accent-primary text-accent-on"
                      : "bg-bg-tertiary text-text-secondary hover:text-text-primary",
                  )}
                >
                  {SLOT_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          {/* 그림 */}
          <div>
            <span className="text-xs text-text-muted">그림</span>
            <div className="mt-1 flex gap-1">
              {(["file", "base"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={slot === "NAME_STYLE" && m === "file"}
                  onClick={() => setMode(m)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-40",
                    effMode === m
                      ? "bg-bg-elevated text-text-primary ring-1 ring-white/15"
                      : "bg-bg-tertiary text-text-secondary hover:text-text-primary",
                  )}
                >
                  {m === "file" ? "파일 올리기" : "기존 그림 쓰기"}
                </button>
              ))}
            </div>
            {slot === "NAME_STYLE" && (
              <p className="mt-1 text-[11px] text-text-muted">
                닉네임 글꼴은 글자 효과라 기존 글꼴을 빌려서만 만들 수 있어요.
              </p>
            )}
          </div>

          {effMode === "base" ? (
            <label className="block">
              <span className="text-xs text-text-muted">빌려 쓸 상품</span>
              <select
                value={baseCode}
                onChange={(e) => setBaseCode(e.target.value)}
                className={inputCls}
              >
                <option value="">고르세요</option>
                {bases.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </label>
          ) : (
            slot !== "NAME_STYLE" && (
              <div className="space-y-2 rounded-lg bg-bg-tertiary/50 p-3">
                <p className="text-[11px] text-text-muted">
                  규격 {size![0]}×{size![1]}px
                  {slot === "AVATAR_FRAME" &&
                    " · 가운데 지름 192px 원이 아바타 자리, 바깥은 투명"}{" "}
                  · 영상 20MB, 그림 5MB 이하 · 올린 파일은 그대로 씁니다
                </p>
                {FILE_FIELDS[slot].map((f) => (
                  <div key={f.kind} className="flex items-center gap-2">
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-1.5 rounded-md bg-bg-tertiary px-2.5 py-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary",
                        uploading && "pointer-events-none opacity-50",
                      )}
                    >
                      {uploading === f.kind ? (
                        <LoadingSpinner size="sm" />
                      ) : urls[f.kind] ? (
                        <Check className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                      {f.label}
                      {f.required && <span className="text-red-400">*</span>}
                      <input
                        type="file"
                        accept={f.accept}
                        className="hidden"
                        onChange={(e) => {
                          void upload(f.kind, e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {urls[f.kind] && (
                      <button
                        type="button"
                        onClick={() =>
                          setUrls((u) => ({ ...u, [f.kind]: undefined }))
                        }
                        className="whitespace-nowrap text-[11px] text-text-muted hover:text-text-primary"
                      >
                        빼기
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )
          )}

          <label className="block">
            <span className="text-xs text-text-muted">이름</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-xs text-text-muted">설명</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              rows={2}
              className={inputCls}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-text-muted">가격</span>
              <input
                type="number"
                min={1}
                max={100000}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className={cn(inputCls, "tabular-nums")}
              />
            </label>
            <label className="block">
              <span className="text-xs text-text-muted">등급</span>
              <select
                value={rarity}
                onChange={(e) => setRarity(e.target.value as Rarity)}
                className={inputCls}
              >
                {RARITIES.map((r) => (
                  <option key={r} value={r}>
                    {RARITY_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            <input
              type="checkbox"
              checked={onSale}
              onChange={(e) => setOnSale(e.target.checked)}
            />
            만들자마자 판매 시작 (끄면 표에서 「판매 시작」을 눌러야 진열돼요)
          </label>
        </div>

        {/* 미리보기 */}
        <div>
          <span className="text-xs text-text-muted">미리보기</span>
          <div className="mt-1 overflow-hidden rounded-lg bg-bg-tertiary/50">
            {!preview ? (
              <div className="flex h-[216px] items-center justify-center px-4 text-center text-xs text-text-muted">
                {effMode === "base"
                  ? "빌려 쓸 상품을 고르면 보여요"
                  : "정지 그림을 올리면 보여요"}
              </div>
            ) : preview.slot === "CARD_FRAME" && preview.cardVideo ? (
              // 올린 카드 배경 — 저장 전이라 로비 카드가 코드로 찾지 못해 배경만 보인다
              <div
                className="relative w-full"
                style={{ aspectRatio: "440 / 420" }}
              >
                <LiveBanner code={preview.cardVideo} />
              </div>
            ) : (
              <CosmeticPreview item={preview} username="미리보기" />
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>
          취소
        </Button>
        <Button size="sm" disabled={!ready} onClick={() => create.mutate()}>
          추가
        </Button>
      </div>
    </Modal>
  );
}
