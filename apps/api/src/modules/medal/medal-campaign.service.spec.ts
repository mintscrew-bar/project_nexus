import { BadRequestException } from "@nestjs/common";
import { MedalReason } from "@nexus/database";
import { MedalService } from "./medal.service";
import { MedalCampaignService } from "./medal-campaign.service";
import { createFakePrisma } from "./medal.fake-prisma";

describe("MedalCampaignService (일괄 보상 지급)", () => {
  let db: ReturnType<typeof createFakePrisma>;
  let campaigns: MedalCampaignService;
  let events: { emit: jest.Mock };
  const notifications: any[] = [];

  const input = {
    key: "shop-open-2026-11",
    title: "상점 오픈 보상",
    base: 300,
    perMatch: 20,
    matchCap: 30,
    notify: true,
  };

  beforeEach(() => {
    db = createFakePrisma();
    notifications.length = 0;
    // 가입자 셋(정지·봇은 서비스의 where 가 거른다고 보고 여기선 걸러진 결과만 준다)
    db.api.user.findMany = jest.fn(async () => [
      { id: "u1", username: "고인물" },
      { id: "u2", username: "뉴비" },
      { id: "u3", username: "중수" },
    ]);
    db.api.medalMatchVoid = { findMany: jest.fn(async () => []) };
    // 완주 경기 수: u1 50판(상한 30에 걸림), u3 5판, u2 0판
    db.api.medalLedger.groupBy = jest.fn(async () => [
      { userId: "u1", _count: { _all: 50 } },
      { userId: "u3", _count: { _all: 5 } },
    ]);
    db.api.medalLedger.count = jest.fn(
      async ({ where }: any) =>
        db
          .ledger()
          .filter((l: any) =>
            l.idempotencyKey.startsWith(where.idempotencyKey.startsWith),
          ).length,
    );
    db.api.notification = {
      createMany: jest.fn(async ({ data }: any) => {
        notifications.push(...data);
        return { count: data.length };
      }),
    };
    events = { emit: jest.fn() };
    campaigns = new MedalCampaignService(
      db.api,
      new MedalService(db.api, events as any),
    );
  });

  it("미리보기는 쓰지 않고 몇 명·총 얼마를 알려 준다", async () => {
    const p = await campaigns.preview(input);
    // u1 300+20×30=900, u3 300+20×5=400, u2 300
    expect(p).toMatchObject({
      users: 3,
      activeUsers: 2,
      total: 1600,
      max: 900,
      min: 300,
      alreadyGranted: 0,
    });
    expect(p.top[0]).toEqual({ username: "고인물", matches: 50, amount: 900 });
    expect(db.ledger()).toHaveLength(0);
  });

  it("활동량에 따라 차등 지급하고, 알림·잔액 소켓 이벤트를 보낸다", async () => {
    const res = await campaigns.run("admin", input);
    expect(res).toEqual({ granted: 3, skipped: 0, failed: 0, total: 1600 });
    expect(db.balance("u1")).toBe(900);
    expect(db.balance("u2")).toBe(300);
    expect(db.balance("u3")).toBe(400);
    expect(db.ledger()[0]).toMatchObject({
      reason: MedalReason.ADMIN_ADJUST,
      idempotencyKey: "campaign:shop-open-2026-11:u1",
    });
    expect(notifications).toHaveLength(3);
    expect(notifications[0].message).toContain("900");
    // 헤더 칩이 바로 바뀌게 사람마다 잔액 이벤트
    expect(events.emit).toHaveBeenCalledWith("medal.balance.changed", {
      userId: "u1",
      balance: 900,
    });
  });

  it("같은 이름표로 다시 보내도 두 번 주지 않는다", async () => {
    await campaigns.run("admin", input);
    const again = await campaigns.run("admin", input);
    expect(again).toMatchObject({ granted: 0, skipped: 3, total: 0 });
    expect(db.balance("u1")).toBe(900);
    expect((await campaigns.preview(input)).alreadyGranted).toBe(3);
  });

  it("잘못된 설정은 거절한다", async () => {
    await expect(
      campaigns.preview({ ...input, key: "Bad Key!" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      campaigns.preview({ ...input, base: 0, perMatch: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      campaigns.preview({ ...input, base: 20000 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
