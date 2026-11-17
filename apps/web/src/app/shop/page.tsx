"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Medal, Sparkles } from "lucide-react";
import { PortraitParticipantCard } from "@/app/[game]/tournaments/[id]/lobby/_components/PortraitParticipantCard";
import { AvatarDecoration } from "@/components/cosmetics/avatar-effects";
import { StyledName } from "@/components/cosmetics/name-styles";
import {
  COSMETICS,
  MEDAL_LABEL,
  RARITY_LABEL,
  SLOT_LABEL,
  findCosmetic,
  type CosmeticItem,
} from "@/components/cosmetics/catalog";
import { LOADOUT_QUERY_KEY } from "@/components/cosmetics/useCosmeticLoadouts";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useAuthStore } from "@/stores/auth-store";
import { shopApi, type ShopItemState } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type ShopSlot = "CARD_FRAME" | "AVATAR_FRAME" | "NAME_STYLE";
const SLOTS: ShopSlot[] = ["CARD_FRAME", "AVATAR_FRAME", "NAME_STYLE"];
/** 진열 탭 — 자리별 상품 + 산 것만 모아 보는 보관함 */
type ShopTab = ShopSlot | "OWNED";

const RARITY_STYLE: Record<CosmeticItem["rarity"], string> = {
  STARTER: "bg-bg-elevated text-text-secondary",
  COMMON: "bg-sky-500/15 text-sky-300",
  PREMIUM: "bg-violet-500/20 text-violet-300",
  RARE: "bg-amber-500/20 text-amber-300",
};

const noop = () => {};
/** 미리보기 카드는 눌러도 아무 일 없게 — 로비 카드의 조작 버튼을 끈다 */
const PREVIEW_CARD_PROPS = {
  size: "lg" as const,
  isCurrentUserHost: false,
  isSelf: false,
  isFriend: true,
  isSent: false,
  addingFriend: null,
  setHoveredPlayer: noop,
  scheduleHoverClose: noop,
  cancelHoverClose: noop,
  handleAddFriend: noop,
  setKickTarget: noop,
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

  const [tab, setTab] = useState<ShopTab>("CARD_FRAME");
  // 입어 보는 중인 상품 — 자리별로 따로
  const [trying, setTrying] = useState<Partial<Record<ShopSlot, string>>>({});
  const [confirm, setConfirm] = useState<CosmeticItem | null>(null);

  const stateByCode = useMemo(() => {
    const map = new Map<string, ShopItemState>();
    data?.items.forEach((it) => map.set(it.code, it));
    return map;
  }, [data]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["shop"] });
    queryClient.invalidateQueries({ queryKey: ["medals"] });
    // 로비 카드·프로필이 들고 있는 장착 상태도 새로 읽게
    queryClient.invalidateQueries({ queryKey: [LOADOUT_QUERY_KEY] });
  };

  const purchase = useMutation({
    mutationFn: (code: string) => shopApi.purchase(code, true),
    onSuccess: (_res, code) => {
      const item = findCosmetic(code);
      addToast(`「${item?.name ?? code}」을 사서 바로 장착했어요`, "success");
      setConfirm(null);
      refresh();
    },
    onError: (err: any) => {
      addToast(
        err?.response?.data?.message || "사지 못했어요. 다시 시도해 주세요.",
        "error",
      );
    },
  });

  const equip = useMutation({
    mutationFn: ({ slot, code }: { slot: ShopSlot; code: string | null }) =>
      shopApi.equip(slot, code),
    onSuccess: refresh,
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

  const balance = data?.balance ?? 0;
  const loadout = data?.loadout ?? {};
  // 미리보기에 입힐 것: 고른 상품 > 장착한 상품
  const shownCard = trying.CARD_FRAME ?? loadout.CARD_FRAME;
  const shownAvatar = trying.AVATAR_FRAME ?? loadout.AVATAR_FRAME;
  const shownName = trying.NAME_STYLE ?? loadout.NAME_STYLE;
  const shownNameStyle = findCosmetic(shownName)?.nameStyle;
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
    trying.CARD_FRAME || trying.AVATAR_FRAME || trying.NAME_STYLE,
  );
  // 진열할 상품 — 보관함이면 산 것 전부(자리 순서대로), 아니면 그 자리 상품
  const shown = COSMETICS.filter((item) => stateByCode.has(item.code)).filter(
    (item) =>
      tab === "OWNED" ? stateByCode.get(item.code)!.owned : item.slot === tab,
  );
  const ownedCount = data?.items.filter((it) => it.owned).length ?? 0;

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-6">
      {/* 제목 + 잔액 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-text-primary">
            {MEDAL_LABEL} 상점
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            내전을 끝까지 하면 {MEDAL_LABEL}을 받아요. 로비 카드와 프로필을 꾸며
            보세요.
          </p>
        </div>
        {/* 잔액 — 누르면 메달 내역 전체 화면 */}
        <Link
          href="/shop/medals"
          title={`${MEDAL_LABEL} 내역 보기`}
          className="flex items-center gap-2 rounded-xl bg-amber-400/10 px-4 py-2.5 transition-colors hover:bg-amber-400/15"
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

      {/* 내 모습 미리보기 */}
      <section className="flex flex-col gap-6 rounded-2xl bg-bg-secondary p-5 sm:flex-row sm:items-center">
        <div className="w-[200px] flex-shrink-0">
          <div className="mb-2 text-xs font-bold text-text-tertiary">
            로비 카드
          </div>
          <PortraitParticipantCard
            {...PREVIEW_CARD_PROPS}
            p={me}
            frameCode={shownCard}
            avatarFrameCode={shownAvatar}
            nameStyleCode={shownName ?? null}
          />
        </div>
        <div className="flex-shrink-0">
          <div className="mb-2 text-xs font-bold text-text-tertiary">
            프로필 아바타·닉네임
          </div>
          <div className="flex h-[210px] w-[200px] flex-col items-center justify-center gap-3">
            <AvatarDecoration
              code={findCosmetic(shownAvatar)?.avatarEffect}
              size={96}
            >
              <div className="relative h-24 w-24 overflow-hidden rounded-full bg-bg-tertiary">
                <Image
                  src={avatarSrc}
                  alt=""
                  fill
                  unoptimized
                  className="object-cover"
                />
              </div>
            </AvatarDecoration>
            {/* 프로필 이름 크기로 닉네임 글꼴을 입혀 본다 */}
            <div className="max-w-full truncate text-xl font-black text-text-primary">
              <StyledName code={shownNameStyle}>{me.username}</StyledName>
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1 text-sm text-text-secondary">
          {isTrying ? (
            <>
              <div className="flex items-center gap-1.5 font-bold text-text-primary">
                <Sparkles className="h-4 w-4 text-amber-300" />
                입어 보는 중
              </div>
              <p className="mt-1">
                상품을 누르면 여기 입혀 봐요. 사기 전엔 나에게만 보여요.
              </p>
              <button
                type="button"
                onClick={() => setTrying({})}
                className="mt-3 rounded-lg bg-bg-tertiary px-3 py-1.5 text-xs font-bold text-text-secondary hover:bg-bg-elevated"
              >
                장착한 모습으로 되돌리기
              </button>
            </>
          ) : (
            <>
              <div className="font-bold text-text-primary">지금 내 모습</div>
              <p className="mt-1">
                상품을 누르면 여기에 입혀 볼 수 있어요. 산 상품은 로비의 다른
                참가자와 프로필 방문자에게도 보여요.
              </p>
            </>
          )}
        </div>
      </section>

      {/* 자리 탭 */}
      <div className="flex flex-wrap gap-2">
        {[...SLOTS, "OWNED" as const].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "h-10 rounded-lg px-4 text-sm font-black transition-colors",
              tab === t
                ? "bg-accent-primary text-accent-on"
                : "bg-bg-tertiary/60 text-text-secondary hover:bg-bg-tertiary",
            )}
          >
            {t === "OWNED" ? `보관함 ${ownedCount}` : SLOT_LABEL[t]}
          </button>
        ))}
      </div>

      {/* 상품 진열 */}
      {isLoading ? (
        <div className="py-20 text-center text-sm text-text-tertiary">
          불러오는 중…
        </div>
      ) : tab === "OWNED" && shown.length === 0 ? (
        <div className="rounded-xl bg-bg-secondary py-16 text-center text-sm text-text-tertiary">
          아직 산 꾸미기가 없어요.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {shown.map((item, i) => {
            const state = stateByCode.get(item.code)!;
            const slot = item.slot as ShopSlot;
            const selected = trying[slot] === item.code;
            const short = balance < item.price;
            return (
              <div
                key={item.code}
                className={cn(
                  "flex flex-col gap-3 rounded-xl p-4 transition-colors",
                  selected
                    ? "bg-accent-primary/10 ring-1 ring-inset ring-accent-primary/50"
                    : "bg-bg-tertiary/40",
                )}
              >
                {/* 누르면 위 미리보기에 입혀 본다 */}
                <button
                  type="button"
                  onClick={() =>
                    setTrying((t) => ({
                      ...t,
                      [slot]: selected ? undefined : item.code,
                    }))
                  }
                  className="text-left"
                  aria-label={`${item.name} 입어 보기`}
                >
                  {item.slot === "NAME_STYLE" ? (
                    // 닉네임 글꼴 — 프로필·로비 카드·채팅 크기로 함께 보여 준다
                    <div className="flex h-[180px] flex-col items-center justify-center gap-3 rounded-lg bg-bg-secondary/60 px-2">
                      <div className="max-w-full truncate text-2xl font-black text-text-primary">
                        <StyledName code={item.nameStyle}>
                          {me.username}
                        </StyledName>
                      </div>
                      <div className="max-w-full truncate rounded-md bg-bg-tertiary/70 px-2 py-1 text-sm font-black text-text-primary">
                        <StyledName code={item.nameStyle}>
                          {me.username}
                        </StyledName>
                      </div>
                      <div className="max-w-full truncate text-[13px] text-text-secondary">
                        <span className="font-bold text-text-primary">
                          <StyledName code={item.nameStyle}>
                            {me.username}
                          </StyledName>
                        </span>
                        : 다음 판 미드 갑니다
                      </div>
                    </div>
                  ) : item.slot === "AVATAR_FRAME" ? (
                    <div className="flex h-[180px] items-center justify-center">
                      <AvatarDecoration code={item.avatarEffect} size={88}>
                        <div className="relative h-[88px] w-[88px] overflow-hidden rounded-full bg-bg-tertiary">
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
                  ) : (
                    <div className="mx-auto w-[180px]">
                      <PortraitParticipantCard
                        {...PREVIEW_CARD_PROPS}
                        p={{ ...me, id: `preview-${i}` }}
                        frameCode={item.code}
                        avatarFrameCode={shownAvatar}
                        nameStyleCode={shownName ?? null}
                      />
                    </div>
                  )}
                </button>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-black text-text-primary">
                      {item.name}
                    </span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-bold",
                        RARITY_STYLE[item.rarity],
                      )}
                    >
                      {RARITY_LABEL[item.rarity]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-text-tertiary">
                    {tab === "OWNED" && (
                      <span className="mr-1 font-bold text-text-secondary">
                        {SLOT_LABEL[item.slot]} ·
                      </span>
                    )}
                    {item.description}
                  </p>
                </div>

                <div className="mt-auto">
                  {state.owned ? (
                    state.equipped ? (
                      <button
                        type="button"
                        disabled={equip.isPending}
                        onClick={() =>
                          equip.mutate({
                            slot: item.slot as ShopSlot,
                            code: null,
                          })
                        }
                        className="group/eq flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-accent-success/60 text-sm font-black text-white transition-colors hover:bg-bg-elevated hover:text-text-secondary"
                      >
                        <span className="flex items-center gap-1.5 group-hover/eq:hidden">
                          <Check className="h-4 w-4" strokeWidth={3} />
                          장착 중
                        </span>
                        <span className="hidden group-hover/eq:inline">
                          장착 해제
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={equip.isPending}
                        onClick={() =>
                          equip.mutate({
                            slot: item.slot as ShopSlot,
                            code: item.code,
                          })
                        }
                        className="flex h-10 w-full items-center justify-center rounded-lg bg-bg-elevated text-sm font-black text-text-primary transition-colors hover:bg-accent-primary hover:text-accent-on"
                      >
                        장착하기
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      disabled={short}
                      onClick={() => setConfirm(item)}
                      className={cn(
                        "flex h-10 w-full items-center justify-center gap-1.5 rounded-lg text-sm font-black transition-colors",
                        short
                          ? "cursor-not-allowed bg-bg-elevated/60 text-text-tertiary"
                          : "bg-accent-primary text-accent-on hover:brightness-110",
                      )}
                    >
                      <Medal className="h-4 w-4" />
                      {item.price.toLocaleString()} {MEDAL_LABEL}
                      {short && (
                        <span className="ml-1 text-xs font-bold">
                          · {(item.price - balance).toLocaleString()} 부족
                        </span>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
                onClick={() => purchase.mutate(confirm.code)}
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
