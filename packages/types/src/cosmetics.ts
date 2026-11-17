/**
 * 메달 상점 상품 목록 — 서버(구매 가격 검증)와 웹(진열·그림)이 함께 쓰는 원본.
 *
 * 가격·판매 여부는 여기 한 곳에서만 고친다. 그림·이름·설명은 웹의
 * `components/cosmetics/catalog.ts` 가 코드로 찾아 붙인다.
 * 코드(`code`)는 보유·장착 기록의 키라 한 번 정하면 바꾸지 않는다.
 * (관리자 상품 편집(Task 16)이 생기면 DB 로 옮긴다.)
 */

/**
 * 꾸미는 자리 — 자리마다 하나씩 장착한다.
 * - CARD_FRAME: 카드 장식 (로비 카드·호버 카드)
 * - AVATAR_FRAME: 아바타 테두리 장식
 * - NAME_STYLE: 닉네임 글꼴 (글꼴 + 색·효과 세트, Task 22)
 * DB 의 slot 은 문자열이라 자리를 더해도 마이그레이션이 필요 없다.
 */
export type CosmeticSlot = "CARD_FRAME" | "AVATAR_FRAME" | "NAME_STYLE";

export const COSMETIC_SLOTS: CosmeticSlot[] = [
  "CARD_FRAME",
  "AVATAR_FRAME",
  "NAME_STYLE",
];

export type CosmeticRarity = "STARTER" | "COMMON" | "PREMIUM" | "RARE";

export interface CosmeticShopItem {
  code: string;
  slot: CosmeticSlot;
  /** 메달 가격 */
  price: number;
  rarity: CosmeticRarity;
  /** 지금 살 수 있는가 — 내려도 이미 산 사람은 계속 쓴다 */
  onSale: boolean;
}

export const COSMETIC_SHOP_ITEMS: CosmeticShopItem[] = [
  // 카드 장식 (로비 참가자 카드)
  {
    code: "FX_SLIME",
    slot: "CARD_FRAME",
    price: 250,
    rarity: "STARTER",
    onSale: true,
  },
  {
    code: "FX_GHOST",
    slot: "CARD_FRAME",
    price: 250,
    rarity: "STARTER",
    onSale: true,
  },
  {
    code: "FX_SAKURA",
    slot: "CARD_FRAME",
    price: 450,
    rarity: "COMMON",
    onSale: true,
  },
  {
    code: "FX_FIRE",
    slot: "CARD_FRAME",
    price: 500,
    rarity: "COMMON",
    onSale: true,
  },
  {
    code: "FX_BATS",
    slot: "CARD_FRAME",
    price: 600,
    rarity: "COMMON",
    onSale: true,
  },
  {
    code: "FX_SWORD",
    slot: "CARD_FRAME",
    price: 900,
    rarity: "PREMIUM",
    onSale: true,
  },
  {
    code: "FX_LIGHTNING",
    slot: "CARD_FRAME",
    price: 1000,
    rarity: "PREMIUM",
    onSale: true,
  },
  {
    code: "FX_DRAGON",
    slot: "CARD_FRAME",
    price: 1800,
    rarity: "RARE",
    onSale: true,
  },
  // 아바타 장식 (프로필)
  {
    code: "AV_CAT_EARS",
    slot: "AVATAR_FRAME",
    price: 300,
    rarity: "STARTER",
    onSale: true,
  },
  {
    code: "AV_MOON",
    slot: "AVATAR_FRAME",
    price: 300,
    rarity: "STARTER",
    onSale: true,
  },
  {
    code: "AV_CROWN",
    slot: "AVATAR_FRAME",
    price: 450,
    rarity: "COMMON",
    onSale: true,
  },
  {
    code: "AV_HALO",
    slot: "AVATAR_FRAME",
    price: 500,
    rarity: "COMMON",
    onSale: true,
  },
  {
    code: "AV_FIRE_RING",
    slot: "AVATAR_FRAME",
    price: 600,
    rarity: "COMMON",
    onSale: true,
  },
  {
    code: "AV_BAT_WINGS",
    slot: "AVATAR_FRAME",
    price: 900,
    rarity: "PREMIUM",
    onSale: true,
  },
  {
    code: "AV_TWIN_SWORDS",
    slot: "AVATAR_FRAME",
    price: 1000,
    rarity: "PREMIUM",
    onSale: true,
  },
  {
    code: "AV_DRAGON",
    slot: "AVATAR_FRAME",
    price: 1800,
    rarity: "RARE",
    onSale: true,
  },
  // 닉네임 글꼴 — 자리가 작아 같은 등급 장식의 약 60% 가격 (2026-11-17)
  {
    code: "NM_INK",
    slot: "NAME_STYLE",
    price: 150,
    rarity: "STARTER",
    onSale: true,
  },
  {
    code: "NM_PIXEL",
    slot: "NAME_STYLE",
    price: 150,
    rarity: "STARTER",
    onSale: true,
  },
  {
    code: "NM_PEN",
    slot: "NAME_STYLE",
    price: 180,
    rarity: "STARTER",
    onSale: true,
  },
  {
    code: "NM_BRUSH",
    slot: "NAME_STYLE",
    price: 270,
    rarity: "COMMON",
    onSale: true,
  },
  {
    code: "NM_GOLD",
    slot: "NAME_STYLE",
    price: 360,
    rarity: "COMMON",
    onSale: true,
  },
  {
    code: "NM_NEON",
    slot: "NAME_STYLE",
    price: 540,
    rarity: "PREMIUM",
    onSale: true,
  },
  {
    code: "NM_RAINBOW",
    slot: "NAME_STYLE",
    price: 600,
    rarity: "PREMIUM",
    onSale: true,
  },
  {
    code: "NM_FLAME",
    slot: "NAME_STYLE",
    price: 1100,
    rarity: "RARE",
    onSale: true,
  },
];

export function findCosmeticShopItem(
  code: string,
): CosmeticShopItem | undefined {
  return COSMETIC_SHOP_ITEMS.find((item) => item.code === code);
}

/** 한 사람이 장착한 꾸미기 — 자리별 상품 코드 */
export type CosmeticLoadout = Partial<Record<CosmeticSlot, string>>;
