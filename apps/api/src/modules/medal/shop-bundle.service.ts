import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MedalReason } from "@nexus/database";
import { PrismaService } from "../prisma/prisma.service";
import { MedalService } from "./medal.service";
import {
  ShopCatalogService,
  discounted,
  type EffectiveShopItem,
} from "./shop-catalog.service";

/** 묶음 할인율 한도 */
const BUNDLE_PERCENT_MIN = 1;
const BUNDLE_PERCENT_MAX = 90;
/** 묶음 하나에 넣을 수 있는 상품 수 */
const BUNDLE_ITEMS_MIN = 2;
const BUNDLE_ITEMS_MAX = 12;

export interface BundleInput {
  name: string;
  description?: string | null;
  itemCodes: string[];
  percent: number;
  onSale?: boolean;
  sortOrder?: number;
}

/** 한 사람 기준 묶음 값 */
export interface BundleQuote {
  /** 아직 안 가진(살 수 있는) 상품 */
  remaining: string[];
  /** 이미 가진 상품 */
  owned: string[];
  /** 남은 상품의 할인 전 가격 합 */
  fullPrice: number;
  /** 낼 값 — 남은 상품 값에 묶음 할인, 따로 사는 값(기간 할인 반영)보다 비싸지 않게 */
  price: number;
  /** 상품별 몫 — 합이 price. 하나씩 환불할 때 이 값을 돌려준다 */
  allocations: Record<string, number>;
}

/**
 * 묶음 값 계산 — 이미 가진 상품은 빼고, 남은 상품의 할인 전 가격 합에 묶음 할인을 건다.
 * 기간 할인이 커서 따로 사는 게 더 싸면 그 값으로 판다(묶음이 손해가 되지 않게).
 * 상품별 몫은 할인 전 가격 비율로 나누고, 나머지는 마지막 상품에 얹는다.
 */
export function quoteBundle(
  itemCodes: string[],
  percent: number,
  items: Map<string, EffectiveShopItem>,
  ownedSet: Set<string>,
): BundleQuote {
  const valid = itemCodes.filter((c) => {
    const it = items.get(c);
    return it && !it.hidden;
  });
  const owned = valid.filter((c) => ownedSet.has(c));
  const remaining = valid.filter((c) => !ownedSet.has(c));
  const fullPrice = remaining.reduce((s, c) => s + items.get(c)!.basePrice, 0);
  const separate = remaining.reduce((s, c) => s + items.get(c)!.price, 0);
  const price = remaining.length
    ? Math.min(discounted(fullPrice, percent), separate)
    : 0;
  const allocations: Record<string, number> = {};
  let given = 0;
  remaining.forEach((c, i) => {
    const share =
      i === remaining.length - 1
        ? price - given
        : Math.floor((price * items.get(c)!.basePrice) / (fullPrice || 1));
    allocations[c] = share;
    given += share;
  });
  return { remaining, owned, fullPrice, price, allocations };
}

/**
 * 상점 묶음 상품(번들, 2026-11-24).
 *
 * - 사는 사람: 이미 가진 상품은 빼고 남은 것만 할인된 값에 한꺼번에 산다.
 *   원장은 한 줄(PURCHASE, sourceId = bundle:<id>)이고, 상품별 몫을 metadata.allocations 에 남긴다.
 *   그래서 운영자가 그중 하나만 환불하면 그 상품 몫만 돌려준다(ShopService.adminRefund).
 * - 관리자: 묶음 만들기·바꾸기(이름·설명·상품·할인율·판매·순서). 지우지 않고 판매를 내린다
 *   (산 기록의 원장이 묶음 id 를 가리킨다).
 * - 판매를 내린 개별 상품도 묶음 안에서는 팔 수 있다(묶음 전용 상품). 숨긴(삭제한) 상품은 빠진다.
 */
@Injectable()
export class ShopBundleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly medal: MedalService,
    private readonly catalog: ShopCatalogService,
  ) {}

  private async itemsMap() {
    const items = await this.catalog.getItems();
    return new Map(items.map((i) => [i.code, i]));
  }

  private async ownedSet(userId: string | null) {
    if (!userId) return new Set<string>();
    const rows = await this.prisma.userCosmetic.findMany({
      where: { userId },
      select: { itemCode: true },
    });
    return new Set(rows.map((r) => r.itemCode));
  }

  /** 상점 진열 — 판매 중인 묶음과 내 기준 값 */
  async listForUser(userId: string | null) {
    const [bundles, items, owned] = await Promise.all([
      this.prisma.shopBundle.findMany({
        where: { onSale: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      }),
      this.itemsMap(),
      this.ownedSet(userId),
    ]);
    return bundles
      .map((b) => {
        const q = quoteBundle(b.itemCodes, b.percent, items, owned);
        return {
          id: b.id,
          name: b.name,
          description: b.description,
          percent: b.percent,
          itemCodes: b.itemCodes.filter((c) => items.has(c)),
          ...q,
        };
      })
      .filter((b) => b.itemCodes.length > 0);
  }

  /** 묶음 사기 — expectedPrice 는 화면에서 본 값(다르면 409) */
  async purchase(userId: string, bundleId: string, expectedPrice?: number) {
    const bundle = await this.prisma.shopBundle.findUnique({
      where: { id: bundleId },
    });
    if (!bundle) throw new NotFoundException("없는 묶음이에요.");
    if (!bundle.onSale)
      throw new BadRequestException("지금은 팔지 않는 묶음이에요.");
    const [items, owned] = await Promise.all([
      this.itemsMap(),
      this.ownedSet(userId),
    ]);
    const q = quoteBundle(bundle.itemCodes, bundle.percent, items, owned);
    if (q.remaining.length === 0)
      throw new ConflictException("묶음의 상품을 이미 다 가지고 있어요.");
    if (expectedPrice !== undefined && expectedPrice !== q.price) {
      throw new ConflictException(
        `가격이 바뀌었어요 (지금 ${q.price.toLocaleString()}). 다시 확인해 주세요.`,
      );
    }
    // 같은 묶음을 여러 번 살 수 있다(환불·회수 뒤 남은 것만) — 회차 키
    const prev = await this.prisma.medalLedger.count({
      where: {
        userId,
        reason: MedalReason.PURCHASE,
        sourceId: `bundle:${bundleId}`,
      },
    });
    const key = `bundle:${userId}:${bundleId}:${prev}`;
    try {
      const entry = await this.prisma.$transaction(async (tx) => {
        const row = await this.medal.recordInTx(tx, {
          userId,
          amount: -q.price,
          reason: MedalReason.PURCHASE,
          idempotencyKey: key,
          sourceId: `bundle:${bundleId}`,
          metadata: {
            bundleId,
            bundleName: bundle.name,
            percent: bundle.percent,
            fullPrice: q.fullPrice,
            price: q.price,
            items: q.remaining,
            allocations: q.allocations,
          },
        });
        for (const code of q.remaining) {
          await tx.userCosmetic.create({
            data: { userId, itemCode: code, source: "PURCHASE", ledgerId: row.id },
          });
        }
        return row;
      });
      this.medal.announceBalance(userId, entry.balanceAfter);
      return {
        balance: entry.balanceAfter,
        bundleId,
        items: q.remaining,
        price: q.price,
      };
    } catch (err: any) {
      // 같은 순간 두 번 눌렀거나 그 사이 하나를 따로 샀다 — 통째로 되돌려졌다
      if (err?.code === "P2002")
        throw new ConflictException("이미 산 묶음이거나 그 사이 상품을 샀어요.");
      throw err;
    }
  }

  /* ───────── 관리자 ───────── */

  private async validate(input: BundleInput) {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException("묶음 이름을 적어 주세요.");
    if (
      !Number.isInteger(input.percent) ||
      input.percent < BUNDLE_PERCENT_MIN ||
      input.percent > BUNDLE_PERCENT_MAX
    ) {
      throw new BadRequestException(
        `할인율은 ${BUNDLE_PERCENT_MIN}~${BUNDLE_PERCENT_MAX}% 사이여야 해요.`,
      );
    }
    const codes = [...new Set(input.itemCodes)];
    if (codes.length < BUNDLE_ITEMS_MIN || codes.length > BUNDLE_ITEMS_MAX) {
      throw new BadRequestException(
        `상품은 ${BUNDLE_ITEMS_MIN}~${BUNDLE_ITEMS_MAX}개를 넣어 주세요.`,
      );
    }
    const items = await this.itemsMap();
    const unknown = codes.filter((c) => !items.has(c));
    if (unknown.length)
      throw new BadRequestException(`없는 상품: ${unknown.join(", ")}`);
    return { name, codes };
  }

  /** 관리자 목록 — 판매 내린 것까지, 판매 수·쓴 메달과 함께 */
  async adminList() {
    const [bundles, sales, items] = await Promise.all([
      this.prisma.shopBundle.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      }),
      this.prisma.medalLedger.groupBy({
        by: ["sourceId"],
        where: {
          reason: MedalReason.PURCHASE,
          sourceId: { startsWith: "bundle:" },
        },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.itemsMap(),
    ]);
    const bySource = new Map(sales.map((s) => [s.sourceId, s]));
    return bundles.map((b) => {
      const s = bySource.get(`bundle:${b.id}`);
      // 아무것도 안 가진 사람 기준 값
      const q = quoteBundle(b.itemCodes, b.percent, items, new Set());
      return {
        ...b,
        fullPrice: q.fullPrice,
        price: q.price,
        stats: { sold: s?._count._all ?? 0, medals: -(s?._sum.amount ?? 0) },
      };
    });
  }

  async create(adminId: string, input: BundleInput) {
    const { name, codes } = await this.validate(input);
    const row = await this.prisma.shopBundle.create({
      data: {
        name,
        description: input.description?.trim() ?? "",
        itemCodes: codes,
        percent: input.percent,
        onSale: input.onSale ?? true,
        sortOrder: input.sortOrder ?? 0,
        createdById: adminId,
      },
    });
    await this.audit(adminId, row.id, { op: "create", ...input });
    return row;
  }

  async update(adminId: string, id: string, patch: Partial<BundleInput>) {
    const before = await this.prisma.shopBundle.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("없는 묶음이에요.");
    // 상품·이름·할인율을 바꾸면 합친 값으로 다시 검사한다
    const merged: BundleInput = {
      name: patch.name ?? before.name,
      description: patch.description ?? before.description,
      itemCodes: patch.itemCodes ?? before.itemCodes,
      percent: patch.percent ?? before.percent,
    };
    const { name, codes } = await this.validate(merged);
    const row = await this.prisma.shopBundle.update({
      where: { id },
      data: {
        name,
        description: merged.description?.trim() ?? "",
        itemCodes: codes,
        percent: merged.percent,
        ...(patch.onSale !== undefined ? { onSale: patch.onSale } : {}),
        ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      },
    });
    await this.audit(adminId, id, { op: "update", before, patch });
    return row;
  }

  private async audit(adminId: string, id: string, details: object) {
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: "SHOP_BUNDLE",
        targetType: "SHOP_BUNDLE",
        targetId: id,
        details: details as object,
      },
    });
  }
}
