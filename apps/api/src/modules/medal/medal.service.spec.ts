import { MedalReason } from "@nexus/database";
import { InsufficientMedalsError, MedalService } from "./medal.service";
import { createFakePrisma } from "./medal.fake-prisma";

describe("MedalService", () => {
  let db: ReturnType<typeof createFakePrisma>;
  let service: MedalService;

  beforeEach(() => {
    db = createFakePrisma();
    service = new MedalService(db.api);
  });

  const grant = (key: string, amount = 10, extra: any = {}) =>
    service.record({
      userId: "u1",
      amount,
      reason: MedalReason.MATCH_COMPLETE,
      idempotencyKey: key,
      sourceId: "m1",
      ...extra,
    });

  describe("record — 지급", () => {
    it("첫 지급이면 지갑을 만들고 잔액과 원장 잔액이 같다", async () => {
      const res = await grant("match:m1:complete:u1");
      expect(res.duplicated).toBe(false);
      expect(res.entry.balanceAfter).toBe(10);
      expect(db.balance("u1")).toBe(10);
      expect(db.ledger()).toHaveLength(1);
    });

    it("지급이 쌓이면 원장의 잔액이 차례로 늘어난다", async () => {
      await grant("a", 10);
      await grant("b", 5);
      const res = await grant("c", 3);
      expect(res.entry.balanceAfter).toBe(18);
      expect(db.ledger().map((l) => l.balanceAfter)).toEqual([10, 15, 18]);
    });

    it("같은 키로 다시 들어오면 잔액을 바꾸지 않고 처음 줄을 돌려준다", async () => {
      const first = await grant("match:m1:complete:u1");
      const again = await grant("match:m1:complete:u1");
      expect(again.duplicated).toBe(true);
      expect(again.entry.id).toBe(first.entry.id);
      expect(db.balance("u1")).toBe(10);
      expect(db.ledger()).toHaveLength(1);
    });

    it("동시 요청이 유니크 제약에 걸리면 잔액 변경까지 되돌리고 먼저 들어간 줄을 준다", async () => {
      // 미리 확인할 땐 없었는데, 트랜잭션 사이에 다른 요청이 같은 키를 넣은 상황
      db.api.medalLedger.findUnique.mockResolvedValueOnce(null);
      db.setBalance("u1", 10);
      db.insertLedger({
        id: "winner",
        userId: "u1",
        amount: 10,
        balanceAfter: 10,
        reason: MedalReason.MATCH_COMPLETE,
        idempotencyKey: "race",
        createdAt: new Date(),
      });

      const res = await grant("race", 10);
      expect(res.duplicated).toBe(true);
      expect(res.entry.id).toBe("winner");
      expect(db.balance("u1")).toBe(10); // 두 번 더해지지 않았다
    });

    it("0 메달은 잔액을 두고 기록만 남긴다 (하루 상한에 걸린 지급)", async () => {
      await grant("a", 10);
      const res = await grant("capped", 0, { metadata: { capped: true } });
      expect(res.entry.amount).toBe(0);
      expect(res.entry.balanceAfter).toBe(10);
      expect(db.balance("u1")).toBe(10);
    });

    it("소급 지급 표시가 원장에 남는다", async () => {
      await grant("retro:m9:complete:u1", 10, { retro: true });
      expect(db.ledger()[0].retro).toBe(true);
    });

    it("정수가 아닌 메달은 받지 않는다", async () => {
      await expect(grant("x", 1.5)).rejects.toThrow();
      expect(db.ledger()).toHaveLength(0);
    });
  });

  describe("record — 차감", () => {
    it("잔액이 충분하면 깎는다", async () => {
      db.setBalance("u1", 300);
      const res = await service.record({
        userId: "u1",
        amount: -250,
        reason: MedalReason.PURCHASE,
        idempotencyKey: "buy:FX_SLIME:u1",
      });
      expect(res.entry.balanceAfter).toBe(50);
      expect(db.balance("u1")).toBe(50);
    });

    it("잔액이 모자라면 막고 아무것도 남기지 않는다", async () => {
      db.setBalance("u1", 100);
      await expect(
        service.record({
          userId: "u1",
          amount: -250,
          reason: MedalReason.PURCHASE,
          idempotencyKey: "buy:FX_SLIME:u1",
        }),
      ).rejects.toBeInstanceOf(InsufficientMedalsError);
      expect(db.balance("u1")).toBe(100);
      expect(db.ledger()).toHaveLength(0);
    });

    it("회수는 잔액이 0 아래로 내려가도 기록한다", async () => {
      db.setBalance("u1", 5);
      const res = await service.record({
        userId: "u1",
        amount: -20,
        reason: MedalReason.MATCH_VOID,
        idempotencyKey: "void:m1:u1",
        allowNegative: true,
      });
      expect(res.entry.balanceAfter).toBe(-15);
    });
  });

  describe("adminAdjust", () => {
    const adjust = (amount: number, requestId = "req-1", userId = "u1") =>
      service.adminAdjust({
        adminId: "admin",
        userId,
        amount,
        memo: "이벤트 보상",
        requestId,
      });

    it("원장과 감사 로그를 함께 남긴다", async () => {
      const res = await adjust(100);
      expect(res.entry.balanceAfter).toBe(100);
      expect(db.ledger()[0]).toMatchObject({
        reason: MedalReason.ADMIN_ADJUST,
        sourceId: "admin",
        idempotencyKey: "admin:req-1",
      });
      expect(db.audit()[0]).toMatchObject({
        action: "MEDAL_ADJUST",
        targetId: "u1",
        details: expect.objectContaining({ amount: 100, balanceAfter: 100 }),
      });
    });

    it("같은 요청을 두 번 보내도 한 번만 반영한다", async () => {
      await adjust(100);
      const again = await adjust(100);
      expect(again.duplicated).toBe(true);
      expect(db.balance("u1")).toBe(100);
      expect(db.audit()).toHaveLength(1);
    });

    it("회수는 잔액보다 많아도 마이너스로 기록한다", async () => {
      db.setBalance("u1", 30);
      const res = await adjust(-50, "req-2");
      expect(res.entry.balanceAfter).toBe(-20);
    });

    it("없는 사용자·0 메달은 거절한다", async () => {
      await expect(adjust(10, "r", "ghost")).rejects.toThrow(
        "사용자를 찾을 수 없어요.",
      );
      await expect(adjust(0, "r0")).rejects.toThrow();
      expect(db.ledger()).toHaveLength(0);
    });
  });

  describe("조회", () => {
    it("지갑이 없으면 잔액 0", async () => {
      expect(await service.getBalance("u2")).toBe(0);
    });

    it("내역은 최신순이고 다음 페이지 커서를 준다", async () => {
      await grant("a", 1);
      await grant("b", 2);
      await grant("c", 3);
      const page1 = await service.getHistory("u1", { limit: 2 });
      expect(page1.items.map((i: any) => i.amount)).toEqual([3, 2]);
      expect(page1.nextCursor).toBe(page1.items[1].id);
      const page2 = await service.getHistory("u1", {
        limit: 2,
        cursor: page1.nextCursor!,
      });
      expect(page2.items.map((i: any) => i.amount)).toEqual([1]);
      expect(page2.nextCursor).toBeNull();
    });
  });
});
