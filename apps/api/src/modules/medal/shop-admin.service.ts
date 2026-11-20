import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MedalReason } from "@nexus/database";
import { randomBytes } from "node:crypto";
import {
  COSMETIC_SLOTS,
  findCosmeticShopItem,
  type CosmeticRarity,
  type CosmeticSlot,
} from "@nexus/types";
import { PrismaService } from "../prisma/prisma.service";
import { UploadService } from "../upload/upload.service";
import { RARITIES, ShopCatalogService } from "./shop-catalog.service";

/** 상품 수정 — 넘긴 필드만 바꾼다. null 은 "원본 값으로 되돌리기" */
export interface ShopItemPatch {
  name?: string | null;
  description?: string | null;
  price?: number | null;
  rarity?: CosmeticRarity | null;
  onSale?: boolean | null;
  hidden?: boolean;
  sortOrder?: number | null;
}

/** 새 상품 — 그림은 baseCode(기존 상품 그림 빌리기) 또는 올린 파일(posterUrl 필수) 중 하나 */
export interface ShopItemCreate {
  slot: CosmeticSlot;
  name: string;
  description?: string | null;
  price: number;
  rarity: CosmeticRarity;
  onSale?: boolean;
  baseCode?: string | null;
  videoUrl?: string | null;
  mp4Url?: string | null;
  posterUrl?: string | null;
}

/** 가격 한도 — 상품 수정·추가 공통 */
const PRICE_MIN = 1;
const PRICE_MAX = 100000;

/** 할인율 한도 — 0·100% 같은 실수를 막는다 */
const DISCOUNT_MIN = 1;
const DISCOUNT_MAX = 90;

/**
 * 관리자 상점 관리 (1단계 2026-11-19, 2단계 2026-11-20) — 상품별 판매 현황, 상품 수정(이름·설명·
 * 가격·등급·판매·숨김·순서), 상품 지급(선물)·회수, 기간 할인, 새 상품 추가·지우기.
 *
 * 코드 상품의 그림·자리는 코드가 원본이라 바꾸지 않는다. 새 상품은 ShopCustomItem 에 둔다.
 * 모든 변경은 감사 로그(AdminAuditLog)에 남긴다.
 */
@Injectable()
export class ShopAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: ShopCatalogService,
    private readonly upload: UploadService,
  ) {}

  /** 상품표(코드 상품 + 관리자 상품)에 있는 코드인가 */
  private async exists(code: string) {
    return !!(await this.catalog.find(code));
  }

  /** 상품표 + 판매 현황(판매 수·쓴 메달·환불·보유·장착·운영자 지급) */
  async listItems() {
    const [items, purchases, refunds, owners, grants, equipped] =
      await Promise.all([
        this.catalog.getItems(),
        this.prisma.medalLedger.groupBy({
          by: ["sourceId"],
          where: { reason: MedalReason.PURCHASE },
          _count: { _all: true },
          _sum: { amount: true },
        }),
        this.prisma.medalLedger.groupBy({
          by: ["sourceId"],
          where: { reason: MedalReason.REFUND },
          _count: { _all: true },
          _sum: { amount: true },
        }),
        this.prisma.userCosmetic.groupBy({
          by: ["itemCode"],
          _count: { _all: true },
        }),
        this.prisma.userCosmetic.groupBy({
          by: ["itemCode"],
          where: { source: "ADMIN" },
          _count: { _all: true },
        }),
        this.prisma.userCosmeticLoadout.groupBy({
          by: ["itemCode"],
          _count: { _all: true },
        }),
      ]);
    const count = <T extends { _count: { _all: number } }>(
      rows: T[],
      key: (r: T) => string | null,
    ) => new Map(rows.map((r) => [key(r), r._count._all]));
    const sum = <T extends { _sum: { amount: number | null } }>(
      rows: T[],
      key: (r: T) => string | null,
    ) => new Map(rows.map((r) => [key(r), r._sum.amount ?? 0]));
    const sold = count(purchases, (r) => r.sourceId);
    const spent = sum(purchases, (r) => r.sourceId);
    const refunded = count(refunds, (r) => r.sourceId);
    const refundedMedals = sum(refunds, (r) => r.sourceId);
    const owning = count(owners, (r) => r.itemCode);
    const granted = count(grants, (r) => r.itemCode);
    const wearing = count(equipped, (r) => r.itemCode);
    return items.map((item) => ({
      ...item,
      stats: {
        sold: sold.get(item.code) ?? 0,
        // 쓴 메달 = 구매 합계(음수)를 뒤집고 환불을 뺀 것
        medals:
          -(spent.get(item.code) ?? 0) - (refundedMedals.get(item.code) ?? 0),
        refunds: refunded.get(item.code) ?? 0,
        owners: owning.get(item.code) ?? 0,
        granted: granted.get(item.code) ?? 0,
        equipped: wearing.get(item.code) ?? 0,
      },
    }));
  }

  /** 상품 수정 — 덮어쓰기 표에 남긴다(그림·자리는 코드 원본) */
  async updateItem(adminId: string, code: string, patch: ShopItemPatch) {
    if (!(await this.exists(code)))
      throw new NotFoundException("없는 상품이에요.");
    if (
      patch.price != null &&
      (patch.price < PRICE_MIN || patch.price > PRICE_MAX)
    ) {
      throw new BadRequestException("가격은 1~100,000 메달 사이여야 해요.");
    }
    const before = await this.prisma.shopItemOverride.findUnique({
      where: { code },
    });
    const data = {
      ...(patch.name !== undefined ? { name: patch.name?.trim() || null } : {}),
      ...(patch.description !== undefined
        ? { description: patch.description?.trim() || null }
        : {}),
      ...(patch.price !== undefined ? { price: patch.price } : {}),
      ...(patch.rarity !== undefined ? { rarity: patch.rarity } : {}),
      ...(patch.onSale !== undefined ? { onSale: patch.onSale } : {}),
      ...(patch.hidden !== undefined ? { hidden: patch.hidden } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      updatedById: adminId,
    };
    await this.prisma.shopItemOverride.upsert({
      where: { code },
      create: { code, ...data },
      update: data,
    });
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: "SHOP_ITEM_UPDATE",
        targetType: "SHOP_ITEM",
        targetId: code,
        details: { before, patch: patch as object },
      },
    });
    return this.catalog.find(code);
  }

  /**
   * 새 상품 추가 (상점 관리 2단계).
   * - 그림 빌리기: baseCode 는 같은 자리의 코드 상품이어야 한다(관리자 상품을 또 빌리진 않는다).
   * - 파일 올리기: 정지 그림(posterUrl)은 꼭, 영상(WebM·MP4)은 선택. 우리가 올린 주소만 받는다.
   * - 닉네임 글꼴은 글자 효과라 파일로 만들 수 없어 그림 빌리기만 된다.
   */
  async createItem(adminId: string, input: ShopItemCreate) {
    if (!COSMETIC_SLOTS.includes(input.slot))
      throw new BadRequestException("없는 자리예요.");
    if (!RARITIES.includes(input.rarity))
      throw new BadRequestException("없는 등급이에요.");
    const name = input.name?.trim();
    if (!name) throw new BadRequestException("이름을 적어 주세요.");
    if (input.price < PRICE_MIN || input.price > PRICE_MAX) {
      throw new BadRequestException("가격은 1~100,000 메달 사이여야 해요.");
    }

    const baseCode = input.baseCode?.trim() || null;
    const media = {
      videoUrl: input.videoUrl?.trim() || null,
      mp4Url: input.mp4Url?.trim() || null,
      posterUrl: input.posterUrl?.trim() || null,
    };
    if (baseCode) {
      const base = findCosmeticShopItem(baseCode);
      if (!base) throw new BadRequestException("빌려 쓸 상품이 없어요.");
      if (base.slot !== input.slot)
        throw new BadRequestException(
          "같은 자리의 상품 그림만 빌릴 수 있어요.",
        );
      // 그림 빌리기면 올린 파일은 쓰지 않는다
      media.videoUrl = media.mp4Url = media.posterUrl = null;
    } else {
      if (input.slot === "NAME_STYLE")
        throw new BadRequestException(
          "닉네임 글꼴은 기존 글꼴을 빌려서만 만들 수 있어요.",
        );
      if (!media.posterUrl)
        throw new BadRequestException("정지 그림(WebP·PNG)을 올려 주세요.");
      // 아바타 장식은 투명 WebM 만 쓴다(사파리는 투명 그림으로 대신)
      if (input.slot === "AVATAR_FRAME") media.mp4Url = null;
      for (const url of Object.values(media)) {
        if (url && !this.upload.isOwnCosmeticUrl(url))
          throw new BadRequestException(
            "이 화면에서 올린 파일만 쓸 수 있어요.",
          );
      }
    }

    // 코드 — CX_ + 무작위 6자. 코드 상품(FX_·AV_·NM_·BN_)과 겹치지 않는다
    let code = "";
    for (let i = 0; i < 5 && !code; i++) {
      const candidate = `CX_${randomBytes(4).toString("hex").slice(0, 6).toUpperCase()}`;
      if (
        !(await this.prisma.shopCustomItem.findUnique({
          where: { code: candidate },
        }))
      )
        code = candidate;
    }
    if (!code)
      throw new ConflictException("코드를 만들지 못했어요. 다시 눌러 주세요.");

    await this.prisma.shopCustomItem.create({
      data: {
        code,
        slot: input.slot,
        name,
        description: input.description?.trim() ?? "",
        price: input.price,
        rarity: input.rarity,
        onSale: input.onSale ?? true,
        baseCode,
        ...media,
        createdById: adminId,
      },
    });
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: "SHOP_ITEM_CREATE",
        targetType: "SHOP_ITEM",
        targetId: code,
        details: { ...input, name, baseCode, ...media } as object,
      },
    });
    return this.catalog.find(code);
  }

  /**
   * 관리자 상품 지우기 — 가진 사람이 한 명도 없을 때만. 있으면 숨기기를 쓴다
   * (산 사람의 장식이 갑자기 사라지면 안 되니까). 코드 상품은 지울 수 없다.
   */
  async deleteItem(adminId: string, code: string) {
    const row = await this.prisma.shopCustomItem.findUnique({
      where: { code },
    });
    if (!row)
      throw new NotFoundException(
        findCosmeticShopItem(code)
          ? "기본 상품은 지울 수 없어요. 숨기기를 쓰세요."
          : "없는 상품이에요.",
      );
    const owners = await this.prisma.userCosmetic.count({
      where: { itemCode: code },
    });
    if (owners > 0)
      throw new ConflictException(
        `가진 사람이 ${owners}명 있어 지울 수 없어요. 숨기기를 쓰세요.`,
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.shopCustomItem.delete({ where: { code } });
      await tx.shopItemOverride.deleteMany({ where: { code } });
      await tx.adminAuditLog.create({
        data: {
          adminId,
          action: "SHOP_ITEM_DELETE",
          targetType: "SHOP_ITEM",
          targetId: code,
          details: { before: row as object },
        },
      });
    });
    return { code, deleted: true };
  }

  /** 상품 지급(선물) — 메달 없이 넣어 준다. 얻은 경로는 ADMIN(환불 대상 아님) */
  async grant(adminId: string, userId: string, code: string, memo: string) {
    if (!(await this.exists(code)))
      throw new NotFoundException("없는 상품이에요.");
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("없는 사용자예요.");
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.userCosmetic.create({
          data: { userId, itemCode: code, source: "ADMIN" },
        });
        await tx.adminAuditLog.create({
          data: {
            adminId,
            action: "SHOP_GRANT",
            targetType: "USER",
            targetId: userId,
            details: { itemCode: code, memo },
          },
        });
      });
    } catch (err: any) {
      if (err?.code === "P2002")
        throw new ConflictException("이미 가진 상품이에요.");
      throw err;
    }
    return { userId, itemCode: code, granted: true };
  }

  /**
   * 상품 회수 — 보유·장착을 지운다. 메달은 돌려주지 않는다(돌려주려면 메달·원장 탭의 환불).
   */
  async revoke(adminId: string, userId: string, code: string, memo: string) {
    const owned = await this.prisma.userCosmetic.findUnique({
      where: { userId_itemCode: { userId, itemCode: code } },
    });
    if (!owned) throw new NotFoundException("이 사람이 가진 상품이 아니에요.");
    await this.prisma.$transaction(async (tx) => {
      await tx.userCosmetic.delete({ where: { id: owned.id } });
      await tx.userCosmeticLoadout.deleteMany({
        where: { userId, itemCode: code },
      });
      await tx.adminAuditLog.create({
        data: {
          adminId,
          action: "SHOP_REVOKE",
          targetType: "USER",
          targetId: userId,
          details: { itemCode: code, memo, source: owned.source },
        },
      });
    });
    return { userId, itemCode: code, revoked: true };
  }

  /** 기간 할인 목록 — 최근 만든 순, 지금 걸려 있는지 함께 */
  async listDiscounts(now = new Date()) {
    const rows = await this.prisma.shopDiscount.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map((d) => ({
      ...d,
      status: !d.active
        ? "OFF"
        : d.startsAt > now
          ? "SCHEDULED"
          : d.endsAt <= now
            ? "ENDED"
            : "LIVE",
    }));
  }

  async createDiscount(
    adminId: string,
    input: {
      name: string;
      percent: number;
      itemCodes: string[];
      startsAt: Date;
      endsAt: Date;
    },
  ) {
    if (input.percent < DISCOUNT_MIN || input.percent > DISCOUNT_MAX) {
      throw new BadRequestException(
        `할인율은 ${DISCOUNT_MIN}~${DISCOUNT_MAX}% 사이여야 해요.`,
      );
    }
    if (!(input.endsAt > input.startsAt)) {
      throw new BadRequestException("끝나는 시각이 시작보다 뒤여야 해요.");
    }
    const known = new Set((await this.catalog.getItems()).map((i) => i.code));
    const unknown = input.itemCodes.filter((c) => !known.has(c));
    if (unknown.length)
      throw new BadRequestException(`없는 상품: ${unknown.join(", ")}`);
    const row = await this.prisma.shopDiscount.create({
      data: {
        name: input.name.trim(),
        percent: input.percent,
        itemCodes: [...new Set(input.itemCodes)],
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        createdById: adminId,
      },
    });
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: "SHOP_DISCOUNT",
        targetType: "SHOP_DISCOUNT",
        targetId: row.id,
        details: { op: "create", ...input, itemCodes: row.itemCodes },
      },
    });
    return row;
  }

  /** 할인 끄기(지우지 않고 남겨 둔다 — 그때 산 원장에 할인 id 가 남아 있다) */
  async stopDiscount(adminId: string, id: string) {
    const row = await this.prisma.shopDiscount
      .update({ where: { id }, data: { active: false } })
      .catch(() => {
        throw new NotFoundException("없는 할인이에요.");
      });
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: "SHOP_DISCOUNT",
        targetType: "SHOP_DISCOUNT",
        targetId: id,
        details: { op: "stop" },
      },
    });
    return row;
  }
}
