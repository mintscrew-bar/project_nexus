import { Injectable } from "@nestjs/common";
import {
  COSMETIC_SHOP_ITEMS,
  COSMETIC_SLOTS,
  type CosmeticMedia,
  type CosmeticRarity,
  type CosmeticShopItem,
  type CosmeticSlot,
  type ShopCatalogEntry,
} from "@nexus/types";
import { PrismaService } from "../prisma/prisma.service";

/** 상점에 실제로 걸리는 상품 — 원본 + 관리자 덮어쓰기 + 지금 걸린 할인 */
export interface EffectiveShopItem extends CosmeticShopItem {
  /** 할인 전 가격(원본 또는 관리자가 바꾼 값) */
  basePrice: number;
  /** 할인율(%) — 없으면 0 */
  discountPercent: number;
  /** 걸린 할인 id·끝나는 시각 — 없으면 null */
  discountId: string | null;
  discountEndsAt: Date | null;
  /** 진열·구매 불가(관리자 "삭제") — 이미 산 사람은 계속 쓴다 */
  hidden: boolean;
  /** 관리자가 바꾼 이름·설명 — null 이면 화면의 기본 문구를 쓴다 */
  name: string | null;
  description: string | null;
  sortOrder: number;
  /** 관리자가 추가한 상품인가 (상점 관리 2단계) */
  custom: boolean;
  /** 그림을 빌려 쓸 기존 상품 코드 (custom 전용) */
  baseCode: string | null;
  /** 올린 파일 (custom 전용) */
  media: CosmeticMedia | null;
}

export const RARITIES: CosmeticRarity[] = [
  "STARTER",
  "COMMON",
  "PREMIUM",
  "RARE",
];

/** 관리자가 추가한 상품은 코드 상품 뒤에 진열한다(순서를 따로 안 정했을 때) */
const CUSTOM_SORT_BASE = 1000;

/** 할인 적용 가격 — 1 메달 아래로는 내리지 않는다 */
export function discounted(price: number, percent: number): number {
  if (percent <= 0) return price;
  return Math.max(1, Math.round((price * (100 - percent)) / 100));
}

/**
 * 상점 상품표 (관리자 상점 관리 1·2단계, 2026-11-19~20).
 *
 * 상품은 두 갈래다.
 * - 코드 상품: 그림·자리·기본 가격을 코드(@nexus/types COSMETIC_SHOP_ITEMS)가 원본으로 갖는다.
 * - 관리자 상품(ShopCustomItem): 관리자 화면에서 추가한 상품. 그림은 기존 상품을 빌리거나 올린 파일.
 * 둘 다 관리자가 바꾼 값(이름·설명·가격·등급·판매·숨김·순서)을 ShopItemOverride 에 덮어써 둔다.
 * 기간 할인(ShopDiscount)은 지금 시각에 걸린 것 중 가장 큰 할인 하나만 적용한다.
 * 상점 진열·구매·장착·관리자 화면이 모두 이 표를 쓴다 — 보이는 가격과 깎이는 가격이 어긋나지 않게.
 */
@Injectable()
export class ShopCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async getItems(now = new Date()): Promise<EffectiveShopItem[]> {
    const [overrides, discounts, customs] = await Promise.all([
      this.prisma.shopItemOverride.findMany(),
      this.prisma.shopDiscount.findMany({
        where: { active: true, startsAt: { lte: now }, endsAt: { gt: now } },
      }),
      this.prisma.shopCustomItem.findMany({ orderBy: { createdAt: "asc" } }),
    ]);
    const byCode = new Map(overrides.map((o) => [o.code, o]));

    // 원본 상품표 — 코드 상품 + 관리자 상품(자리·등급이 이상한 줄은 건너뛴다)
    const originals: Array<
      CosmeticShopItem & {
        index: number;
        custom: boolean;
        name: string | null;
        description: string | null;
        baseCode: string | null;
        media: CosmeticMedia | null;
      }
    > = [
      ...COSMETIC_SHOP_ITEMS.map((item, index) => ({
        ...item,
        index,
        custom: false,
        name: null,
        description: null,
        baseCode: null,
        media: null,
      })),
      ...customs
        .filter(
          (c) =>
            COSMETIC_SLOTS.includes(c.slot as CosmeticSlot) &&
            RARITIES.includes(c.rarity as CosmeticRarity),
        )
        .map((c, i) => ({
          code: c.code,
          slot: c.slot as CosmeticSlot,
          price: c.price,
          rarity: c.rarity as CosmeticRarity,
          onSale: c.onSale,
          index: CUSTOM_SORT_BASE + i,
          custom: true,
          name: c.name,
          description: c.description || null,
          baseCode: c.baseCode,
          media: c.posterUrl
            ? { video: c.videoUrl, mp4: c.mp4Url, poster: c.posterUrl }
            : null,
        })),
    ];

    const items = originals.map(({ index, ...item }) => {
      const o = byCode.get(item.code);
      const basePrice = o?.price ?? item.price;
      // 이 상품에 걸린 할인 중 가장 큰 것(상품 목록이 비면 전체 할인)
      const best = discounts
        .filter(
          (d) => d.itemCodes.length === 0 || d.itemCodes.includes(item.code),
        )
        .sort((a, b) => b.percent - a.percent)[0];
      const rarity =
        o?.rarity && RARITIES.includes(o.rarity as CosmeticRarity)
          ? (o.rarity as CosmeticRarity)
          : item.rarity;
      return {
        ...item,
        rarity,
        onSale: o?.onSale ?? item.onSale,
        hidden: o?.hidden ?? false,
        name: o?.name ?? item.name,
        description: o?.description ?? item.description,
        sortOrder: o?.sortOrder ?? index,
        basePrice,
        price: discounted(basePrice, best?.percent ?? 0),
        discountPercent: best?.percent ?? 0,
        discountId: best?.id ?? null,
        discountEndsAt: best?.endsAt ?? null,
      } satisfies EffectiveShopItem;
    });
    return items.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async find(code: string, now = new Date()) {
    const items = await this.getItems(now);
    return items.find((i) => i.code === code) ?? null;
  }

  /**
   * 상품을 그리는 데 필요한 정의 — 로그인 없이 누구나(로비 카드·프로필이 남의 장식을 그린다).
   * 숨긴 상품도 넣는다 — 이미 산 사람이 계속 끼고 다니니까.
   */
  async getPublicCatalog(): Promise<ShopCatalogEntry[]> {
    const items = await this.getItems();
    return items.map((i) => ({
      code: i.code,
      slot: i.slot,
      rarity: i.rarity,
      price: i.price,
      name: i.name,
      description: i.description,
      custom: i.custom,
      baseCode: i.baseCode,
      media: i.media,
    }));
  }
}
