import { Injectable } from "@nestjs/common";
import {
  COSMETIC_SHOP_ITEMS,
  type CosmeticRarity,
  type CosmeticShopItem,
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
}

const RARITIES: CosmeticRarity[] = ["STARTER", "COMMON", "PREMIUM", "RARE"];

/** 할인 적용 가격 — 1 메달 아래로는 내리지 않는다 */
export function discounted(price: number, percent: number): number {
  if (percent <= 0) return price;
  return Math.max(1, Math.round((price * (100 - percent)) / 100));
}

/**
 * 상점 상품표 (관리자 상점 관리 1단계, 2026-11-19).
 *
 * 상품의 그림·자리·기본 가격은 코드(@nexus/types COSMETIC_SHOP_ITEMS)가 원본이고,
 * 관리자가 바꾼 값(이름·설명·가격·등급·판매·숨김·순서)은 ShopItemOverride 에 덮어써 둔다.
 * 기간 할인(ShopDiscount)은 지금 시각에 걸린 것 중 가장 큰 할인 하나만 적용한다.
 * 상점 진열·구매·관리자 화면이 모두 이 표를 쓴다 — 보이는 가격과 깎이는 가격이 어긋나지 않게.
 */
@Injectable()
export class ShopCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async getItems(now = new Date()): Promise<EffectiveShopItem[]> {
    const [overrides, discounts] = await Promise.all([
      this.prisma.shopItemOverride.findMany(),
      this.prisma.shopDiscount.findMany({
        where: { active: true, startsAt: { lte: now }, endsAt: { gt: now } },
      }),
    ]);
    const byCode = new Map(overrides.map((o) => [o.code, o]));
    const items = COSMETIC_SHOP_ITEMS.map((item, index) => {
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
        name: o?.name ?? null,
        description: o?.description ?? null,
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
}
