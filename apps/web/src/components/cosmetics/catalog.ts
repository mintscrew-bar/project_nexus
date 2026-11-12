/**
 * 꾸미기 상품 카탈로그 (메달 상점 1단계 — docs/features/RETENTION_SYSTEM_SPEC.md 7절).
 *
 * 지금은 화면 쪽 정의만 있다. 가격·판매 상태의 최종 원본은 나중에 DB(ShopItem)로
 * 옮기고, 여기에는 "코드 → 어떻게 그리는가"만 남긴다. 코드(`code`)는 DB 와 같은
 * 키를 쓰므로 한 번 정하면 바꾸지 않는다.
 *
 * 위치: Tailwind 가 `src/components` 는 읽지만 `src/lib` 은 읽지 않는다. 여기 적힌
 * 클래스 문자열이 CSS 로 생성되려면 이 파일이 components 아래에 있어야 한다.
 *
 * 색 원칙
 * - 원색·형광 금지 (2026-11-12 로비 피드백 "형광이라 눈 아프다"). 채도를 한 톤 낮춘다.
 * - 테두리는 카드 **둘레 전체**를 감싼다. 왼쪽 막대 같은 한쪽 강조는 쓰지 않는다(CLAUDE.md).
 * - 움직이는 상품은 `prefers-reduced-motion` 에서 멈춘다(globals.css).
 */

import type { AvatarEffectCode } from "./avatar-effects";
import type { CosmeticEffectCode } from "./effects";

/** 화면에 보이는 재화 이름 — 이름을 바꾸면 여기 한 곳만 고친다 */
export const MEDAL_LABEL = "메달";

/**
 * 꾸미는 자리 — 자리마다 상품을 따로 판다(2026-11-12). 같은 자리에는 하나만 장착한다.
 * - CARD_FRAME: 로비 참가자 카드 장식
 * - AVATAR_FRAME: 프로필 아바타 장식
 * - NAME_COLOR: 닉네임 색 (1단계 상품 없음)
 */
export type CosmeticSlot = "CARD_FRAME" | "AVATAR_FRAME" | "NAME_COLOR";

export const SLOT_LABEL: Record<CosmeticSlot, string> = {
  CARD_FRAME: "카드 장식",
  AVATAR_FRAME: "아바타 장식",
  NAME_COLOR: "닉네임 색",
};
export type CosmeticRarity = "STARTER" | "COMMON" | "PREMIUM" | "RARE";

export interface CosmeticItem {
  code: string;
  slot: CosmeticSlot;
  name: string;
  description: string;
  price: number;
  rarity: CosmeticRarity;
  /**
   * CARD_FRAME: 카드를 감싸는 바깥 틀(3px)의 바탕 (AVATAR_FRAME 은 비운다)
   * NAME_COLOR: 닉네임 글자에 붙는 클래스
   */
  className: string;
  /**
   * CARD_FRAME 전용 — 틀 안, 카드 뒤에 깔리는 움직이는 층. 카드가 위를 덮으므로
   * 테두리 3px 띠에서만 보인다(회전하는 빛, 지나가는 반짝임 등).
   */
  layerClassName?: string;
  /** CARD_FRAME 전용 — 초상화 위에서 움직이는 장식 (effects.tsx) */
  effect?: CosmeticEffectCode;
  /** AVATAR_FRAME 전용 — 아바타 둘레 장식 (avatar-effects.tsx) */
  avatarEffect?: AvatarEffectCode;
}

export const RARITY_LABEL: Record<CosmeticRarity, string> = {
  STARTER: "입문",
  COMMON: "일반",
  PREMIUM: "고급",
  RARE: "희귀",
};

/**
 * 상품 원칙 (2026-11-12)
 * - **모든 상품은 움직인다.** 색만 바꾸는 상품은 살 이유가 약하다.
 * - 테두리 색 바꾸기를 넘어, 카드 위에 **캐릭터·연출이 산다** — 픽셀 검이 휘두르고
 *   박쥐가 날아다니는 식. 픽셀 그림과 벡터 그림을 섞어 종류를 다양하게 한다.
 * - 장식은 초상화 칸 안에서만 움직여 이름·티어·준비 띠는 가리지 않는다.
 * 그림·움직임 정의는 effects.tsx 와 globals.css 의 `.cfx-*`.
 */
export const COSMETICS: CosmeticItem[] = [
  // ── 카드 장식 (로비) ──
  {
    code: "FX_SLIME",
    slot: "CARD_FRAME",
    name: "통통 슬라임",
    description:
      "큰 슬라임이 높이 뛰어 철퍽 착지하면 물방울이 튀고, 새끼가 뒤를 쫓는다",
    price: 250,
    rarity: "STARTER",
    className: "bg-[#2f6b3a]",
    effect: "slime",
  },
  {
    code: "FX_GHOST",
    slot: "CARD_FRAME",
    name: "꼬마 유령",
    description: "유령이 초상화를 휘젓다가 화면 앞으로 확 다가와 놀래킨다",
    price: 250,
    rarity: "STARTER",
    className: "bg-[#5b6478]",
    effect: "ghost",
  },
  {
    code: "FX_SAKURA",
    slot: "CARD_FRAME",
    name: "벚꽃 흩날림",
    description: "꽃잎 14장이 바람에 크게 흔들리며 쏟아진다",
    price: 450,
    rarity: "COMMON",
    className: "bg-[#b56a86]",
    effect: "sakura",
  },
  {
    code: "FX_FIRE",
    slot: "CARD_FRAME",
    name: "픽셀 화염",
    description: "픽셀 불길이 초상화 아래를 집어삼키고 불씨가 솟구친다",
    price: 500,
    rarity: "COMMON",
    className: "bg-[#7a2a12]",
    effect: "fire",
  },
  {
    code: "FX_BATS",
    slot: "CARD_FRAME",
    name: "박쥐 떼",
    description: "붉은 눈 박쥐 6마리가 양쪽에서 출렁이며 쏟아진다",
    price: 600,
    rarity: "COMMON",
    className: "bg-[#3b2a57]",
    effect: "bats",
  },
  {
    code: "FX_SWORD",
    slot: "CARD_FRAME",
    name: "전설의 검",
    description: "큰 검이 초상화를 가로질러 베면 화면이 번쩍이고 불꽃이 튄다",
    price: 900,
    rarity: "PREMIUM",
    className: "bg-slate-400/80",
    layerClassName: "cosmetic-sheen",
    effect: "sword",
  },
  {
    code: "FX_LIGHTNING",
    slot: "CARD_FRAME",
    name: "천둥번개",
    description: "먹구름 아래 굵은 번개 세 줄기가 연달아 내리꽂힌다",
    price: 1000,
    rarity: "PREMIUM",
    className: "bg-[#1e2f5c]",
    layerClassName: "cosmetic-pulse",
    effect: "lightning",
  },
  {
    code: "FX_DRAGON",
    slot: "CARD_FRAME",
    name: "흑룡",
    description: "수묵화 흑룡이 한지 바탕을 번지며 초상화를 헤엄쳐 지나간다",
    price: 1800,
    rarity: "RARE",
    className: "bg-[#7a561a]",
    layerClassName: "cosmetic-orbit-gold",
    effect: "dragon",
  },
  // ── 아바타 장식 (프로필) ──
  {
    code: "AV_CAT_EARS",
    slot: "AVATAR_FRAME",
    name: "고양이 귀",
    description: "치즈 고양이 귀가 쫑긋거리고 꼬리가 살랑인다",
    price: 300,
    rarity: "STARTER",
    className: "",
    avatarEffect: "cat_ears",
  },
  {
    code: "AV_MOON",
    slot: "AVATAR_FRAME",
    name: "공전하는 달",
    description: "초승달이 아바타 둘레를 돌고 별빛이 번갈아 반짝인다",
    price: 300,
    rarity: "STARTER",
    className: "",
    avatarEffect: "moon",
  },
  {
    code: "AV_CROWN",
    slot: "AVATAR_FRAME",
    name: "반짝 왕관",
    description: "비스듬히 얹힌 픽셀 왕관이 둥실거리고 보석이 반짝인다",
    price: 450,
    rarity: "COMMON",
    className: "",
    avatarEffect: "crown",
  },
  {
    code: "AV_HALO",
    slot: "AVATAR_FRAME",
    name: "천사 고리",
    description: "머리 위 금빛 고리가 떠다니고 둘레에 별빛이 깜빡인다",
    price: 500,
    rarity: "COMMON",
    className: "",
    avatarEffect: "halo",
  },
  {
    code: "AV_FIRE_RING",
    slot: "AVATAR_FRAME",
    name: "불꽃 고리",
    description: "아바타 둘레에서 픽셀 불꽃 12개가 일렁이며 돈다",
    price: 600,
    rarity: "COMMON",
    className: "",
    avatarEffect: "fire_ring",
  },
  {
    code: "AV_BAT_WINGS",
    slot: "AVATAR_FRAME",
    name: "박쥐 날개",
    description: "아바타 뒤로 펼친 박쥐 날개가 퍼덕인다",
    price: 900,
    rarity: "PREMIUM",
    className: "",
    avatarEffect: "bat_wings",
  },
  {
    code: "AV_TWIN_SWORDS",
    slot: "AVATAR_FRAME",
    name: "교차 검",
    description: "엇갈린 두 검이 맞부딪칠 때마다 불꽃이 튀고 빛이 번진다",
    price: 1000,
    rarity: "PREMIUM",
    className: "",
    avatarEffect: "twin_swords",
  },
  {
    code: "AV_DRAGON",
    slot: "AVATAR_FRAME",
    name: "휘감는 흑룡",
    description: "한지 고리 위로 수묵화 흑룡이 아바타를 휘감아 돈다",
    price: 1800,
    rarity: "RARE",
    className: "",
    avatarEffect: "dragon_orbit",
  },
];

export function findCosmetic(code?: string | null): CosmeticItem | undefined {
  if (!code) return undefined;
  return COSMETICS.find((item) => item.code === code);
}
