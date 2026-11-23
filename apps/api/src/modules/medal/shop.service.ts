import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MedalReason } from "@nexus/database";
import {
  COSMETIC_SLOTS,
  NAME_TINT_LIMITS,
  isDefaultNameTint,
  type CosmeticLoadout,
  type NameTint,
  type CosmeticSlot,
} from "@nexus/types";
import { PrismaService } from "../prisma/prisma.service";
import { MedalService } from "./medal.service";
import { ShopCatalogService } from "./shop-catalog.service";

/**
 * 묶음 원장 줄에서 한 상품의 몫 — 묶음 구매가 아니거나 몫이 없으면 null.
 * (ShopBundleService.purchase 가 metadata.allocations 에 상품별 몫을 남긴다)
 */
function bundleAllocation(
  ledger: { sourceId: string | null; metadata: unknown },
  itemCode: string,
): number | null {
  if (!ledger.sourceId?.startsWith("bundle:")) return null;
  const alloc = (ledger.metadata as { allocations?: Record<string, number> })
    ?.allocations;
  const v = alloc?.[itemCode];
  return typeof v === "number" ? v : null;
}

/** 저장된 세 값 → 고른 색. 아무것도 안 골랐으면 null (빈 값은 원래 값으로 채운다) */
function toTint(row: {
  hue: number | null;
  saturation: number | null;
  brightness: number | null;
}): NameTint | null {
  if (row.hue == null && row.saturation == null && row.brightness == null)
    return null;
  return {
    hue: row.hue ?? 0,
    saturation: row.saturation ?? 100,
    brightness: row.brightness ?? 100,
  };
}

/** 한 번에 장착 상태를 물어볼 수 있는 최대 인원 (로비 100인 방 기준) */
const LOADOUT_LOOKUP_MAX = 100;

/**
 * 메달 상점 — 진열·구매·장착 (리텐션 기획서 Task 8·9).
 *
 * 상품 가격·자리는 @nexus/types 의 COSMETIC_SHOP_ITEMS 가 원본이다.
 * 구매는 메달 차감(원장 한 줄)과 보유 기록을 한 트랜잭션으로 묶는다 —
 * 둘 중 하나만 남는 일이 없게.
 */
@Injectable()
export class ShopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly medalService: MedalService,
    private readonly catalog: ShopCatalogService,
  ) {}

  /**
   * 상점 진열 — 내 잔액과 상품별 보유·장착 여부.
   * 상품표는 코드 원본 + 관리자 덮어쓰기 + 지금 걸린 할인(ShopCatalogService).
   * 숨긴(삭제한) 상품·판매를 내린 상품은 가진 사람에게만 보인다.
   */
  async getShop(userId: string) {
    const [items, balance, owned, loadout] = await Promise.all([
      this.catalog.getItems(),
      this.medalService.getBalance(userId),
      this.prisma.userCosmetic.findMany({
        where: { userId },
        select: {
          itemCode: true,
          hue: true,
          saturation: true,
          brightness: true,
        },
      }),
      this.getLoadout(userId),
    ]);
    const ownedSet = new Set(owned.map((o) => o.itemCode));
    const tintBy = new Map(owned.map((o) => [o.itemCode, toTint(o)]));
    const equipped = new Set(Object.values(loadout));
    return {
      balance,
      loadout,
      items: items
        .filter(
          (item) => (item.onSale && !item.hidden) || ownedSet.has(item.code),
        )
        .map((item) => ({
          code: item.code,
          slot: item.slot,
          price: item.price,
          basePrice: item.basePrice,
          discountPercent: item.discountPercent,
          discountEndsAt: item.discountEndsAt,
          rarity: item.rarity,
          onSale: item.onSale && !item.hidden,
          name: item.name,
          description: item.description,
          owned: ownedSet.has(item.code),
          equipped: equipped.has(item.code),
          // 내가 고른 색(닉네임 글꼴) — 안 골랐으면 null
          tint: tintBy.get(item.code) ?? null,
        })),
    };
  }

  /**
   * 구매. `equip` 이면 산 즉시 그 자리에 장착한다.
   * 이미 가진 상품·판매 중이 아닌 상품·메달 부족은 거절한다.
   * `expectedPrice` 는 사는 사람이 화면에서 본 가격 — 넘기면 지금 가격과 같을 때만 산다.
   */
  async purchase(
    userId: string,
    code: string,
    equip = false,
    expectedPrice?: number,
  ) {
    // 가격은 지금 상품표(관리자가 바꾼 가격·걸린 할인 반영)를 따른다
    const item = await this.catalog.find(code);
    if (!item) throw new NotFoundException("없는 상품이에요.");
    if (!item.onSale || item.hidden)
      throw new BadRequestException("지금은 팔지 않는 상품이에요.");
    // 화면에서 본 값과 지금 값이 다르면 사지 않는다 — 상점을 열어 둔 사이 할인이 끝나거나
    // 관리자가 가격을 올렸을 때, 본 것보다 많이 깎이는 일을 막는다
    if (expectedPrice !== undefined && expectedPrice !== item.price) {
      throw new ConflictException(
        `가격이 바뀌었어요 (지금 ${item.price.toLocaleString()}). 다시 확인해 주세요.`,
      );
    }

    const already = await this.prisma.userCosmetic.findUnique({
      where: { userId_itemCode: { userId, itemCode: code } },
      select: { id: true },
    });
    if (already) throw new ConflictException("이미 가진 상품이에요.");

    // 전에 산 적 있는 상품을 다시 사면 회차 키를 쓴다 — 첫 구매 키(`purchase:<사람>:<상품>`)는
    // 원장에 이미 있어서 그대로 쓰면 유니크 제약에 걸려 영영 다시 못 산다(Task 17).
    // 회차는 "지난 구매 줄 수"로 센다. 예전엔 환불 줄 수로 셌는데, 관리자 회수(메달 안 돌려줌)는
    // 환불 줄이 없어서 회수당한 사람이 같은 상품을 다시 사려 하면 늘 "이미 가진 상품"으로 막혔다.
    // 환불만 있던 기존 데이터에선 구매 줄 수 = 환불 줄 수라 키가 그대로 이어진다.
    const prevPurchases = await this.prisma.medalLedger.count({
      where: { userId, reason: MedalReason.PURCHASE, sourceId: code },
    });
    const purchaseKey =
      prevPurchases === 0
        ? `purchase:${userId}:${code}`
        : `purchase:${userId}:${code}:${prevPurchases}`;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // 잔액이 모자라면 여기서 InsufficientMedalsError 로 통째로 되돌린다
        const entry = await this.medalService.recordInTx(tx, {
          userId,
          amount: -item.price,
          reason: MedalReason.PURCHASE,
          idempotencyKey: purchaseKey,
          sourceId: code,
          metadata: {
            itemCode: code,
            price: item.price,
            basePrice: item.basePrice,
            discountPercent: item.discountPercent,
            discountId: item.discountId,
          },
        });
        await tx.userCosmetic.create({
          data: {
            userId,
            itemCode: code,
            source: "PURCHASE",
            ledgerId: entry.id,
          },
        });
        if (equip) {
          await tx.userCosmeticLoadout.upsert({
            where: { userId_slot: { userId, slot: item.slot } },
            create: { userId, slot: item.slot, itemCode: code },
            update: { itemCode: code },
          });
        }
        return entry;
      });
      // 다른 탭·기기의 헤더 메달 칩도 바로 바뀌게
      this.medalService.announceBalance(userId, result.balanceAfter);
      return { balance: result.balanceAfter, itemCode: code, equipped: equip };
    } catch (err: any) {
      // 같은 상품을 동시에 두 번 산 경우 — 한쪽만 들어가고 다른 쪽은 통째로 되돌려졌다
      if (err?.code === "P2002") {
        throw new ConflictException("이미 가진 상품이에요.");
      }
      throw err;
    }
  }

  /** 장착·해제. code 가 null 이면 그 자리를 비운다 */
  async equip(userId: string, slot: CosmeticSlot, code: string | null) {
    if (!COSMETIC_SLOTS.includes(slot)) {
      throw new BadRequestException("없는 자리예요.");
    }
    if (code === null) {
      await this.prisma.userCosmeticLoadout.deleteMany({
        where: { userId, slot },
      });
      return this.getLoadout(userId);
    }

    // 관리자가 추가한 상품도 있어서 상품표(코드 + DB)에서 찾는다. 숨긴 상품도 가진 사람은 낀다
    const item = await this.catalog.find(code);
    if (!item) throw new NotFoundException("없는 상품이에요.");
    if (item.slot !== slot) {
      throw new BadRequestException("이 자리에 낄 수 없는 상품이에요.");
    }
    const owned = await this.prisma.userCosmetic.findUnique({
      where: { userId_itemCode: { userId, itemCode: code } },
      select: { id: true },
    });
    if (!owned) throw new BadRequestException("가지고 있지 않은 상품이에요.");

    await this.prisma.userCosmeticLoadout.upsert({
      where: { userId_slot: { userId, slot } },
      create: { userId, slot, itemCode: code },
      update: { itemCode: code },
    });
    return this.getLoadout(userId);
  }

  /**
   * 관리자 환불 (Task 17) — 구매 원장의 금액을 돌려주고 보유·장착을 지운다.
   *
   * - 산 값은 상품표의 현재 가격이 아니라 구매 원장 줄의 금액을 따른다(가격이 바뀌었어도 낸 만큼).
   * - 운영자가 직접 준 상품(구매 원장 없음)은 환불할 메달이 없어 거절한다.
   * - 환불 원장 키는 `refund:<구매 원장 id>` — 두 번 눌러도 한 번만 돌려준다.
   * - 지운 뒤 같은 상품을 다시 사면 purchase 가 회차 키를 쓴다.
   */
  async adminRefund(input: {
    adminId: string;
    userId: string;
    itemCode: string;
    memo: string;
  }) {
    const owned = await this.prisma.userCosmetic.findUnique({
      where: {
        userId_itemCode: { userId: input.userId, itemCode: input.itemCode },
      },
    });
    if (!owned) throw new NotFoundException("이 사람이 가진 상품이 아니에요.");
    const purchase = owned.ledgerId
      ? await this.prisma.medalLedger.findUnique({
          where: { id: owned.ledgerId },
        })
      : null;
    if (!purchase || purchase.reason !== MedalReason.PURCHASE) {
      throw new BadRequestException(
        "메달로 산 상품만 환불할 수 있어요 (운영자가 준 상품이에요).",
      );
    }
    // 묶음으로 산 상품이면 그 상품 몫만 돌려준다(묶음 원장 한 줄에 상품별 몫이 있다)
    const bundleShare = bundleAllocation(purchase, input.itemCode);
    const price = bundleShare ?? -purchase.amount;

    const entry = await this.prisma
      .$transaction(async (tx) => {
        const row = await this.medalService.recordInTx(tx, {
          userId: input.userId,
          amount: price,
          reason: MedalReason.REFUND,
          // 묶음은 한 원장 줄에 상품이 여럿이라 상품마다 따로 키를 쓴다
          idempotencyKey:
            bundleShare != null
              ? `refund:${purchase.id}:${input.itemCode}`
              : `refund:${purchase.id}`,
          sourceId: input.itemCode,
          metadata: {
            itemCode: input.itemCode,
            price,
            purchaseLedgerId: purchase.id,
            memo: input.memo,
            adminId: input.adminId,
          },
        });
        await tx.userCosmetic.delete({ where: { id: owned.id } });
        // 그 상품을 끼고 있었으면 자리를 비운다(기본 모습으로)
        await tx.userCosmeticLoadout.deleteMany({
          where: { userId: input.userId, itemCode: input.itemCode },
        });
        await tx.adminAuditLog.create({
          data: {
            adminId: input.adminId,
            action: "MEDAL_REFUND",
            targetType: "USER",
            targetId: input.userId,
            details: {
              itemCode: input.itemCode,
              amount: price,
              memo: input.memo,
              ledgerId: row.id,
              purchaseLedgerId: purchase.id,
              balanceAfter: row.balanceAfter,
            },
          },
        });
        return row;
      })
      .catch((err: any) => {
        // 같은 환불을 동시에 두 번 누른 경우 — 한쪽은 통째로 되돌려졌다
        if (err?.code === "P2002") {
          throw new ConflictException("이미 환불한 구매예요.");
        }
        throw err;
      });
    this.medalService.announceBalance(input.userId, entry.balanceAfter);
    return { balance: entry.balanceAfter, refunded: price, ledgerId: entry.id };
  }

  /**
   * 관리자 사용자 상세 (Task 17) — 가진 상품(얻은 경로·구매 원장)과 장착 상태
   */
  async adminUserCosmetics(userId: string) {
    const [owned, loadout, items] = await Promise.all([
      this.prisma.userCosmetic.findMany({
        where: { userId },
        orderBy: { acquiredAt: "desc" },
      }),
      this.getLoadout(userId),
      this.catalog.getItems(),
    ]);
    const slotByCode = new Map(items.map((i) => [i.code, i.slot]));
    const ledgerIds = owned
      .map((o) => o.ledgerId)
      .filter((id): id is string => !!id);
    const purchases = ledgerIds.length
      ? await this.prisma.medalLedger.findMany({
          where: { id: { in: ledgerIds } },
          select: {
            id: true,
            amount: true,
            createdAt: true,
            sourceId: true,
            metadata: true,
          },
        })
      : [];
    const byId = new Map(purchases.map((p) => [p.id, p]));
    const equipped = new Set(Object.values(loadout));
    return {
      loadout,
      items: owned.map((o) => {
        const p = o.ledgerId ? byId.get(o.ledgerId) : undefined;
        return {
          itemCode: o.itemCode,
          slot: slotByCode.get(o.itemCode) ?? null,
          source: o.source,
          acquiredAt: o.acquiredAt,
          // 묶음으로 산 상품은 그 상품 몫
          paid: p ? (bundleAllocation(p, o.itemCode) ?? -p.amount) : null,
          equipped: equipped.has(o.itemCode),
          refundable: o.source === "PURCHASE" && !!p,
        };
      }),
    };
  }

  /**
   * 닉네임 글꼴 색 고르기 (2026-11-20) — 가진 닉네임 글꼴에 색(색상 회전)·채도·밝기를 저장한다.
   * null 이거나 원래 값(0·100·100)이면 원래 색. 상품마다 따로 기억해서 글꼴을 바꿔 끼워도 남는다.
   */
  async setNameTint(userId: string, code: string, tint: NameTint | null) {
    if (tint) {
      for (const key of ["hue", "saturation", "brightness"] as const) {
        const [min, max] = NAME_TINT_LIMITS[key];
        const v = tint[key];
        if (!Number.isInteger(v) || v < min || v > max) {
          throw new BadRequestException("고른 색 값이 범위를 벗어났어요.");
        }
      }
    }
    const item = await this.catalog.find(code);
    if (!item) throw new NotFoundException("없는 상품이에요.");
    if (item.slot !== "NAME_STYLE") {
      throw new BadRequestException("닉네임 글꼴만 색을 바꿀 수 있어요.");
    }
    const owned = await this.prisma.userCosmetic.findUnique({
      where: { userId_itemCode: { userId, itemCode: code } },
      select: { id: true },
    });
    if (!owned) throw new BadRequestException("가지고 있지 않은 상품이에요.");
    const plain = isDefaultNameTint(tint);
    await this.prisma.userCosmetic.update({
      where: { id: owned.id },
      data: plain
        ? { hue: null, saturation: null, brightness: null }
        : {
            hue: tint!.hue,
            saturation: tint!.saturation,
            brightness: tint!.brightness,
          },
    });
    return { code, tint: plain ? null : tint };
  }

  /** 한 사람의 장착 상태 */
  async getLoadout(userId: string): Promise<CosmeticLoadout> {
    const map = await this.getLoadouts([userId]);
    return map[userId] ?? {};
  }

  /**
   * 여러 사람의 장착 상태 — 로비 참가자 카드·프로필이 쓴다.
   * 판매 목록에서 사라진 코드도 그대로 돌려준다(이미 산 사람은 계속 쓴다).
   */
  async getLoadouts(
    userIds: string[],
  ): Promise<Record<string, CosmeticLoadout>> {
    const ids = [...new Set(userIds.filter(Boolean))].slice(
      0,
      LOADOUT_LOOKUP_MAX,
    );
    if (ids.length === 0) return {};
    const rows = await this.prisma.userCosmeticLoadout.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, slot: true, itemCode: true },
    });
    const result: Record<string, CosmeticLoadout> = {};
    for (const row of rows) {
      (result[row.userId] ??= {})[row.slot as CosmeticSlot] = row.itemCode;
    }
    // 장착한 닉네임 글꼴에 고른 색이 있으면 함께 싣는다(로비·호버·프로필이 그대로 그린다)
    const named = rows.filter((r) => r.slot === "NAME_STYLE");
    if (named.length) {
      const owned = await this.prisma.userCosmetic.findMany({
        where: {
          OR: named.map((r) => ({ userId: r.userId, itemCode: r.itemCode })),
        },
        select: { userId: true, hue: true, saturation: true, brightness: true },
      });
      for (const o of owned) {
        const tint = toTint(o);
        if (tint && result[o.userId]) result[o.userId].nameTint = tint;
      }
    }
    return result;
  }
}
