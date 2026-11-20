import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { MedalReason } from "@nexus/database";
import { InsufficientMedalsError, MedalService } from "./medal.service";
import { ShopService } from "./shop.service";
import { ShopCatalogService } from "./shop-catalog.service";
import { createFakePrisma } from "./medal.fake-prisma";

describe("ShopService", () => {
  let db: ReturnType<typeof createFakePrisma>;
  let shop: ShopService;

  beforeEach(() => {
    db = createFakePrisma();
    shop = new ShopService(
      db.api,
      new MedalService(db.api),
      new ShopCatalogService(db.api),
    );
  });

  describe("purchase", () => {
    it("메달을 깎고 보유 기록과 원장을 함께 남긴다", async () => {
      db.setBalance("u1", 300);
      const res = await shop.purchase("u1", "FX_SLIME");
      expect(res.balance).toBe(50);
      expect(db.cosmetics()).toEqual([
        expect.objectContaining({ userId: "u1", itemCode: "FX_SLIME" }),
      ]);
      expect(db.ledger()[0]).toMatchObject({
        amount: -250,
        reason: MedalReason.PURCHASE,
        sourceId: "FX_SLIME",
      });
      // 보유 기록이 어떤 원장 줄로 샀는지 가리킨다
      expect(db.cosmetics()[0].ledgerId).toBe(db.ledger()[0].id);
    });

    it("equip 이면 산 즉시 그 자리에 장착한다", async () => {
      db.setBalance("u1", 300);
      await shop.purchase("u1", "AV_CAT_EARS", true);
      expect(await shop.getLoadout("u1")).toEqual({
        AVATAR_FRAME: "AV_CAT_EARS",
      });
    });

    it("닉네임 글꼴은 NAME_STYLE 자리에 장착되고 다른 자리와 따로 간다", async () => {
      db.setBalance("u1", 1000);
      await shop.purchase("u1", "AV_CAT_EARS", true);
      const res = await shop.purchase("u1", "NM_GOLD", true);
      // 금빛 360 = 같은 등급(일반) 장식의 약 60%
      expect(res.balance).toBe(1000 - 300 - 360);
      expect(await shop.getLoadout("u1")).toEqual({
        AVATAR_FRAME: "AV_CAT_EARS",
        NAME_STYLE: "NM_GOLD",
      });
      await expect(
        shop.equip("u1", "CARD_FRAME", "NM_GOLD"),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("프로필 배경은 PROFILE_BANNER 자리에 장착되고 2,500 메달이다", async () => {
      db.setBalance("u1", 3000);
      const res = await shop.purchase("u1", "BN_INK_SWORDSMAN", true);
      expect(res.balance).toBe(500);
      expect(await shop.getLoadout("u1")).toEqual({
        PROFILE_BANNER: "BN_INK_SWORDSMAN",
      });
      // 해제하면 자리만 빈다 — 올린 배경 이미지는 상점이 건드리지 않는다
      await shop.equip("u1", "PROFILE_BANNER", null);
      expect(await shop.getLoadout("u1")).toEqual({});
    });

    it("메달이 모자라면 아무것도 남기지 않는다", async () => {
      db.setBalance("u1", 100);
      await expect(shop.purchase("u1", "FX_SLIME")).rejects.toBeInstanceOf(
        InsufficientMedalsError,
      );
      expect(db.balance("u1")).toBe(100);
      expect(db.cosmetics()).toHaveLength(0);
      expect(db.ledger()).toHaveLength(0);
    });

    it("이미 가진 상품은 다시 사지 못한다", async () => {
      db.setBalance("u1", 1000);
      await shop.purchase("u1", "FX_SLIME");
      await expect(shop.purchase("u1", "FX_SLIME")).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(db.balance("u1")).toBe(750);
    });

    it("동시에 두 번 사도 한 번만 깎인다", async () => {
      db.setBalance("u1", 1000);
      // 미리 확인할 땐 없었지만 그 사이 다른 요청이 먼저 샀다
      await shop.purchase("u1", "FX_SLIME");
      db.api.userCosmetic.findUnique.mockResolvedValueOnce(null);
      db.api.medalLedger.findUnique.mockResolvedValueOnce(null);
      await expect(shop.purchase("u1", "FX_SLIME")).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(db.balance("u1")).toBe(750);
      expect(db.cosmetics()).toHaveLength(1);
    });

    it("없는 상품은 거절한다", async () => {
      await expect(shop.purchase("u1", "NOPE")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("equip", () => {
    beforeEach(async () => {
      db.setBalance("u1", 5000);
      await shop.purchase("u1", "FX_SLIME", false);
      await shop.purchase("u1", "FX_DRAGON", false);
    });

    it("가진 상품을 장착하고, 같은 자리의 다른 상품으로 바꾼다", async () => {
      await shop.equip("u1", "CARD_FRAME", "FX_SLIME");
      expect(await shop.getLoadout("u1")).toEqual({ CARD_FRAME: "FX_SLIME" });
      await shop.equip("u1", "CARD_FRAME", "FX_DRAGON");
      expect(await shop.getLoadout("u1")).toEqual({ CARD_FRAME: "FX_DRAGON" });
    });

    it("null 이면 그 자리를 비운다", async () => {
      await shop.equip("u1", "CARD_FRAME", "FX_SLIME");
      await shop.equip("u1", "CARD_FRAME", null);
      expect(await shop.getLoadout("u1")).toEqual({});
    });

    it("가지지 않은 상품·맞지 않는 자리는 거절한다", async () => {
      await expect(
        shop.equip("u1", "CARD_FRAME", "FX_BATS"),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        shop.equip("u1", "AVATAR_FRAME", "FX_SLIME"),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("getShop", () => {
    it("잔액과 상품별 보유·장착 여부를 준다", async () => {
      db.setBalance("u1", 600);
      await shop.purchase("u1", "FX_SLIME", true);
      const res = await shop.getShop("u1");
      expect(res.balance).toBe(350);
      const slime = res.items.find((i) => i.code === "FX_SLIME")!;
      expect(slime).toMatchObject({ owned: true, equipped: true, price: 250 });
      const ghost = res.items.find((i) => i.code === "FX_GHOST")!;
      expect(ghost).toMatchObject({ owned: false, equipped: false });
    });
  });

  describe("setNameHue (닉네임 색 고르기)", () => {
    it("가진 닉네임 글꼴에 색을 저장하고 장착 정보에 실린다", async () => {
      db.setBalance("u1", 1000);
      await shop.purchase("u1", "NM_GOLD", true);
      await shop.setNameHue("u1", "NM_GOLD", 200);
      expect(await shop.getLoadouts(["u1"])).toEqual({
        u1: { NAME_STYLE: "NM_GOLD", nameHue: 200 },
      });
      const view = await shop.getShop("u1");
      expect(view.items.find((i) => i.code === "NM_GOLD")?.hue).toBe(200);
      // null(또는 0)이면 원래 색
      await shop.setNameHue("u1", "NM_GOLD", null);
      expect(await shop.getLoadouts(["u1"])).toEqual({
        u1: { NAME_STYLE: "NM_GOLD" },
      });
    });

    it("가지지 않은 상품·닉네임 글꼴이 아닌 상품·범위 밖 색은 거절한다", async () => {
      db.setBalance("u1", 1000);
      await shop.purchase("u1", "FX_SLIME");
      await expect(
        shop.setNameHue("u1", "NM_GOLD", 100),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        shop.setNameHue("u1", "FX_SLIME", 100),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        shop.setNameHue("u1", "FX_SLIME", 400),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("getLoadouts", () => {
    it("여러 사람의 장착 상태를 한 번에 준다", async () => {
      db.setBalance("u1", 600);
      db.setBalance("u2", 600);
      await shop.purchase("u1", "FX_SLIME", true);
      await shop.purchase("u2", "AV_MOON", true);
      expect(await shop.getLoadouts(["u1", "u2", "u3", ""])).toEqual({
        u1: { CARD_FRAME: "FX_SLIME" },
        u2: { AVATAR_FRAME: "AV_MOON" },
      });
    });
  });

  describe("adminRefund (Task 17)", () => {
    const refund = (itemCode = "FX_SLIME", userId = "u1") =>
      shop.adminRefund({ adminId: "admin", userId, itemCode, memo: "잘못 삼" });

    it("낸 값을 돌려주고 보유·장착을 지우며 감사 로그를 남긴다", async () => {
      db.setBalance("u1", 300);
      await shop.purchase("u1", "FX_SLIME", true);
      const res = await refund();
      expect(res).toMatchObject({ balance: 300, refunded: 250 });
      expect(db.cosmetics()).toHaveLength(0);
      expect(await shop.getLoadout("u1")).toEqual({});
      const last = db.ledger()[db.ledger().length - 1];
      expect(last).toMatchObject({
        reason: MedalReason.REFUND,
        amount: 250,
        sourceId: "FX_SLIME",
      });
      expect(db.audit()[0]).toMatchObject({ action: "MEDAL_REFUND" });
    });

    it("환불한 상품을 다시 살 수 있다 (구매 키 회차)", async () => {
      db.setBalance("u1", 300);
      await shop.purchase("u1", "FX_SLIME");
      await refund();
      const again = await shop.purchase("u1", "FX_SLIME");
      expect(again.balance).toBe(50);
      expect(db.ledger().map((l: any) => l.idempotencyKey)).toEqual([
        "purchase:u1:FX_SLIME",
        expect.stringMatching(/^refund:/),
        "purchase:u1:FX_SLIME:1",
      ]);
    });

    it("가지지 않은 상품·운영자가 준 상품은 거절한다", async () => {
      await expect(refund("FX_DRAGON")).rejects.toBeInstanceOf(
        NotFoundException,
      );
      db.cosmetics().push({
        id: "gift",
        userId: "u1",
        itemCode: "FX_GHOST",
        source: "ADMIN",
        ledgerId: null,
      });
      await expect(refund("FX_GHOST")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
