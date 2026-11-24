import { BadRequestException, ConflictException } from "@nestjs/common";
import { MedalReason } from "@nexus/database";
import { MedalService } from "./medal.service";
import { ShopService } from "./shop.service";
import { ShopCatalogService, discounted } from "./shop-catalog.service";
import { ShopBundleService } from "./shop-bundle.service";
import { createFakePrisma } from "./medal.fake-prisma";

describe("ShopBundleService (묶음 상품)", () => {
  let db: ReturnType<typeof createFakePrisma>;
  let shop: ShopService;
  let bundles: ShopBundleService;

  // FX_SLIME 250 + FX_GHOST 250 + AV_CAT_EARS 300 = 800, 20% 할인 → 640
  const input = {
    name: "입문 세트",
    itemCodes: ["FX_SLIME", "FX_GHOST", "AV_CAT_EARS"],
    percent: 20,
  };

  beforeEach(() => {
    db = createFakePrisma();
    const medal = new MedalService(db.api);
    const catalog = new ShopCatalogService(db.api);
    shop = new ShopService(db.api, medal, catalog);
    bundles = new ShopBundleService(db.api, medal, catalog);
  });

  it("아무것도 없으면 전체 값에 묶음 할인을 걸어 한 번에 산다", async () => {
    const b = await bundles.create("admin", input);
    const [view] = await bundles.listForUser("u1");
    expect(view).toMatchObject({ fullPrice: 800, price: 640 });
    db.setBalance("u1", 1000);
    const res = await bundles.purchase("u1", b.id, 640);
    expect(res.balance).toBe(360);
    expect(
      db
        .cosmetics()
        .map((c: any) => c.itemCode)
        .sort(),
    ).toEqual(["AV_CAT_EARS", "FX_GHOST", "FX_SLIME"].sort());
    // 원장은 한 줄, 상품별 몫의 합이 낸 값
    const row = db.ledger()[0];
    expect(row).toMatchObject({
      amount: -640,
      reason: MedalReason.PURCHASE,
      sourceId: `bundle:${b.id}`,
    });
    const alloc = row.metadata.allocations as Record<string, number>;
    expect(Object.values(alloc).reduce((s, v) => s + v, 0)).toBe(640);
  });

  it("이미 가진 상품은 빼고 남은 값에만 할인한다", async () => {
    const b = await bundles.create("admin", input);
    db.setBalance("u1", 2000);
    await shop.purchase("u1", "FX_SLIME");
    const [view] = await bundles.listForUser("u1");
    expect(view.owned).toEqual(["FX_SLIME"]);
    expect(view.price).toBe(discounted(550, 20));
    await bundles.purchase("u1", b.id);
    expect(db.balance("u1")).toBe(2000 - 250 - 440);
    // 다 가지면 더는 못 산다
    await expect(bundles.purchase("u1", b.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("본 가격과 다르거나 판매를 내린 묶음은 사지 않는다", async () => {
    const b = await bundles.create("admin", input);
    db.setBalance("u1", 1000);
    await expect(bundles.purchase("u1", b.id, 800)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await bundles.update("admin", b.id, { onSale: false });
    await expect(bundles.purchase("u1", b.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db.balance("u1")).toBe(1000);
  });

  it("묶음으로 산 상품 하나를 환불하면 그 몫만 돌려주고, 다른 것도 따로 환불된다", async () => {
    const b = await bundles.create("admin", input);
    db.setBalance("u1", 1000);
    await bundles.purchase("u1", b.id);
    const alloc = db.ledger()[0].metadata.allocations as Record<string, number>;
    const r1 = await shop.adminRefund({
      adminId: "admin",
      userId: "u1",
      itemCode: "FX_SLIME",
      memo: "테스트",
    });
    expect(r1.refunded).toBe(alloc.FX_SLIME);
    const r2 = await shop.adminRefund({
      adminId: "admin",
      userId: "u1",
      itemCode: "FX_GHOST",
      memo: "테스트",
    });
    expect(r2.refunded).toBe(alloc.FX_GHOST);
    expect(db.balance("u1")).toBe(360 + alloc.FX_SLIME + alloc.FX_GHOST);
  });

  it("상품 수·할인율이 잘못되면 만들지 않는다", async () => {
    await expect(
      bundles.create("admin", { ...input, itemCodes: ["FX_SLIME"] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      bundles.create("admin", { ...input, percent: 95 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      bundles.create("admin", { ...input, itemCodes: ["FX_SLIME", "NOPE"] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
