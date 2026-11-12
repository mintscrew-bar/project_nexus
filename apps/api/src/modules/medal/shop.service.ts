import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MedalReason } from "@nexus/database";
import {
  COSMETIC_SHOP_ITEMS,
  COSMETIC_SLOTS,
  findCosmeticShopItem,
  type CosmeticLoadout,
  type CosmeticSlot,
} from "@nexus/types";
import { PrismaService } from "../prisma/prisma.service";
import { MedalService } from "./medal.service";

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
  ) {}

  /** 상점 진열 — 내 잔액과 상품별 보유·장착 여부 */
  async getShop(userId: string) {
    const [balance, owned, loadout] = await Promise.all([
      this.medalService.getBalance(userId),
      this.prisma.userCosmetic.findMany({
        where: { userId },
        select: { itemCode: true },
      }),
      this.getLoadout(userId),
    ]);
    const ownedSet = new Set(owned.map((o) => o.itemCode));
    const equipped = new Set(Object.values(loadout));
    return {
      balance,
      loadout,
      items: COSMETIC_SHOP_ITEMS.filter(
        (item) => item.onSale || ownedSet.has(item.code),
      ).map((item) => ({
        ...item,
        owned: ownedSet.has(item.code),
        equipped: equipped.has(item.code),
      })),
    };
  }

  /**
   * 구매. `equip` 이면 산 즉시 그 자리에 장착한다.
   * 이미 가진 상품·판매 중이 아닌 상품·메달 부족은 거절한다.
   */
  async purchase(userId: string, code: string, equip = false) {
    const item = findCosmeticShopItem(code);
    if (!item) throw new NotFoundException("없는 상품이에요.");
    if (!item.onSale)
      throw new BadRequestException("지금은 팔지 않는 상품이에요.");

    const already = await this.prisma.userCosmetic.findUnique({
      where: { userId_itemCode: { userId, itemCode: code } },
      select: { id: true },
    });
    if (already) throw new ConflictException("이미 가진 상품이에요.");

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // 잔액이 모자라면 여기서 InsufficientMedalsError 로 통째로 되돌린다
        const entry = await this.medalService.recordInTx(tx, {
          userId,
          amount: -item.price,
          reason: MedalReason.PURCHASE,
          idempotencyKey: `purchase:${userId}:${code}`,
          sourceId: code,
          metadata: { itemCode: code, price: item.price },
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

    const item = findCosmeticShopItem(code);
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
    return result;
  }
}
