import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { MedalReason, Prisma } from "@nexus/database";
import { PrismaService } from "../prisma/prisma.service";

/** 잔액 변경 이벤트 이름 — NotificationGateway 가 받아 그 사람에게 소켓으로 보낸다 */
export const MEDAL_BALANCE_EVENT = "medal.balance.changed";

/**
 * 메달 원장 한 줄을 남기며 잔액을 바꾸는 요청.
 *
 * - `idempotencyKey` 는 "같은 지급"을 가리키는 고유 이름이다. 같은 키로 두 번 들어오면
 *   두 번째는 아무것도 바꾸지 않고 처음 줄을 돌려준다(재시도·중복 이벤트 방어).
 *   예: `match:<matchId>:complete:<userId>`, `admin:<요청 id>`
 * - `amount` 가 0 이면 잔액은 그대로 두고 기록만 남긴다(하루 상한에 걸린 지급).
 */
export interface MedalEntryInput {
  userId: string;
  amount: number;
  reason: MedalReason;
  idempotencyKey: string;
  sourceId?: string | null;
  /** 메달 출시 전 경기에 대한 소급 지급 */
  retro?: boolean;
  /** 하루 상한을 셀 날 (KST YYYY-MM-DD). 상한과 무관하면 비운다 */
  dayKey?: string | null;
  metadata?: Prisma.InputJsonValue;
  /**
   * 차감으로 잔액이 0 아래로 내려가도 되는가.
   * 구매는 막고(false), 결과 정정 회수·관리자 회수는 허용한다(이미 써 버렸어도 기록은 맞아야 한다).
   */
  allowNegative?: boolean;
}

export interface MedalEntryResult {
  entry: {
    id: string;
    amount: number;
    balanceAfter: number;
    reason: MedalReason;
    createdAt: Date;
  };
  /** 같은 키로 이미 처리된 요청이었는가 */
  duplicated: boolean;
}

/** 잔액이 모자라 차감할 수 없을 때 */
export class InsufficientMedalsError extends BadRequestException {
  constructor(
    public readonly balance: number,
    public readonly required: number,
  ) {
    super({
      code: "INSUFFICIENT_MEDALS",
      message: "메달이 부족해요.",
      balance,
      required,
    });
  }
}

const ENTRY_SELECT = {
  id: true,
  amount: true,
  balanceAfter: true,
  reason: true,
  createdAt: true,
} as const;

/** 내역 한 번에 돌려주는 최대 줄 수 */
const HISTORY_MAX = 50;

@Injectable()
export class MedalService {
  constructor(
    private readonly prisma: PrismaService,
    // 테스트처럼 이벤트 모듈이 없는 곳에서도 돌게 선택 주입
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  /**
   * 잔액이 바뀌었다고 알린다 — 알림 소켓이 그 사람 헤더의 메달 칩에 바로 전한다.
   * 관리자가 준 메달이 새로고침 없이 보이게(예전엔 1분 주기 확인까지 늦었다).
   * 트랜잭션이 커밋된 뒤에만 부른다 — 먼저 알리면 화면이 옛 잔액을 다시 읽는다.
   */
  announceBalance(userId: string | null | undefined, balance: number) {
    if (!userId) return;
    this.events?.emit(MEDAL_BALANCE_EVENT, { userId, balance });
  }

  /** 현재 잔액 — 지갑이 아직 없으면 0 */
  async getBalance(userId: string): Promise<number> {
    const wallet = await this.prisma.medalWallet.findUnique({
      where: { userId },
      select: { balance: true },
    });
    return wallet?.balance ?? 0;
  }

  /** 최근 내역 (최신순). cursor 는 직전 응답의 마지막 줄 id */
  async getHistory(userId: string, opts: { cursor?: string; limit?: number }) {
    const take = Math.min(Math.max(opts.limit ?? 20, 1), HISTORY_MAX);
    const rows = await this.prisma.medalLedger.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      select: {
        ...ENTRY_SELECT,
        sourceId: true,
        retro: true,
        metadata: true,
      },
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  /**
   * 메달 화면 위쪽 요약 — 잔액, 오늘 상한 진행, 사유별 합계, 받은·쓴 총량.
   * 상한 계산 기준(오늘 날짜·상한에 드는 사유)은 경기 메달 쪽이 정하므로 받아서 쓴다.
   */
  async getSummary(
    userId: string,
    cap: { dayKey: string; dailyCap: number; cappedReasons: MedalReason[] },
  ) {
    const [balance, today, groups] = await Promise.all([
      this.getBalance(userId),
      this.prisma.medalLedger.aggregate({
        where: {
          userId,
          dayKey: cap.dayKey,
          reason: { in: cap.cappedReasons },
        },
        _sum: { amount: true },
      }),
      this.prisma.medalLedger.groupBy({
        by: ["reason"],
        where: { userId },
        _sum: { amount: true },
      }),
    ]);
    const byReason = groups
      .map((g) => ({ reason: g.reason, amount: g._sum.amount ?? 0 }))
      .filter((g) => g.amount !== 0)
      .sort((a, b) => b.amount - a.amount);
    const net = (r: MedalReason) =>
      byReason.find((g) => g.reason === r)?.amount ?? 0;
    // 쓴 것 = 구매 − 환불, 받은 것 = 구매·환불을 뺀 나머지 순합(회수는 빼고 센다)
    const spent = -(net(MedalReason.PURCHASE) + net(MedalReason.REFUND));
    const earned = byReason
      .filter(
        (g) =>
          g.reason !== MedalReason.PURCHASE && g.reason !== MedalReason.REFUND,
      )
      .reduce((sum, g) => sum + g.amount, 0);
    return {
      balance,
      today: { earned: today._sum.amount ?? 0, cap: cap.dailyCap },
      earned,
      spent,
      byReason,
    };
  }

  /**
   * 원장 한 줄 + 잔액 변경을 하나의 트랜잭션으로.
   * 같은 키가 이미 있으면 바꾸지 않고 그 줄을 돌려준다.
   */
  async record(input: MedalEntryInput): Promise<MedalEntryResult> {
    assertValidInput(input);

    // 흔한 재시도는 트랜잭션을 열기 전에 걸러낸다
    const existing = await this.findByKey(input.idempotencyKey);
    if (existing) return { entry: existing, duplicated: true };

    try {
      const entry = await this.prisma.$transaction((tx) =>
        this.recordInTx(tx, input),
      );
      this.announceBalance(input.userId, entry.balanceAfter);
      return { entry, duplicated: false };
    } catch (err: any) {
      // 같은 키 두 요청이 동시에 들어와 한쪽이 유니크 제약에 걸린 경우 —
      // 그쪽 트랜잭션은 잔액 변경까지 통째로 되돌려졌으니 먼저 들어간 줄을 돌려준다
      if (err?.code === "P2002") {
        const winner = await this.findByKey(input.idempotencyKey);
        if (winner) return { entry: winner, duplicated: true };
      }
      throw err;
    }
  }

  /**
   * 바깥 트랜잭션 안에서 원장을 남긴다(구매처럼 다른 변경과 함께 묶어야 할 때).
   * 중복 키는 P2002 로 그대로 던진다 — 바깥 트랜잭션이 통째로 되돌려지게.
   */
  async recordInTx(tx: Prisma.TransactionClient, input: MedalEntryInput) {
    assertValidInput(input);
    const { userId, amount } = input;

    // 지갑 행을 보장한다(첫 지급)
    await tx.medalWallet.upsert({
      where: { userId },
      create: { userId, balance: 0 },
      update: {},
    });

    if (amount < 0 && !input.allowNegative) {
      // 잔액이 충분할 때만 깎는다 — 조건과 차감을 한 문장으로 해 동시 구매에도 안전하다
      const updated = await tx.medalWallet.updateMany({
        where: { userId, balance: { gte: -amount } },
        data: { balance: { increment: amount } },
      });
      if (updated.count === 0) {
        const wallet = await tx.medalWallet.findUnique({ where: { userId } });
        throw new InsufficientMedalsError(wallet?.balance ?? 0, -amount);
      }
    } else if (amount !== 0) {
      await tx.medalWallet.update({
        where: { userId },
        data: { balance: { increment: amount } },
      });
    }

    // 방금 바꾼 행이라 이 트랜잭션이 끝날 때까지 잠겨 있다 — 다른 요청에 끼어들 틈이 없다
    const wallet = await tx.medalWallet.findUniqueOrThrow({
      where: { userId },
      select: { balance: true },
    });

    return tx.medalLedger.create({
      data: {
        userId,
        amount,
        balanceAfter: wallet.balance,
        reason: input.reason,
        sourceId: input.sourceId ?? null,
        idempotencyKey: input.idempotencyKey,
        retro: input.retro ?? false,
        dayKey: input.dayKey ?? null,
        metadata: input.metadata,
      },
      select: ENTRY_SELECT,
    });
  }

  /**
   * 하루 상한이 있는 지급. 그날(dayKey) 이미 받은 상한 대상 메달을 세어
   * 남은 만큼만 준다. 다 찼으면 0 메달 줄로 남긴다(분석·이상 활동 탐지용).
   * 같은 사람의 지급이 동시에 들어와도 상한을 넘지 않게 지갑 행을 잠그고 센다.
   */
  async recordCapped(
    input: MedalEntryInput & { dayKey: string },
    opts: { dailyCap: number; cappedReasons: MedalReason[] },
  ): Promise<MedalEntryResult> {
    assertValidInput(input);
    const existing = await this.findByKey(input.idempotencyKey);
    if (existing) return { entry: existing, duplicated: true };

    try {
      const entry = await this.prisma.$transaction(async (tx) => {
        await tx.medalWallet.upsert({
          where: { userId: input.userId },
          create: { userId: input.userId, balance: 0 },
          update: {},
        });
        // 같은 사람의 상한 계산이 겹치지 않게 지갑 행을 잠근다
        await tx.$executeRaw`SELECT 1 FROM "medal_wallets" WHERE "userId" = ${input.userId} FOR UPDATE`;
        const used = await tx.medalLedger.aggregate({
          where: {
            userId: input.userId,
            dayKey: input.dayKey,
            reason: { in: opts.cappedReasons },
          },
          _sum: { amount: true },
        });
        const room = Math.max(0, opts.dailyCap - (used._sum.amount ?? 0));
        const amount = Math.min(input.amount, room);
        return this.recordInTx(tx, {
          ...input,
          amount,
          metadata: {
            ...((input.metadata as Record<string, unknown>) ?? {}),
            ...(amount < input.amount
              ? { capped: true, requested: input.amount }
              : {}),
          },
        });
      });
      this.announceBalance(input.userId, entry.balanceAfter);
      return { entry, duplicated: false };
    } catch (err: any) {
      if (err?.code === "P2002") {
        const winner = await this.findByKey(input.idempotencyKey);
        if (winner) return { entry: winner, duplicated: true };
      }
      throw err;
    }
  }

  /**
   * 관리자 지급·회수. 감사 로그를 같은 트랜잭션에 남긴다.
   * `requestId` 는 관리자 화면이 요청마다 만든 값 — 두 번 눌러도 한 번만 반영된다.
   */
  async adminAdjust(input: {
    adminId: string;
    userId: string;
    amount: number;
    memo: string;
    requestId: string;
    /**
     * 잔액보다 큰 회수를 허용할지 (Task 17). 기본은 막는다 — 잘못 친 숫자로 잔액이
     * 마이너스가 되지 않게. 부정 획득 회수처럼 마이너스가 맞는 경우만 화면에서 따로 체크한다.
     */
    allowNegative?: boolean;
  }): Promise<MedalEntryResult> {
    if (input.amount === 0) {
      throw new BadRequestException("0 메달은 조정할 수 없어요.");
    }
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true },
    });
    if (!user) throw new BadRequestException("사용자를 찾을 수 없어요.");

    const idempotencyKey = `admin:${input.requestId}`;
    const existing = await this.findByKey(idempotencyKey);
    if (existing) return { entry: existing, duplicated: true };

    try {
      const entry = await this.prisma.$transaction(async (tx) => {
        const row = await this.recordInTx(tx, {
          userId: input.userId,
          amount: input.amount,
          reason: MedalReason.ADMIN_ADJUST,
          idempotencyKey,
          sourceId: input.adminId,
          // 잔액보다 큰 회수는 기본으로 막는다(InsufficientMedalsError). 허용하면 마이너스 잔액이 된다
          allowNegative: input.allowNegative ?? false,
          metadata: {
            memo: input.memo,
            adminId: input.adminId,
            ...(input.allowNegative ? { allowNegative: true } : {}),
          },
        });
        await tx.adminAuditLog.create({
          data: {
            adminId: input.adminId,
            action: "MEDAL_ADJUST",
            targetType: "USER",
            targetId: input.userId,
            details: {
              amount: input.amount,
              memo: input.memo,
              ledgerId: row.id,
              balanceBefore: row.balanceAfter - input.amount,
              balanceAfter: row.balanceAfter,
              allowNegative: input.allowNegative ?? false,
            },
          },
        });
        return row;
      });
      this.announceBalance(input.userId, entry.balanceAfter);
      return { entry, duplicated: false };
    } catch (err: any) {
      if (err?.code === "P2002") {
        const winner = await this.findByKey(idempotencyKey);
        if (winner) return { entry: winner, duplicated: true };
      }
      throw err;
    }
  }

  /**
   * 관리자 원장 조회 (Task 17) — 전체 또는 한 사람, 사유로 거를 수 있다. 최신순 커서 페이지.
   * 누가 받았는지 보이게 사용자 이름을 붙인다(탈퇴로 끊긴 줄은 user 가 null).
   */
  async adminLedger(opts: {
    userId?: string;
    reason?: MedalReason;
    cursor?: string;
    limit?: number;
  }) {
    const take = Math.min(Math.max(opts.limit ?? 50, 1), 100);
    const rows = await this.prisma.medalLedger.findMany({
      where: {
        ...(opts.userId ? { userId: opts.userId } : {}),
        ...(opts.reason ? { reason: opts.reason } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      include: { user: { select: { id: true, username: true, avatar: true } } },
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  private findByKey(idempotencyKey: string) {
    return this.prisma.medalLedger.findUnique({
      where: { idempotencyKey },
      select: ENTRY_SELECT,
    });
  }
}

function assertValidInput(input: MedalEntryInput) {
  if (!Number.isInteger(input.amount)) {
    throw new BadRequestException("메달은 정수로만 오간다.");
  }
  if (!input.idempotencyKey) {
    throw new BadRequestException("idempotencyKey 가 필요하다.");
  }
}
