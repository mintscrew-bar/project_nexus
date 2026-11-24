/* 테스트 전용 — 메달·상점 서비스를 메모리 DB 로 돌려 본다 */
/**
 * 메모리 위의 가짜 DB — 지갑·원장·감사 로그와 원장 키 유니크 제약,
 * 트랜잭션 되돌리기까지 흉내 낸다. 서비스의 실제 계산을 그대로 돌려 보려는 것.
 */
export function createFakePrisma() {
  const wallets = new Map<string, { userId: string; balance: number }>();
  let ledger: any[] = [];
  let audit: any[] = [];
  let cosmetics: any[] = [];
  let loadouts: any[] = [];
  const overrides: any[] = [];
  const discounts: any[] = [];
  let customs: any[] = [];
  const bundles: any[] = [];
  const users = new Set(["u1", "u2", "admin"]);

  const api: any = {
    medalWallet: {
      findUnique: jest.fn(
        async ({ where }: any) => wallets.get(where.userId) ?? null,
      ),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        const w = wallets.get(where.userId);
        if (!w) throw new Error("not found");
        return { ...w };
      }),
      upsert: jest.fn(async ({ where, create }: any) => {
        if (!wallets.has(where.userId))
          wallets.set(where.userId, { ...create });
        return wallets.get(where.userId);
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const w = wallets.get(where.userId);
        if (!w || w.balance < where.balance.gte) return { count: 0 };
        w.balance += data.balance.increment;
        return { count: 1 };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const w = wallets.get(where.userId)!;
        w.balance += data.balance.increment;
        return w;
      }),
    },
    medalLedger: {
      findUnique: jest.fn(
        async ({ where }: any) =>
          ledger.find((l) =>
            where.id
              ? l.id === where.id
              : l.idempotencyKey === where.idempotencyKey,
          ) ?? null,
      ),
      count: jest.fn(
        async ({ where }: any) =>
          ledger.filter(
            (l) =>
              (where.userId === undefined || l.userId === where.userId) &&
              (where.reason === undefined || l.reason === where.reason) &&
              (where.sourceId === undefined || l.sourceId === where.sourceId),
          ).length,
      ),
      create: jest.fn(async ({ data }: any) => {
        if (ledger.some((l) => l.idempotencyKey === data.idempotencyKey)) {
          const err: any = new Error("Unique constraint failed");
          err.code = "P2002";
          throw err;
        }
        const row = {
          id: `l${ledger.length + 1}`,
          createdAt: new Date(2026, 10, 12, 0, 0, ledger.length),
          ...data,
        };
        ledger.push(row);
        return row;
      }),
      aggregate: jest.fn(async ({ where }: any) => ({
        _sum: {
          amount: ledger
            .filter(
              (l) =>
                l.userId === where.userId &&
                l.dayKey === where.dayKey &&
                where.reason.in.includes(l.reason),
            )
            .reduce((sum, l) => sum + l.amount, 0),
        },
      })),
      groupBy: jest.fn(async ({ where }: any) => {
        const sums = new Map<string, number>();
        for (const l of ledger.filter((r) => r.userId === where.userId))
          sums.set(l.reason, (sums.get(l.reason) ?? 0) + l.amount);
        return [...sums].map(([reason, amount]) => ({
          reason,
          _sum: { amount },
        }));
      }),
      findMany: jest.fn(async ({ where, take, cursor }: any) => {
        let rows = ledger
          .filter((l) =>
            where.id?.in
              ? where.id.in.includes(l.id)
              : (where.userId === undefined || l.userId === where.userId) &&
                (where.reason === undefined || l.reason === where.reason),
          )
          .sort((a, b) => b.createdAt - a.createdAt);
        if (cursor) {
          const i = rows.findIndex((r) => r.id === cursor.id);
          rows = rows.slice(i + 1);
        }
        return rows.slice(0, take);
      }),
    },
    adminAuditLog: {
      create: jest.fn(async ({ data }: any) => {
        audit.push(data);
        return data;
      }),
    },
    userCosmetic: {
      count: jest.fn(
        async ({ where }: any) =>
          cosmetics.filter(
            (c) =>
              (where.itemCode === undefined || c.itemCode === where.itemCode) &&
              (where.userId === undefined || c.userId === where.userId),
          ).length,
      ),
      findUnique: jest.fn(
        async ({ where }: any) =>
          cosmetics.find(
            (c) =>
              c.userId === where.userId_itemCode.userId &&
              c.itemCode === where.userId_itemCode.itemCode,
          ) ?? null,
      ),
      findMany: jest.fn(async ({ where }: any) =>
        cosmetics.filter((c) =>
          where.OR
            ? where.OR.some(
                (o: any) => o.userId === c.userId && o.itemCode === c.itemCode,
              )
            : c.userId === where.userId,
        ),
      ),
      update: jest.fn(async ({ where, data }: any) => {
        const row = cosmetics.find((c) => c.id === where.id);
        if (!row) throw new Error("not found");
        Object.assign(row, data);
        return row;
      }),
      delete: jest.fn(async ({ where }: any) => {
        const row = cosmetics.find((c) => c.id === where.id);
        cosmetics = cosmetics.filter((c) => c.id !== where.id);
        return row;
      }),
      create: jest.fn(async ({ data }: any) => {
        if (
          cosmetics.some(
            (c) => c.userId === data.userId && c.itemCode === data.itemCode,
          )
        ) {
          const err: any = new Error("Unique constraint failed");
          err.code = "P2002";
          throw err;
        }
        const row = { id: `c${cosmetics.length + 1}`, ...data };
        cosmetics.push(row);
        return row;
      }),
    },
    userCosmeticLoadout: {
      findMany: jest.fn(async ({ where }: any) =>
        loadouts.filter((l) => where.userId.in.includes(l.userId)),
      ),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const key = where.userId_slot;
        const row = loadouts.find(
          (l) => l.userId === key.userId && l.slot === key.slot,
        );
        if (row) Object.assign(row, update);
        else loadouts.push({ ...create });
        return row ?? create;
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        const before = loadouts.length;
        loadouts = loadouts.filter(
          (l) =>
            !(
              l.userId === where.userId &&
              (where.slot === undefined || l.slot === where.slot) &&
              (where.itemCode === undefined || l.itemCode === where.itemCode)
            ),
        );
        return { count: before - loadouts.length };
      }),
    },
    user: {
      findUnique: jest.fn(async ({ where }: any) =>
        users.has(where.id) ? { id: where.id, username: where.id } : null,
      ),
    },
    // 상점 관리 — 상품 덮어쓰기·기간 할인
    shopItemOverride: {
      findMany: jest.fn(async () => overrides),
      findUnique: jest.fn(
        async ({ where }: any) =>
          overrides.find((o) => o.code === where.code) ?? null,
      ),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const row = overrides.find((o) => o.code === where.code);
        if (row) {
          Object.assign(row, update);
          return row;
        }
        const created = { hidden: false, ...create };
        overrides.push(created);
        return created;
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        const before = overrides.length;
        for (let i = overrides.length - 1; i >= 0; i--)
          if (overrides[i].code === where.code) overrides.splice(i, 1);
        return { count: before - overrides.length };
      }),
    },
    // 묶음 상품
    shopBundle: {
      findMany: jest.fn(async ({ where }: any = {}) =>
        bundles.filter(
          (b) => where?.onSale === undefined || b.onSale === where.onSale,
        ),
      ),
      findUnique: jest.fn(
        async ({ where }: any) =>
          bundles.find((b) => b.id === where.id) ?? null,
      ),
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: `b${bundles.length + 1}`,
          description: "",
          onSale: true,
          sortOrder: 0,
          createdAt: new Date(),
          ...data,
        };
        bundles.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = bundles.find((b) => b.id === where.id);
        Object.assign(row, data);
        return row;
      }),
    },
    // 상점 관리 2단계 — 관리자가 추가한 상품
    shopCustomItem: {
      findMany: jest.fn(async () => customs),
      findUnique: jest.fn(
        async ({ where }: any) =>
          customs.find((c) => c.code === where.code) ?? null,
      ),
      create: jest.fn(async ({ data }: any) => {
        const row = {
          description: "",
          onSale: true,
          baseCode: null,
          videoUrl: null,
          mp4Url: null,
          posterUrl: null,
          createdAt: new Date(),
          ...data,
        };
        customs.push(row);
        return row;
      }),
      delete: jest.fn(async ({ where }: any) => {
        const row = customs.find((c) => c.code === where.code);
        customs = customs.filter((c) => c.code !== where.code);
        return row;
      }),
    },
    shopDiscount: {
      findMany: jest.fn(async ({ where }: any = {}) =>
        discounts.filter(
          (d) =>
            !where ||
            ((where.active === undefined || d.active === where.active) &&
              (!where.startsAt || d.startsAt <= where.startsAt.lte) &&
              (!where.endsAt || d.endsAt > where.endsAt.gt)),
        ),
      ),
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: `d${discounts.length + 1}`,
          active: true,
          itemCodes: [],
          ...data,
        };
        discounts.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = discounts.find((d) => d.id === where.id);
        if (!row) throw new Error("not found");
        Object.assign(row, data);
        return row;
      }),
    },
    // 지갑 행 잠금(SELECT ... FOR UPDATE) — 메모리에선 할 일이 없다
    $executeRaw: jest.fn(async () => 1),
    // 트랜잭션 — 안에서 던지면 지갑·원장·감사 로그를 들어가기 전 상태로 되돌린다
    $transaction: jest.fn(async (fn: (tx: any) => Promise<any>) => {
      const walletSnap = new Map(
        [...wallets].map(([k, v]) => [k, { ...v }] as const),
      );
      const ledgerSnap = [...ledger];
      const auditSnap = [...audit];
      const cosmeticSnap = [...cosmetics];
      const loadoutSnap = loadouts.map((l) => ({ ...l }));
      try {
        return await fn(api);
      } catch (err) {
        cosmetics = cosmeticSnap;
        loadouts = loadoutSnap;
        wallets.clear();
        walletSnap.forEach((v, k) => wallets.set(k, v));
        ledger = ledgerSnap;
        audit = auditSnap;
        throw err;
      }
    }),
  };

  return {
    api,
    balance: (userId: string) => wallets.get(userId)?.balance ?? 0,
    ledger: () => ledger,
    audit: () => audit,
    cosmetics: () => cosmetics,
    loadouts: () => loadouts,
    customs: () => customs,
    /** 다른 요청이 먼저 넣은 원장 줄을 흉내 낸다 */
    insertLedger: (row: any) => ledger.push(row),
    setBalance: (userId: string, balance: number) =>
      wallets.set(userId, { userId, balance }),
  };
}
