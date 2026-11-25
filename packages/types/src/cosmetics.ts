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
 * - PROFILE_BANNER: 프로필 배경 — 움직이는 원작 일러스트. 장착하면 올린 배경 이미지 대신 보이고,
 *   해제하면 올린 이미지가 다시 보인다(이미지는 지우지 않는다)
 * DB 의 slot 은 문자열이라 자리를 더해도 마이그레이션이 필요 없다.
 */
export type CosmeticSlot =
  "CARD_FRAME" | "AVATAR_FRAME" | "NAME_STYLE" | "PROFILE_BANNER";

export const COSMETIC_SLOTS: CosmeticSlot[] = [
  "CARD_FRAME",
  "AVATAR_FRAME",
  "NAME_STYLE",
  "PROFILE_BANNER",
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
  { code: "FX_EMBER_KNIGHT", slot: "CARD_FRAME", price: 2000, rarity: "RARE", onSale: true },
  {
    code: "FX_LUNAR_PHASES",
    slot: "CARD_FRAME",
    price: 1200,
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
    price: 400,
    rarity: "STARTER",
    onSale: true,
  },
  {
    code: "AV_LUNAR_PHASES",
    slot: "AVATAR_FRAME",
    price: 1800,
    rarity: "RARE",
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
  {
    code: "NM_SLIME",
    slot: "NAME_STYLE",
    price: 180,
    rarity: "STARTER",
    onSale: true,
  },
  {
    code: "NM_SUNSET",
    slot: "NAME_STYLE",
    price: 360,
    rarity: "COMMON",
    onSale: true,
  },
  {
    code: "NM_MOON",
    slot: "NAME_STYLE",
    price: 360,
    rarity: "COMMON",
    onSale: true,
  },
  {
    code: "NM_GHOST",
    slot: "NAME_STYLE",
    price: 540,
    rarity: "PREMIUM",
    onSale: true,
  },
  {
    code: "NM_FROST",
    slot: "NAME_STYLE",
    price: 600,
    rarity: "PREMIUM",
    onSale: true,
  },
  {
    code: "NM_THUNDER",
    slot: "NAME_STYLE",
    price: 1100,
    rarity: "RARE",
    onSale: true,
  },
  // 프로필 배경 — 프로필 전체를 차지하고 제작비가 가장 커서 최상위 가격 (2026-11-18)
  {
    code: "BN_INK_SWORDSMAN",
    slot: "PROFILE_BANNER",
    price: 2500,
    rarity: "RARE",
    onSale: true,
  },
  { code: "BN_EMBER_KNIGHT", slot: "PROFILE_BANNER", price: 2500, rarity: "RARE", onSale: true },
];

export function findCosmeticShopItem(
  code: string,
): CosmeticShopItem | undefined {
  return COSMETIC_SHOP_ITEMS.find((item) => item.code === code);
}

/**
 * 닉네임 글꼴에 산 사람이 고른 색 (2026-11-20).
 * 원래 색에서 색상을 몇 도 돌리고(hue), 채도(saturation %)·밝기(brightness %)를 얼마로 할지.
 */
export interface NameTint {
  /** 색상 회전 0~359도 (0 = 원래 색) */
  hue: number;
  /** 채도 % 0~200 (100 = 원래) */
  saturation: number;
  /** 밝기 % 50~150 (100 = 원래) */
  brightness: number;
  /**
   * 글자 굵기 100~900 (2026-11-25) — 굵기 단계가 실제로 있는 글꼴만 쓴다. 없으면 글꼴 기본 굵기.
   */
  weight?: number | null;
}

export const NAME_TINT_LIMITS = {
  hue: [0, 359],
  saturation: [0, 200],
  brightness: [50, 150],
  weight: [100, 900],
} as const;

/** 원래 색 그대로인가 */
export function isDefaultNameTint(t: NameTint | null | undefined): boolean {
  return (
    !t ||
    (t.hue === 0 &&
      t.saturation === 100 &&
      t.brightness === 100 &&
      t.weight == null)
  );
}

/**
 * 한 사람이 장착한 꾸미기 — 자리별 상품 코드.
 * `nameTint` 는 장착한 닉네임 글꼴에 그 사람이 고른 색 — 안 골랐으면 없다.
 */
export type CosmeticLoadout = Partial<Record<CosmeticSlot, string>> & {
  nameTint?: NameTint;
};

/**
 * 관리자가 올린 상품 파일 (상점 관리 2단계).
 * 영상이 없으면 정지 그림(poster)만 쓴다. 아바타 장식은 투명 WebM + 투명 WebP.
 */
export interface CosmeticMedia {
  /** WebM 영상 — 아바타 장식은 VP9+알파(투명) */
  video: string | null;
  /** H.264 MP4 — 사파리용(선택). 아바타 장식은 쓰지 않는다 */
  mp4: string | null;
  /** 정지 그림(WebP·PNG) — 영상 첫 장면·사파리 아바타 대체·움직임 끔 설정 */
  poster: string;
}

/**
 * 자리별 파일 규격(px) — 이 크기로 만들어 올린다. 화면은 이 비율로 칸을 잡는다.
 * 아바타 장식은 가운데 지름 192px 원이 아바타 자리(장식 상자 = 아바타 지름 × 2).
 */
export const COSMETIC_MEDIA_SIZE: Record<
  Exclude<CosmeticSlot, "NAME_STYLE">,
  [number, number]
> = {
  CARD_FRAME: [440, 420],
  AVATAR_FRAME: [384, 384],
  PROFILE_BANNER: [1536, 640],
};

/**
 * 상품을 그리는 데 필요한 정의 — GET /shop/catalog 가 준다(로그인 없이).
 * 코드 상품은 관리자가 바꾼 이름·설명만, 관리자가 추가한 상품(custom)은 그림까지 담는다.
 */
export interface ShopCatalogEntry {
  code: string;
  slot: CosmeticSlot;
  rarity: CosmeticRarity;
  price: number;
  /** 관리자가 바꾼 이름·설명 — 코드 상품은 null 이면 화면 기본 문구 */
  name: string | null;
  description: string | null;
  /** 관리자가 추가한 상품인가 */
  custom: boolean;
  /** 그림을 빌려 쓸 기존 상품 코드 (custom 전용) */
  baseCode: string | null;
  /** 올린 파일 (custom 전용) */
  media: CosmeticMedia | null;
}
