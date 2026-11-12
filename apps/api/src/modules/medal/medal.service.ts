import { BadRequestException, Injectable } from "@nestjs/common";
import { MedalReason, Prisma } from "@nexus/database";
import { PrismaService } from "../prisma/prisma.service";

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
  constructor(private readonly prisma: PrismaService) {}

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
        metadata: input.metadata,
      },
      select: ENTRY_SELECT,
    });
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
          // 회수는 이미 써 버린 메달이라도 기록이 맞아야 하므로 마이너스를 허용한다
          allowNegative: true,
          metadata: { memo: input.memo, adminId: input.adminId },
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
              balanceAfter: row.balanceAfter,
            },
          },
        });
        return row;
      });
      return { entry, duplicated: false };
    } catch (err: any) {
      if (err?.code === "P2002") {
        const winner = await this.findByKey(idempotencyKey);
        if (winner) return { entry: winner, duplicated: true };
      }
      throw err;
    }
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
