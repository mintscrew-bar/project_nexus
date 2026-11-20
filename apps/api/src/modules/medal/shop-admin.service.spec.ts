import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { MedalService } from "./medal.service";
import { ShopService } from "./shop.service";
import { ShopCatalogService, discounted } from "./shop-catalog.service";
import { ShopAdminService } from "./shop-admin.service";
import { createFakePrisma } from "./medal.fake-prisma";

const HOUR = 60 * 60 * 1000;

describe("ShopAdminService (관리자 상점 관리 1단계)", () => {
  let db: ReturnType<typeof createFakePrisma>;
  let catalog: ShopCatalogService;
  let shop: ShopService;
  let admin: ShopAdminService;

  beforeEach(() => {
    db = createFakePrisma();
    catalog = new ShopCatalogService(db.api);
    shop = new ShopService(db.api, new MedalService(db.api), catalog);
    admin = new ShopAdminService(db.api, catalog);
  });

  describe("상품 수정", () => {
    it("바꾼 가격으로 진열되고 실제로 그 값이 깎인다", async () => {
      await admin.updateItem("admin", "FX_SLIME", { price: 100 });
      db.setBalance("u1", 300);
      const view = await shop.getShop("u1");
      expect(view.items.find((i) => i.code === "FX_SLIME")?.price).toBe(100);
      const res = await shop.purchase("u1", "FX_SLIME");
      expect(res.balance).toBe(200);
      // 감사 로그에 바꾸기 전·후가 남는다
      expect(db.audit()[0]).toMatchObject({
        action: "SHOP_ITEM_UPDATE",
        targetId: "FX_SLIME",
      });
    });

    it("null 이면 원본 가격으로 돌아간다", async () => {
      await admin.updateItem("admin", "FX_SLIME", { price: 100 });
      await admin.updateItem("admin", "FX_SLIME", { price: null });
      expect((await catalog.find("FX_SLIME"))?.price).toBe(250);
    });

    it("숨긴(삭제한) 상품은 진열에서 빠지고 살 수 없지만, 가진 사람에겐 보인다", async () => {
      db.setBalance("u1", 1000);
      await shop.purchase("u1", "FX_SLIME");
      await admin.updateItem("admin", "FX_SLIME", { hidden: true });
      const owner = await shop.getShop("u1");
      expect(owner.items.some((i) => i.code === "FX_SLIME")).toBe(true);
      const other = await shop.getShop("u2");
      expect(other.items.some((i) => i.code === "FX_SLIME")).toBe(false);
      db.setBalance("u2", 1000);
      await expect(shop.purchase("u2", "FX_SLIME")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("판매를 끄면 살 수 없다", async () => {
      await admin.updateItem("admin", "FX_GHOST", { onSale: false });
      db.setBalance("u1", 1000);
      await expect(shop.purchase("u1", "FX_GHOST")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("없는 상품·범위 밖 가격은 거절한다", async () => {
      await expect(
        admin.updateItem("admin", "NOPE", { price: 10 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        admin.updateItem("admin", "FX_SLIME", { price: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("기간 할인", () => {
    it("걸린 할인 중 가장 큰 것 하나만 적용하고, 그 값으로 산다", async () => {
      const now = Date.now();
      await admin.createDiscount("admin", {
        name: "전체 10%",
        percent: 10,
        itemCodes: [],
        startsAt: new Date(now - HOUR),
        endsAt: new Date(now + HOUR),
      });
      await admin.createDiscount("admin", {
        name: "슬라임 40%",
        percent: 40,
        itemCodes: ["FX_SLIME"],
        startsAt: new Date(now - HOUR),
        endsAt: new Date(now + HOUR),
      });
      const slime = await catalog.find("FX_SLIME");
      expect(slime?.discountPercent).toBe(40);
      expect(slime?.price).toBe(discounted(250, 40));
      expect((await catalog.find("FX_GHOST"))?.discountPercent).toBe(10);
      db.setBalance("u1", 1000);
      const res = await shop.purchase("u1", "FX_SLIME");
      expect(res.balance).toBe(1000 - 150);
    });

    it("화면에서 본 가격과 지금 가격이 다르면 사지 않는다", async () => {
      const now = Date.now();
      db.setBalance("u1", 1000);
      // 할인 전 가격(250)을 보고 있었는데 그 사이 40% 할인이 걸렸다 → 거절, 다시 확인하게
      await admin.createDiscount("admin", {
        name: "슬라임 40%",
        percent: 40,
        itemCodes: ["FX_SLIME"],
        startsAt: new Date(now - HOUR),
        endsAt: new Date(now + HOUR),
      });
      await expect(
        shop.purchase("u1", "FX_SLIME", false, 250),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(db.balance("u1")).toBe(1000);
      const res = await shop.purchase("u1", "FX_SLIME", false, 150);
      expect(res.balance).toBe(850);
    });

    it("기간 밖·끈 할인은 걸리지 않는다", async () => {
      const now = Date.now();
      await admin.createDiscount("admin", {
        name: "다음 주",
        percent: 50,
        itemCodes: [],
        startsAt: new Date(now + HOUR),
        endsAt: new Date(now + 2 * HOUR),
      });
      const live = await admin.createDiscount("admin", {
        name: "지금",
        percent: 30,
        itemCodes: [],
        startsAt: new Date(now - HOUR),
        endsAt: new Date(now + HOUR),
      });
      await admin.stopDiscount("admin", live.id);
      expect((await catalog.find("FX_SLIME"))?.discountPercent).toBe(0);
      const list = await admin.listDiscounts();
      expect(list.map((d) => d.status).sort()).toEqual(["OFF", "SCHEDULED"]);
    });

    it("할인율·기간·상품이 잘못되면 거절한다", async () => {
      const now = new Date();
      const base = {
        name: "x",
        itemCodes: [],
        startsAt: now,
        endsAt: new Date(now.getTime() + HOUR),
      };
      await expect(
        admin.createDiscount("admin", { ...base, percent: 95 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        admin.createDiscount("admin", { ...base, percent: 10, endsAt: now }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        admin.createDiscount("admin", {
          ...base,
          percent: 10,
          itemCodes: ["NOPE"],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("지급·회수", () => {
    it("메달 없이 지급하고(ADMIN), 두 번 주면 거절한다", async () => {
      await admin.grant("admin", "u1", "FX_SLIME", "이벤트 보상");
      expect(db.cosmetics()).toEqual([
        expect.objectContaining({
          userId: "u1",
          itemCode: "FX_SLIME",
          source: "ADMIN",
        }),
      ]);
      expect(db.balance("u1")).toBe(0);
      await expect(
        admin.grant("admin", "u1", "FX_SLIME", "또"),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        admin.grant("admin", "ghost", "FX_SLIME", "없는 사람"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("회수하면 보유·장착이 지워지고 메달은 돌려주지 않는다", async () => {
      db.setBalance("u1", 300);
      await shop.purchase("u1", "FX_SLIME", true);
      await admin.revoke("admin", "u1", "FX_SLIME", "부정 구매");
      expect(db.cosmetics()).toHaveLength(0);
      expect(db.loadouts()).toHaveLength(0);
      expect(db.balance("u1")).toBe(50);
      expect(db.audit()[db.audit().length - 1]).toMatchObject({
        action: "SHOP_REVOKE",
      });
    });

    it("회수당한 상품을 다시 살 수 있다 (구매 키 회차는 지난 구매 수로)", async () => {
      db.setBalance("u1", 1000);
      await shop.purchase("u1", "FX_SLIME");
      await admin.revoke("admin", "u1", "FX_SLIME", "부정 구매");
      const again = await shop.purchase("u1", "FX_SLIME");
      expect(again.balance).toBe(1000 - 250 - 250);
      expect(db.ledger().map((l: any) => l.idempotencyKey)).toEqual([
        "purchase:u1:FX_SLIME",
        "purchase:u1:FX_SLIME:1",
      ]);
    });
  });
});
