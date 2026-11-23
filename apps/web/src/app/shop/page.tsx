"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Medal, Sparkles } from "lucide-react";
import { AvatarDecoration } from "@/components/cosmetics/avatar-effects";
import { StyledName } from "@/components/cosmetics/name-styles";
import {
  MEDAL_LABEL,
  RARITY_LABEL,
  SLOT_LABEL,
  findCosmetic,
  useCosmeticCatalog,
  type CosmeticItem,
} from "@/components/cosmetics/catalog";
import { LOADOUT_QUERY_KEY } from "@/components/cosmetics/useCosmeticLoadouts";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useAuthStore } from "@/stores/auth-store";
import { medalApi, shopApi, type ShopItemState } from "@/lib/api-client";
import { MEDAL_QUERY_KEY } from "@/components/cosmetics/MedalChip";
import {
  applyLoadout,
  refreshMedalViews,
  setMedalBalance,
} from "@/components/cosmetics/medal-sync";
import { cn } from "@/lib/utils";
import { NameTintPicker } from "@/components/cosmetics/NameTintPicker";
import {
  CosmeticPreview,
  RealSizeLobbyCard,
} from "@/components/cosmetics/CosmeticPreview";
import {
  LiveBanner,
  liveBannerAspect,
} from "@/components/cosmetics/live-banner";

type ShopSlot = "CARD_FRAME" | "AVATAR_FRAME" | "NAME_STYLE" | "PROFILE_BANNER";
const SLOTS: ShopSlot[] = [
  "CARD_FRAME",
  "AVATAR_FRAME",
  "NAME_STYLE",
  "PROFILE_BANNER",
];
/** 진열 탭 — 자리별 상품 + 산 것만 모아 보는 보관함 */
type ShopTab = ShopSlot | "OWNED";

const RARITY_STYLE: Record<CosmeticItem["rarity"], string> = {
  STARTER: "bg-bg-elevated text-text-secondary",
  COMMON: "bg-sky-500/15 text-sky-300",
  PREMIUM: "bg-violet-500/20 text-violet-300",
  RARE: "bg-amber-500/20 text-amber-300",
};

/**
 * 등급별 상품 칸 — 판은 모두 같게 두고 희귀만 옅은 금빛 테두리로 구분한다.
 * 색 테두리·빛을 등급마다 다르게 주니 어수선했다(2026-11-19 운영자: "좀 더 정갈").
 */
const RARITY_TILE: Record<CosmeticItem["rarity"], string> = {
  STARTER: "border-white/[0.06] hover:border-white/20",
  COMMON: "border-white/[0.06] hover:border-white/20",
  PREMIUM: "border-white/[0.06] hover:border-white/20",
  RARE: "border-amber-300/25 hover:border-amber-300/50",
};

/** 등급 글자 색 — 칸 아래 글자 줄에서만 쓴다 */
const RARITY_TEXT: Record<CosmeticItem["rarity"], string> = {
  STARTER: "text-text-tertiary",
  COMMON: "text-sky-300/80",
  PREMIUM: "text-violet-300/90",
  RARE: "text-amber-300",
};

const AVATAR_FALLBACK = "/images/placeholders/non-avatar-256.png";

/**
 * 메달 상점 — 카드 장식·아바타 장식을 사고 장착한다.
 *
 * 위쪽 「내 모습」에 지금 장착한 것(또는 고른 상품)을 입혀 보여준다 — 사기 전에
 * 실제 로비 카드·프로필 아바타에서 어떻게 보이는지 확인하게(기획서 10·12절).
 */
export default function ShopPage() {
  const { isAuthenticated, user } = useAuthStore();
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["shop"],
    queryFn: shopApi.getShop,
    enabled: isAuthenticated,
  });
  // 잔액은 헤더 메달 칩과 같은 쿼리를 본다 — 출석·운영자 지급 뒤 상점만 옛 값으로 남지 않게
  const medal = useQuery({
    queryKey: MEDAL_QUERY_KEY,
    queryFn: medalApi.getMine,
    enabled: isAuthenticated,
    staleTime: 30 * 1000,
  });

  // 코드 상품 + 관리자가 추가한 상품(서버 상품표가 들어오면 다시 그린다)
  const allCosmetics = useCosmeticCatalog();
  const [tab, setTab] = useState<ShopTab>("CARD_FRAME");
  // 입어 보는 중인 상품 — 자리별로 따로
  const [trying, setTrying] = useState<Partial<Record<ShopSlot, string>>>({});
  const [confirm, setConfirm] = useState<CosmeticItem | null>(null);
  // 오른쪽 패널에 자세히 보여 줄 상품(마지막으로 누른 것)
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  // 정렬·거르기
  const [sort, setSort] = useState<"RECOMMENDED" | "PRICE_ASC" | "PRICE_DESC">(
    "RECOMMENDED",
  );
  const [affordableOnly, setAffordableOnly] = useState(false);

  const stateByCode = useMemo(() => {
    const map = new Map<string, ShopItemState>();
    data?.items.forEach((it) => map.set(it.code, it));
    return map;
  }, [data]);

  const refresh = () => {
    // 잔액(헤더 칩·상점)과 로비 카드·프로필이 들고 있는 장착 상태를 함께 새로 읽는다
    refreshMedalViews(queryClient);
    void queryClient.invalidateQueries({ queryKey: [LOADOUT_QUERY_KEY] });
  };

  const purchase = useMutation({
    // 확인 창에 띄운 가격을 같이 보낸다 — 그 사이 할인이 끝나거나 값이 바뀌면 서버가 거절
    mutationFn: (item: CosmeticItem) =>
      shopApi.purchase(item.code, true, item.price),
    onSuccess: (res, item) => {
      addToast(`「${item.name}」을 사서 바로 장착했어요`, "success");
      setConfirm(null);
      // 깎인 잔액을 바로 넣고(다시 읽기 전에도 헤더·상점 숫자가 맞게) 새로 읽는다
      setMedalBalance(queryClient, res.balance);
      refresh();
    },
    onError: (err: any) => {
      addToast(
        err?.response?.data?.message || "사지 못했어요. 다시 시도해 주세요.",
        "error",
      );
      // 가격이 바뀐 경우(409) — 새 가격으로 다시 보여 주고 확인 창은 닫는다
      if (err?.response?.status === 409) {
        setConfirm(null);
        refresh();
      }
    },
  });

  const equip = useMutation({
    mutationFn: ({ slot, code }: { slot: ShopSlot; code: string | null }) =>
      shopApi.equip(slot, code),
    onSuccess: (loadout, { slot }) => {
      // 서버가 돌려준 장착 상태를 바로 넣는다 — 다시 읽는 사이 옛 장착이 보이지 않게
      applyLoadout(queryClient, loadout);
      // 그 자리를 입어 보던 중이면 내려놓는다 — 미리보기가 실제 장착을 보이게
      setTrying((t) => ({ ...t, [slot]: undefined }));
    },
    onError: () => addToast("장착하지 못했어요.", "error"),
  });

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto max-w-3xl px-6 py-20 text-center">
        <Medal className="mx-auto h-10 w-10 text-amber-300" />
        <h1 className="mt-4 text-2xl font-black text-text-primary">
          {MEDAL_LABEL} 상점
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          내전을 끝까지 하면 {MEDAL_LABEL}을 받아요. 로그인하면 로비 카드와
          프로필을 꾸밀 수 있어요.
        </p>
        <Link
          href="/auth/login"
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-accent-primary px-5 text-sm font-black text-accent-on"
        >
          로그인
        </Link>
      </div>
    );
  }

  const balance = medal.data?.balance ?? data?.balance ?? 0;
  const loadout = data?.loadout ?? {};
  // 미리보기에 입힐 것: 고른 상품 > 장착한 상품
  const shownCard = trying.CARD_FRAME ?? loadout.CARD_FRAME;
  const shownAvatar = trying.AVATAR_FRAME ?? loadout.AVATAR_FRAME;
  const shownName = trying.NAME_STYLE ?? loadout.NAME_STYLE;
  const shownBanner = findCosmetic(
    trying.PROFILE_BANNER ?? loadout.PROFILE_BANNER,
  )?.liveBanner;
  const shownNameStyle = findCosmetic(shownName)?.nameStyle;
  // 닉네임에 고른 색 — 가진 글꼴이면 저장된 값(입어 보는 중이어도 내 것이면 그 색)
  const shownTint = shownName ? stateByCode.get(shownName)?.tint : null;
  const avatarSrc = user?.avatar || AVATAR_FALLBACK;
  const me = {
    id: "me",
    userId: user?.id ?? "me",
    username: user?.username ?? "나",
    avatar: avatarSrc,
    isHost: false,
    isReady: true,
  };
  const isTrying = Boolean(
    trying.CARD_FRAME ||
    trying.AVATAR_FRAME ||
    trying.NAME_STYLE ||
    trying.PROFILE_BANNER,
  );
  // 진열할 상품 — 보관함이면 산 것 전부(자리 순서대로), 아니면 그 자리 상품
  // 서버 상품표(관리자가 바꾼 이름·설명·가격·순서·할인)를 그림 정의에 덮어 진열한다
  const serverOrder = new Map(data?.items.map((it, i) => [it.code, i]) ?? []);
  const shown = allCosmetics
    .filter((item) => stateByCode.has(item.code))
    .map((item) => {
      const st = stateByCode.get(item.code)!;
      return {
        ...item,
        name: st.name ?? item.name,
        description: st.description ?? item.description,
        price: st.price,
        rarity: st.rarity,
        basePrice: st.basePrice ?? st.price,
        discountPercent: st.discountPercent ?? 0,
      };
    })
    .sort(
      (a, b) => (serverOrder.get(a.code) ?? 0) - (serverOrder.get(b.code) ?? 0),
    )
    .filter((item) =>
      tab === "OWNED" ? stateByCode.get(item.code)!.owned : item.slot === tab,
    )
    // 살 수 있는 것만 — 가진 것은 늘 보인다
    .filter(
      (item) =>
        !affordableOnly ||
        stateByCode.get(item.code)!.owned ||
        item.price <= (data?.balance ?? 0),
    )
    .sort((a, b) =>
      sort === "PRICE_ASC"
        ? a.price - b.price
        : sort === "PRICE_DESC"
          ? b.price - a.price
          : 0,
    );
  type ShownItem = (typeof shown)[number];
  // 진행 중 할인 — 가장 큰 할인율과 가장 먼저 끝나는 시각
  const discounted = (data?.items ?? []).filter(
    (it) => (it.discountPercent ?? 0) > 0,
  );
  const maxDiscount = Math.max(
    0,
    ...discounted.map((it) => it.discountPercent ?? 0),
  );
  const discountEnds = discounted
    .map((it) => it.discountEndsAt)
    .filter((d): d is string => Boolean(d))
    .sort()[0];
  const selected =
    shown.find((it) => it.code === selectedCode) ??
    (selectedCode
      ? (() => {
          // 탭을 바꿔 목록에 없어도 패널에는 남긴다
          const base = findCosmetic(selectedCode);
          const st = stateByCode.get(selectedCode);
          return base && st
            ? {
                ...base,
                name: st.name ?? base.name,
                description: st.description ?? base.description,
                price: st.price,
                rarity: st.rarity,
                basePrice: st.basePrice ?? st.price,
                discountPercent: st.discountPercent ?? 0,
              }
            : null;
        })()
      : null);
  const pick = (item: ShownItem) => {
    setSelectedCode(item.code);
    // 입어 보기는 자리마다 따로 — 같은 상품을 다시 누르면 벗는다
    setTrying((t) => ({
      ...t,
      [item.slot]:
        t[item.slot as ShopSlot] === item.code ? undefined : item.code,
    }));
  };
  const ownedCount = data?.items.filter((it) => it.owned).length ?? 0;

  /** 사기·장착·해제 버튼 — 상품 상태에 따라 하나 */
  const actionFor = (item: ShownItem, size: "sm" | "lg") => {
    const state = stateByCode.get(item.code)!;
    const h = size === "lg" ? "h-11 text-sm" : "h-9 text-xs";
    if (state.owned) {
      return state.equipped ? (
        <button
          type="button"
          disabled={equip.isPending}
          onClick={() =>
            equip.mutate({ slot: item.slot as ShopSlot, code: null })
          }
          className={cn(
            "flex w-full items-center justify-center gap-1.5 rounded-lg bg-bg-tertiary font-black text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary",
            h,
          )}
        >
          장착 해제
        </button>
      ) : (
        <button
          type="button"
          disabled={equip.isPending}
          onClick={() =>
            equip.mutate({ slot: item.slot as ShopSlot, code: item.code })
          }
          className={cn(
            "flex w-full items-center justify-center rounded-lg bg-accent-primary font-black text-accent-on transition hover:brightness-110",
            h,
          )}
        >
          장착하기
        </button>
      );
    }
    const short = balance < item.price;
    return (
      <button
        type="button"
        disabled={short}
        onClick={() => setConfirm(item)}
        className={cn(
          "flex w-full items-center justify-center gap-1.5 rounded-lg font-black transition",
          h,
          short
            ? "cursor-not-allowed bg-bg-tertiary text-text-tertiary"
            : "bg-accent-primary text-accent-on hover:brightness-110",
        )}
      >
        <Medal className="h-4 w-4" />
        {item.price.toLocaleString()} {MEDAL_LABEL}에 사기
        {short && (
          <span className="font-bold">
            · {(item.price - balance).toLocaleString()} 부족
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="container mx-auto max-w-7xl space-y-5 px-4 py-6 md:px-6">
      {/* 제목 + 잔액 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-text-primary">
            {MEDAL_LABEL} 상점
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            내전을 끝까지 하고 매일 출석하면 {MEDAL_LABEL}을 받아요. 상품을
            누르면 오른쪽에서 입어 볼 수 있어요.
          </p>
        </div>
        {/* 잔액 — 누르면 메달 내역 전체 화면 */}
        <Link
          href="/shop/medals"
          title={`${MEDAL_LABEL} 내역 보기`}
          className="flex items-center gap-2 rounded-lg bg-amber-400/10 px-4 py-2.5 transition-colors hover:bg-amber-400/15"
        >
          <Medal className="h-5 w-5 text-amber-300" />
          <span className="text-xl font-black tabular-nums text-text-primary">
            {balance.toLocaleString()}
          </span>
          <span className="text-sm font-bold text-text-tertiary">
            {MEDAL_LABEL} · 내역
          </span>
        </Link>
      </div>

      {/* 진행 중 할인 띠 */}
      {maxDiscount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] px-4 py-2.5 text-sm">
          <span className="text-xs font-bold text-red-400">할인 중</span>
          <span className="font-bold text-text-primary">
            최대 {maxDiscount}% 할인
          </span>
          <span className="text-text-secondary">
            {discounted.length}개 상품
            {discountEnds &&
              ` · ${new Date(discountEnds).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "numeric" })}까지`}
          </span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── 왼쪽: 자리 탭 · 정렬 · 상품 ── */}
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {[...SLOTS, "OWNED" as const].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    "h-9 rounded-lg px-3.5 text-sm font-bold transition-colors",
                    tab === t
                      ? "bg-accent-primary text-accent-on"
                      : "bg-bg-tertiary/60 text-text-secondary hover:bg-bg-tertiary",
                  )}
                >
                  {t === "OWNED" ? `보관함 ${ownedCount}` : SLOT_LABEL[t]}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <label className="flex cursor-pointer items-center gap-1.5 text-text-secondary">
                <input
                  type="checkbox"
                  checked={affordableOnly}
                  onChange={(e) => setAffordableOnly(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[var(--accent-primary)]"
                />
                살 수 있는 것만
              </label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
                className="h-8 rounded-lg bg-bg-tertiary px-2 text-text-primary focus:outline-none"
              >
                <option value="RECOMMENDED">추천순</option>
                <option value="PRICE_ASC">가격 낮은순</option>
                <option value="PRICE_DESC">가격 높은순</option>
              </select>
            </div>
          </div>

          {isLoading ? (
            <div className="py-20 text-center text-sm text-text-tertiary">
              불러오는 중…
            </div>
          ) : shown.length === 0 ? (
            <div className="rounded-lg bg-bg-secondary py-16 text-center text-sm text-text-tertiary">
              {tab === "OWNED"
                ? "아직 산 꾸미기가 없어요."
                : "조건에 맞는 상품이 없어요."}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {shown.map((item) => {
                const state = stateByCode.get(item.code)!;
                const isSelected = selectedCode === item.code;
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => pick(item)}
                    aria-pressed={isSelected}
                    aria-label={`${item.name} 입어 보기`}
                    className={cn(
                      "group relative flex flex-col overflow-hidden rounded-lg border bg-bg-secondary text-left transition-colors",
                      // 프로필 배경은 가로로 긴 배너라 두 칸을 쓴다
                      item.slot === "PROFILE_BANNER" && "col-span-2",
                      RARITY_TILE[item.rarity],
                      isSelected && "ring-2 ring-accent-primary",
                    )}
                  >
                    {/* 그림 — 그 상품만(내 장착 장식은 섞지 않는다) */}
                    <div className="relative">
                      <CosmeticPreview
                        item={item}
                        username={me.username}
                        avatar={avatarSrc}
                        // 가진 닉네임 글꼴은 내가 고른 색으로
                        tint={stateByCode.get(item.code)?.tint}
                        // 카드 장식은 세로로 긴 로비 카드가 다 들어가게 조금 더 높게
                        height={item.slot === "CARD_FRAME" ? 236 : 200}
                      />
                      {state.equipped && (
                        <span className="absolute right-2 top-2 flex items-center gap-0.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          <Check className="h-3 w-3" strokeWidth={3} />
                          장착 중
                        </span>
                      )}
                    </div>
                    {/* 이름 / 등급 · 가격 — 두 줄로 차분하게 */}
                    <div className="space-y-0.5 border-t border-white/[0.06] px-3 py-2.5">
                      <p className="truncate text-sm font-bold text-text-primary">
                        {item.name}
                      </p>
                      <p className="flex items-center justify-between gap-2 text-xs">
                        <span className={RARITY_TEXT[item.rarity]}>
                          {tab === "OWNED"
                            ? SLOT_LABEL[item.slot]
                            : RARITY_LABEL[item.rarity]}
                        </span>
                        {state.owned ? (
                          <span className="text-text-tertiary">보유</span>
                        ) : (
                          <span className="flex items-center gap-1 tabular-nums">
                            {item.discountPercent > 0 && (
                              <>
                                <span className="text-text-tertiary line-through">
                                  {item.basePrice.toLocaleString()}
                                </span>
                                <span className="font-bold text-red-400">
                                  {item.discountPercent}%
                                </span>
                              </>
                            )}
                            <span className="font-bold text-text-primary">
                              {item.price.toLocaleString()}
                            </span>
                            <Medal className="h-3 w-3 text-amber-300" />
                          </span>
                        )}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── 오른쪽: 내 모습 + 고른 상품 (화면을 따라다닌다) ── */}
        <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <section className="rounded-lg bg-bg-secondary p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-bold text-text-primary">
                {isTrying && <Sparkles className="h-4 w-4 text-amber-300" />}
                {isTrying ? "입어 보는 중" : "지금 내 모습"}
              </span>
              {isTrying && (
                <button
                  type="button"
                  onClick={() => {
                    setTrying({});
                    setSelectedCode(null);
                  }}
                  className="text-xs font-bold text-text-tertiary hover:text-text-primary"
                >
                  되돌리기
                </button>
              )}
            </div>
            {/* 미니 프로필 — 실제 프로필 머리처럼 배경 위에 장식한 아바타가 걸치고 아래에 닉네임.
                배경 장식이 없으면 올린 배경 이미지, 그것도 없으면 옅은 바탕 */}
            <div className="overflow-hidden rounded-lg bg-bg-primary/60">
              <div
                className="relative w-full overflow-hidden bg-gradient-to-br from-accent-primary/25 to-accent-primary/5"
                style={{ aspectRatio: liveBannerAspect() }}
              >
                {user?.profileBanner && (
                  <Image
                    src={user.profileBanner}
                    alt=""
                    fill
                    unoptimized
                    className="pointer-events-none object-cover"
                  />
                )}
                {shownBanner && (
                  <LiveBanner code={shownBanner} className="absolute inset-0" />
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-bg-secondary/90 to-transparent" />
              </div>
              <div className="relative flex items-end gap-3 px-3 pb-3">
                {/* 아바타 — 배경에 반쯤 걸친다 */}
                <div className="-mt-9 flex-shrink-0">
                  <AvatarDecoration
                    code={findCosmetic(shownAvatar)?.avatarEffect}
                    size={64}
                  >
                    <div className="relative h-16 w-16 overflow-hidden rounded-full bg-bg-tertiary ring-4 ring-bg-secondary">
                      <Image
                        src={avatarSrc}
                        alt=""
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    </div>
                  </AvatarDecoration>
                </div>
                <div className="min-w-0 pb-0.5">
                  <p className="truncate text-lg font-black text-text-primary">
                    <StyledName code={shownNameStyle} tint={shownTint}>
                      {me.username}
                    </StyledName>
                  </p>
                  <p className="text-[11px] text-text-tertiary">프로필</p>
                </div>
              </div>
            </div>

            {/* 로비 카드(실제 크기) + 채팅 한 줄 — 내전 방에서 남들이 보는 모습 */}
            <div className="mt-3 flex justify-center">
              <RealSizeLobbyCard
                p={me}
                frameCode={shownCard}
                avatarFrameCode={shownAvatar}
                nameStyleCode={shownName ?? null}
                nameTint={shownTint}
              />
            </div>
            <div className="mt-3 rounded-lg bg-bg-tertiary/60 px-2.5 py-2 text-xs leading-relaxed text-text-secondary">
              <span className="font-bold text-text-primary">
                <StyledName code={shownNameStyle} tint={shownTint}>
                  {me.username}
                </StyledName>
              </span>
              : 미드 갈게요
            </div>
            <p className="mt-3 text-[11px] text-text-tertiary">
              입어 보는 모습은 나에게만 보여요. 산 상품은 로비의 다른 참가자와
              프로필 방문자에게도 보여요.
            </p>
          </section>

          {selected ? (
            <section className="space-y-3 rounded-lg bg-bg-secondary p-4">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-black text-text-primary">
                    {selected.name}
                  </span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-bold",
                      RARITY_STYLE[selected.rarity],
                    )}
                  >
                    {RARITY_LABEL[selected.rarity]}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-text-tertiary">
                  {SLOT_LABEL[selected.slot]}
                </p>
                <p className="mt-2 text-sm text-text-secondary">
                  {selected.description}
                </p>
              </div>
              {!stateByCode.get(selected.code)?.owned &&
                selected.discountPercent > 0 && (
                  <p className="text-xs text-text-secondary">
                    <span className="mr-1 line-through">
                      {selected.basePrice.toLocaleString()}
                    </span>
                    <span className="font-black text-red-400">
                      -{selected.discountPercent}% 할인 중
                    </span>
                  </p>
                )}
              {actionFor(selected, "lg")}
              {/* 보관함 — 가진 닉네임 글꼴은 여기서 언제든 색을 바꾼다(프로필 편집에도 있다) */}
              {tab === "OWNED" &&
                selected.slot === "NAME_STYLE" &&
                stateByCode.get(selected.code)?.owned && (
                  <div className="border-t border-bg-tertiary pt-3">
                    <p className="mb-2 text-xs font-semibold text-text-secondary">
                      닉네임 색
                    </p>
                    <NameTintPicker
                      code={selected.code}
                      tint={stateByCode.get(selected.code)?.tint}
                      username={me.username}
                    />
                  </div>
                )}
            </section>
          ) : (
            <section className="rounded-lg border border-dashed border-bg-tertiary p-4 text-center text-sm text-text-tertiary">
              왼쪽에서 상품을 누르면 여기서 입어 보고 살 수 있어요.
            </section>
          )}
        </aside>
      </div>

      {/* 구매 확인 */}
      <Modal
        isOpen={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title="구매 확인"
        size="sm"
      >
        {confirm && (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              <span className="font-black text-text-primary">
                「{confirm.name}」
              </span>
              을{" "}
              <span className="font-black text-amber-300">
                {confirm.price.toLocaleString()} {MEDAL_LABEL}
              </span>
              에 살까요? 사면 바로 {SLOT_LABEL[confirm.slot]}에 장착돼요.
            </p>
            <div className="rounded-lg bg-bg-tertiary/60 px-3 py-2 text-xs text-text-tertiary">
              남는 {MEDAL_LABEL}:{" "}
              <span className="font-bold text-text-secondary">
                {(balance - confirm.price).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                취소
              </Button>
              <Button
                onClick={() => purchase.mutate(confirm)}
                disabled={purchase.isPending}
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
