import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { TEST_BOT_USER_WHERE } from "../common/test-bot.util";
import { addDays, kstDateOf, kstDayRange, yesterdayKst } from "./kst-day";

/** 처음 켰을 때 거꾸로 채울 일수 */
const INITIAL_BACKFILL_DAYS = 60;
const LOCK_KEY = "admin:daily-stat";

/**
 * 일별 운영 지표 스냅샷.
 *
 * `User.lastSeenAt` 은 마지막 접속 한 칸뿐이라 "지난주 활성 유저" 는 그때 세어 두지
 * 않으면 알 수 없다. 그래서 매일 한 번 기록한다. 가입·방·기록 수는 `createdAt` 등으로
 * 과거를 다시 셀 수 있어 백필하지만, **활성 유저는 백필하지 않는다** — 지금 값으로
 * 과거를 채우면 그럴듯하지만 틀린 숫자가 된다.
 *
 * 마감한 날(어제)을 기록하므로 방·기록 지표는 하루가 다 끝난 값이고, 활성 유저는
 * 다음 날 00:10 시점 기준이다(그날 끝 무렵과 거의 같다).
 */
@Injectable()
export class AdminStatsSnapshotService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminStatsSnapshotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** 비어 있으면 가능한 지표만 거꾸로 채운다. 실패해도 서버 기동을 막지 않는다. */
  async onApplicationBootstrap() {
    try {
      const existing = await this.prisma.adminDailyStat.count();
      if (existing === 0) await this.backfill(INITIAL_BACKFILL_DAYS);
    } catch (error) {
      this.logger.warn(`일별 지표 초기 백필 실패: ${(error as Error).message}`);
    }
  }

  @Cron("10 0 * * *", { timeZone: "Asia/Seoul" })
  async handleDaily() {
    const token = await this.redis.acquireLock(LOCK_KEY, 10 * 60_000);
    if (!token) return;
    try {
      const day = yesterdayKst(new Date());
      await this.captureDay(day, { live: true });
      this.logger.log(`일별 지표 기록: ${day.toISOString().slice(0, 10)}`);
    } catch (error) {
      this.logger.error("일별 지표 기록 실패", error);
    } finally {
      await this.redis.releaseLock(LOCK_KEY, token);
    }
  }

  /**
   * 지난 `days` 일을 채운다. 이미 있는 줄은 덮어쓰되 활성 칼럼은 건드리지 않는다.
   * 오늘(진행 중인 날)은 포함하지 않는다.
   */
  async backfill(days: number) {
    const last = yesterdayKst(new Date());
    let done = 0;
    for (let i = days - 1; i >= 0; i--) {
      await this.captureDay(addDays(last, -i), { live: false });
      done++;
    }
    return { days: done };
  }

  /**
   * 하루치(KST) 지표를 범위별로 기록한다. 몇 번 불러도 같은 줄을 갱신한다.
   * `live` 일 때만 활성 유저를 센다 — 지금 시각 기준 값이라 과거 날짜에는 틀리다.
   */
  async captureDay(date: Date, opts: { live: boolean }) {
    const { start, end } = kstDayRange(date);
    const notBot = { NOT: TEST_BOT_USER_WHERE };

    const [totalUsers, newUsers, active1d, active7d, active30d] =
      await Promise.all([
        this.prisma.user.count({
          where: { createdAt: { lt: end }, ...notBot },
        }),
        this.prisma.user.count({
          where: { createdAt: { gte: start, lt: end }, ...notBot },
        }),
        ...[1, 7, 30].map((d) =>
          opts.live
            ? this.prisma.user.count({
                where: {
                  lastSeenAt: { gte: new Date(Date.now() - d * 86_400_000) },
                  ...notBot,
                },
              })
            : Promise.resolve(undefined),
        ),
      ]);

    // RoomOutcome 이 쌓이기 전의 날은 방 지표를 0 이 아니라 null 로 둔다.
    // 0 은 "방이 없었다" 로 읽히지만 실제로는 "기록이 없었다" 다.
    const firstOutcome = await this.prisma.roomOutcome.findFirst({
      orderBy: { endedAt: "asc" },
      select: { endedAt: true },
    });
    const hasRoomData = !!firstOutcome && firstOutcome.endedAt < end;

    const roomsFor = async (gameTitle?: "LOL" | "PUBG") => {
      if (!hasRoomData)
        return { roomsEnded: null, roomsStarted: null } as const;
      const where = {
        endedAt: { gte: start, lt: end },
        hostIsBot: false,
        ...(gameTitle ? { gameTitle } : {}),
      };
      const [ended, started] = await Promise.all([
        this.prisma.roomOutcome.count({ where }),
        this.prisma.roomOutcome.count({
          where: { ...where, startedAt: { not: null } },
        }),
      ]);
      return { roomsEnded: ended, roomsStarted: started };
    };
    const lolRecords = () =>
      this.prisma.match.count({
        where: { isInternal: true, completedAt: { gte: start, lt: end } },
      });
    const pubgRecords = () =>
      this.prisma.scrim.count({
        where: { createdAt: { gte: start, lt: end } },
      });

    const [all, lol, pubg, lolN, pubgN] = await Promise.all([
      roomsFor(),
      roomsFor("LOL"),
      roomsFor("PUBG"),
      lolRecords(),
      pubgRecords(),
    ]);

    const rows = [
      {
        scope: "ALL",
        totalUsers,
        newUsers,
        active1d,
        active7d,
        active30d,
        ...all,
        records: lolN + pubgN,
      },
      { scope: "LOL", ...lol, records: lolN },
      { scope: "PUBG", ...pubg, records: pubgN },
    ];

    for (const row of rows) {
      await this.prisma.adminDailyStat.upsert({
        where: { date_scope: { date, scope: row.scope } },
        // undefined 는 Prisma 가 건드리지 않는다 → 백필이 기존 활성 값을 지우지 않는다.
        update: { ...row, capturedAt: new Date() },
        create: { date, ...row },
      });
    }
  }

  /**
   * 가입 주 코호트별로 "지금도 접속하는 비율".
   *
   * 과거 주차의 접속 이력은 없어서(마지막 접속 한 칸뿐) 정통 리텐션 곡선은 못 만든다.
   * 대신 각 코호트가 **오늘 기준 최근 7일 안에 접속했는가** 를 본다. 오래된 코호트일수록
   * 낮은 게 정상이고, 같은 나이의 코호트끼리 비교할 때 의미가 있다.
   */
  async getCohortSurvival(weeks: number) {
    const n = Math.min(Math.max(weeks, 1), 26);
    const now = new Date();
    const activeSince = new Date(now.getTime() - 7 * 86_400_000);
    const notBot = { NOT: TEST_BOT_USER_WHERE };

    // 이번 주 월요일(KST) 00:00 을 기준으로 거꾸로 센다.
    const today = kstDateOf(now);
    const dow = (today.getUTCDay() + 6) % 7; // 월=0
    const thisMonday = addDays(today, -dow);

    const cohorts = [];
    for (let i = n - 1; i >= 0; i--) {
      const weekStart = addDays(thisMonday, -7 * i);
      const { start } = kstDayRange(weekStart);
      const end = new Date(start.getTime() + 7 * 86_400_000);
      const [signups, active] = await Promise.all([
        this.prisma.user.count({
          where: { createdAt: { gte: start, lt: end }, ...notBot },
        }),
        this.prisma.user.count({
          where: {
            createdAt: { gte: start, lt: end },
            lastSeenAt: { gte: activeSince },
            ...notBot,
          },
        }),
      ]);
      cohorts.push({ weekStart, signups, activeNow: active });
    }
    return cohorts;
  }

  /** 기간 안의 시계열. 오래된 날부터. */
  async getSeries(scope: "ALL" | "LOL" | "PUBG", days: number) {
    const clamped = Math.min(Math.max(days, 1), 365);
    const from = addDays(kstDateOf(new Date()), -clamped);
    return this.prisma.adminDailyStat.findMany({
      where: { scope, date: { gte: from } },
      orderBy: { date: "asc" },
    });
  }
}
