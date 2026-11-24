import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { MedalReason } from "@nexus/database";
import { PrismaService } from "../prisma/prisma.service";
import { TEST_BOT_USER_WHERE } from "../common/test-bot.util";
import { MedalService } from "./medal.service";
import { MatchMedalService } from "./match-medal.service";

/**
 * 일괄 지급 한 번의 설정.
 * 받는 양 = base + perMatch × min(완주 경기 수, matchCap)
 */
export interface MedalCampaignInput {
  /** 지급 이름표 — 원장 키에 들어가 같은 이름으로 다시 눌러도 한 사람에게 한 번만 간다 */
  key: string;
  /** 받는 사람에게 보이는 제목(알림·메달 내역) */
  title: string;
  /** 모두에게 얹어 주는 기본 메달 */
  base: number;
  /** 완주한 내전 한 판당 메달 */
  perMatch: number;
  /** 판 수 상한 — 몇 판까지 쳐 줄지 */
  matchCap: number;
  /** 받은 사람에게 알림을 보낼지 */
  notify: boolean;
}

/** 한 사람 몫 */
interface Share {
  userId: string;
  username: string;
  matches: number;
  amount: number;
}

const KEY_RE = /^[a-z0-9][a-z0-9-]{2,39}$/;
/** 한 사람이 한 번에 받을 수 있는 최대치 — 숫자를 잘못 쳤을 때 경제가 무너지지 않게 */
const PER_USER_MAX = 20000;

/**
 * 관리자 일괄 지급 (2026-11-20) — 가입한 모든 유저에게 보상 메달을 활동량에 따라 차등으로 준다.
 *
 * - 대상: 정지되지 않은 가입자 전부(테스트 봇 제외).
 * - 활동량: 완주한 내전 수 = 경기 메달 자격이 되는 완료 내전 수(경기 기록에서 직접 센다,
 *   MatchMedalService.countCompletedMatchesByUser). 무효·봇 판·15분 미만 판은 뺀다.
 *   원장(MATCH_COMPLETE)으로 세면 메달 출시 전 경기가 빠진다 — 이 지급이 소급을 대신한다.
 * - 원장 키 `campaign:<이름표>:<사람>` — 같은 이름표로 다시 보내도 이미 받은 사람은 건너뛴다.
 *   중간에 끊겨도 같은 설정으로 다시 누르면 못 받은 사람만 마저 받는다.
 * - 일일 상한은 적용하지 않는다(운영자 지급).
 */
@Injectable()
export class MedalCampaignService {
  private readonly logger = new Logger(MedalCampaignService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly medal: MedalService,
    private readonly matchMedals: MatchMedalService,
  ) {}

  private validate(input: MedalCampaignInput) {
    if (!KEY_RE.test(input.key))
      throw new BadRequestException(
        "이름표는 영문 소문자·숫자·하이픈 3~40자로 적어 주세요 (예: shop-open-2026-11).",
      );
    if (!input.title?.trim())
      throw new BadRequestException("받는 사람에게 보일 제목을 적어 주세요.");
    const int = (n: number, max: number) =>
      Number.isInteger(n) && n >= 0 && n <= max;
    if (!int(input.base, 10000))
      throw new BadRequestException("기본 메달은 0~10,000 사이여야 해요.");
    if (!int(input.perMatch, 1000))
      throw new BadRequestException("판당 메달은 0~1,000 사이여야 해요.");
    if (!int(input.matchCap, 1000))
      throw new BadRequestException("판 수 상한은 0~1,000 사이여야 해요.");
    if (input.base === 0 && input.perMatch === 0)
      throw new BadRequestException(
        "기본 또는 판당 메달 중 하나는 있어야 해요.",
      );
  }

  /** 대상자별 몫 계산 — 미리보기와 실제 지급이 같은 계산을 쓴다 */
  private async computeShares(input: MedalCampaignInput): Promise<Share[]> {
    const [users, matchesBy] = await Promise.all([
      this.prisma.user.findMany({
        where: { isBanned: false, NOT: TEST_BOT_USER_WHERE },
        select: { id: true, username: true },
      }),
      this.matchMedals.countCompletedMatchesByUser(),
    ]);
    return users
      .map((u) => {
        const matches = matchesBy.get(u.id) ?? 0;
        const amount = Math.min(
          PER_USER_MAX,
          input.base + input.perMatch * Math.min(matches, input.matchCap),
        );
        return { userId: u.id, username: u.username, matches, amount };
      })
      .filter((s) => s.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }

  private keyFor(campaign: string, userId: string) {
    return `campaign:${campaign}:${userId}`;
  }

  /** 미리보기 — 쓰지 않고 몇 명·총 얼마·분포·이미 받은 사람 수를 돌려준다 */
  async preview(input: MedalCampaignInput) {
    this.validate(input);
    const shares = await this.computeShares(input);
    const already = await this.prisma.medalLedger.count({
      where: { idempotencyKey: { startsWith: `campaign:${input.key}:` } },
    });
    const total = shares.reduce((s, x) => s + x.amount, 0);
    const active = shares.filter((s) => s.matches > 0).length;
    // 미리보기에서 "어디서 얼마가 나가는지" 나눠 보여 준다
    const baseTotal = input.base * shares.length;
    return {
      users: shares.length,
      activeUsers: active,
      total,
      /** 모두에게 주는 기본 몫 합계 */
      baseTotal,
      /** 판당 몫 합계 (한 사람 최대치에 잘린 만큼은 빠진다) */
      perMatchTotal: total - baseTotal,
      /** 셈에 들어간 완주 판 수 합계 (상한 적용 전) */
      countedMatches: shares.reduce((s, x) => s + x.matches, 0),
      /** 판 수 상한에 걸린 사람 수 */
      cappedUsers: shares.filter((s) => s.matches > input.matchCap).length,
      min: shares.length ? shares[shares.length - 1].amount : 0,
      max: shares.length ? shares[0].amount : 0,
      alreadyGranted: already,
      top: shares.slice(0, 10).map(({ username, matches, amount }) => ({
        username,
        matches,
        amount,
      })),
      /** 받는 사람 전체 — 관리자 화면에서 검색·정렬해 한 사람씩 확인한다(가입자 수백 명 규모) */
      recipients: shares.map(({ userId, username, matches, amount }) => ({
        userId,
        username,
        matches,
        amount,
      })),
    };
  }

  /**
   * 지급 — 한 사람씩 원장 한 줄(+잔액)을 남긴다. 이미 받은 사람은 건너뛴다.
   * 받은 사람에게만 알림을 한꺼번에 넣는다.
   */
  async run(adminId: string, input: MedalCampaignInput) {
    this.validate(input);
    const title = input.title.trim();
    const shares = await this.computeShares(input);
    const granted: Share[] = [];
    let skipped = 0;
    let failed = 0;
    for (const s of shares) {
      try {
        const res = await this.medal.record({
          userId: s.userId,
          amount: s.amount,
          reason: MedalReason.ADMIN_ADJUST,
          idempotencyKey: this.keyFor(input.key, s.userId),
          sourceId: `campaign:${input.key}`,
          metadata: {
            // 메달 내역 화면이 운영자 지급의 memo 를 사유로 보여 준다
            memo: title,
            adminId,
            campaign: input.key,
            base: input.base,
            perMatch: input.perMatch,
            matches: s.matches,
          },
        });
        if (res.duplicated) skipped++;
        else granted.push(s);
      } catch (err) {
        // 한 사람 실패로 전체를 멈추지 않는다 — 같은 설정으로 다시 누르면 마저 준다
        failed++;
        this.logger.warn(
          `일괄 지급 실패 ${input.key} ${s.userId}: ${(err as Error).message}`,
        );
      }
    }

    if (input.notify && granted.length) {
      const BATCH = 1000;
      for (let i = 0; i < granted.length; i += BATCH) {
        await this.prisma.notification.createMany({
          data: granted.slice(i, i + BATCH).map((s) => ({
            userId: s.userId,
            type: "SYSTEM" as const,
            title: "보상 메달이 도착했어요",
            message: `${title} — ${s.amount.toLocaleString()} 메달을 받았어요.`,
            link: "/shop/medals",
          })),
        });
      }
    }

    const total = granted.reduce((sum, s) => sum + s.amount, 0);
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: "MEDAL_ADJUST",
        targetType: "MEDAL_CAMPAIGN",
        targetId: input.key,
        details: {
          ...input,
          title,
          granted: granted.length,
          skipped,
          failed,
          total,
        },
      },
    });
    return { granted: granted.length, skipped, failed, total };
  }
}
