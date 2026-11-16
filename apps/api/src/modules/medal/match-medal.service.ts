import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { MatchStatus, MedalReason, RoomStatus } from "@nexus/database";
import { PrismaService } from "../prisma/prisma.service";
import { TEST_BOT_USER_WHERE } from "../common/test-bot.util";
import {
  resolveMatchMembers,
  resolveWinnerSlot,
} from "../match/match-roster.util";
import { MedalService } from "./medal.service";

/**
 * 경기 메달 지급 (리텐션 기획서 7절 · Task 21).
 *
 * 핵심은 `settleMatch` 하나다. 경기의 **지금 상태**를 보고 받아야 할 메달을 전부
 * 계산한 뒤, 아직 안 준 것만 준다(원장 고유 키). 그래서 결과 확정·Riot 기록 수집·
 * 칭찬·대회 종료 등 어느 시점에 몇 번을 불러도 두 번 주지 않는다.
 * 놓친 호출은 30분마다 도는 정리 작업이 최근 경기를 다시 정산해 메운다.
 */

/** 지급표 (메달) — 7절 */
export const MATCH_MEDAL = {
  COMPLETE: 10,
  WIN: 10,
  RIOT_VERIFIED: 5,
  MVP: 5,
  ACE: 3,
  COMMEND_RECEIVED: 1,
  COMMEND_SESSION: 1,
  HOST_COMPLETE: 10,
  FIRST_MATCH: 50,
} as const;

/** 하루 상한 (KST 하루). 첫 내전·관리자 지급은 넣지 않는다 */
export const MEDAL_DAILY_CAP = 180;

/** 보상 대상 경기 추가 조건 — 가짜 경기 방어선 */
export const MEDAL_MIN_DURATION_SEC = 15 * 60;
export const MEDAL_MIN_HUMAN_RATIO = 0.8;

/** 하루 상한에 들어가는 사유 */
export const CAPPED_REASONS: MedalReason[] = [
  MedalReason.MATCH_COMPLETE,
  MedalReason.MATCH_WIN,
  MedalReason.RIOT_VERIFIED,
  MedalReason.MATCH_MVP,
  MedalReason.MATCH_ACE,
  MedalReason.COMMEND_RECEIVED,
  MedalReason.COMMEND_SESSION,
  MedalReason.HOST_COMPLETE,
];

/** 정리 작업이 다시 보는 기간 — 칭찬 창(경기 뒤 며칠)·늦은 Riot 수집을 덮는다 */
const RECONCILE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/** KST 날짜 (YYYY-MM-DD) */
export function kstDayKey(date: Date): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export interface PlannedGrant {
  userId: string;
  amount: number;
  reason: MedalReason;
  key: string;
  /** 하루 상한에 들어가는가 */
  capped: boolean;
}

/** 정산에 쓰는 경기 모양 — 테스트에서 그대로 만들 수 있게 필요한 것만 */
export interface MedalMatch {
  id: string;
  isInternal: boolean;
  status: MatchStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  gameDuration: number | null;
  riotMatchId: string | null;
  dataCollected: boolean;
  mvpUserId: string | null;
  aceUserId: string | null;
  roomHostId: string | null;
  teamAId: string | null;
  teamBId: string | null;
  teamAIdSnapshot: string | null;
  teamBIdSnapshot: string | null;
  winnerId: string | null;
  winnerIdSnapshot: string | null;
  rosterSnapshots: { userId: string | null; teamSlot: string }[];
  commendations: { id: string; targetUserId: string }[];
  commendationSessions: { userId: string }[];
}

export type Ineligible =
  "NOT_COMPLETED" | "NO_ROSTER" | "TOO_FEW_HUMANS" | "TOO_SHORT" | "VOIDED";

/**
 * 메달을 받을 수 있는 경기인가 (7절 추가 조건).
 * - 완료된 내전이고 참가자 스냅샷이 남아 있다
 * - 봇을 뺀 사람이 그 경기 참가자의 80% 이상 (10명 판이면 8명)
 * - 경기 시간 15분 이상: Riot 기록 시간, 없으면 시작~결과 보고
 */
export function checkEligibility(
  match: MedalMatch,
  botIds: Set<string>,
  voided: boolean,
):
  | { ok: true; humans: { userId: string; slot: "A" | "B" }[] }
  | { ok: false; reason: Ineligible } {
  if (voided) return { ok: false, reason: "VOIDED" };
  if (
    !match.isInternal ||
    match.status !== MatchStatus.COMPLETED ||
    !match.completedAt
  ) {
    return { ok: false, reason: "NOT_COMPLETED" };
  }
  const members = resolveMatchMembers(match);
  if (members.length < 2) return { ok: false, reason: "NO_ROSTER" };
  const humans = members.filter((m) => !botIds.has(m.userId));
  if (humans.length / members.length < MEDAL_MIN_HUMAN_RATIO) {
    return { ok: false, reason: "TOO_FEW_HUMANS" };
  }
  const seconds =
    match.gameDuration ??
    (match.startedAt
      ? (match.completedAt.getTime() - match.startedAt.getTime()) / 1000
      : 0);
  if (seconds < MEDAL_MIN_DURATION_SEC)
    return { ok: false, reason: "TOO_SHORT" };
  return { ok: true, humans };
}

/**
 * 받을 메달 목록 (아직 줬는지는 모른다 — 원장 고유 키가 걸러낸다).
 * `isFinalMatch` 면 방장 완주 보너스, `firstMatchUserIds` 는 아직 첫 내전 보너스를
 * 안 받은 사람.
 */
export function planMatchGrants(
  match: MedalMatch,
  humans: { userId: string; slot: "A" | "B" }[],
  opts: { isFinalMatch: boolean; hostIsBot: boolean },
): PlannedGrant[] {
  const grants: PlannedGrant[] = [];
  const m = match.id;
  const humanIds = new Set(humans.map((h) => h.userId));
  const winnerSlot = resolveWinnerSlot(match);
  const riotVerified = match.dataCollected && Boolean(match.riotMatchId);

  for (const h of humans) {
    grants.push({
      userId: h.userId,
      amount: MATCH_MEDAL.COMPLETE,
      reason: MedalReason.MATCH_COMPLETE,
      key: `m:${m}:complete:${h.userId}`,
      capped: true,
    });
    if (winnerSlot && h.slot === winnerSlot) {
      grants.push({
        userId: h.userId,
        amount: MATCH_MEDAL.WIN,
        reason: MedalReason.MATCH_WIN,
        key: `m:${m}:win:${h.userId}`,
        capped: true,
      });
    }
    if (riotVerified) {
      grants.push({
        userId: h.userId,
        amount: MATCH_MEDAL.RIOT_VERIFIED,
        reason: MedalReason.RIOT_VERIFIED,
        key: `m:${m}:riot:${h.userId}`,
        capped: true,
      });
    }
    // 첫 내전 — 계정당 한 번, 상한 밖. 이미 받았으면 원장 키가 막는다
    grants.push({
      userId: h.userId,
      amount: MATCH_MEDAL.FIRST_MATCH,
      reason: MedalReason.FIRST_MATCH,
      key: `first-match:${h.userId}`,
      capped: false,
    });
  }

  // MVP·ACE 는 Riot 기록으로 자동 판정된 경기만 (투표 없음)
  if (riotVerified && match.mvpUserId && humanIds.has(match.mvpUserId)) {
    grants.push({
      userId: match.mvpUserId,
      amount: MATCH_MEDAL.MVP,
      reason: MedalReason.MATCH_MVP,
      key: `m:${m}:mvp`,
      capped: true,
    });
  }
  if (riotVerified && match.aceUserId && humanIds.has(match.aceUserId)) {
    grants.push({
      userId: match.aceUserId,
      amount: MATCH_MEDAL.ACE,
      reason: MedalReason.MATCH_ACE,
      key: `m:${m}:ace`,
      capped: true,
    });
  }

  // 칭찬 창을 끝낸 사람 (남김·건너뜀 같다)
  for (const s of match.commendationSessions) {
    if (!humanIds.has(s.userId)) continue;
    grants.push({
      userId: s.userId,
      amount: MATCH_MEDAL.COMMEND_SESSION,
      reason: MedalReason.COMMEND_SESSION,
      key: `m:${m}:commend-session:${s.userId}`,
      capped: true,
    });
  }
  // 받은 칭찬 (회당)
  for (const c of match.commendations) {
    if (!humanIds.has(c.targetUserId)) continue;
    grants.push({
      userId: c.targetUserId,
      amount: MATCH_MEDAL.COMMEND_RECEIVED,
      reason: MedalReason.COMMEND_RECEIVED,
      key: `commend:${c.id}`,
      capped: true,
    });
  }

  // 방장 완주 보너스 — 방(대회)의 마지막 경기가 정상으로 끝났을 때 방장에게
  if (opts.isFinalMatch && match.roomHostId && !opts.hostIsBot) {
    grants.push({
      userId: match.roomHostId,
      amount: MATCH_MEDAL.HOST_COMPLETE,
      reason: MedalReason.HOST_COMPLETE,
      key: `m:${m}:host`,
      capped: true,
    });
  }
  return grants;
}

@Injectable()
export class MatchMedalService {
  private readonly logger = new Logger(MatchMedalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly medalService: MedalService,
  ) {}

  /**
   * 경기 하나를 정산한다. 실패해도 경기 흐름을 막지 않게, 부르는 쪽은
   * `settleMatchQuietly` 를 쓴다.
   */
  async settleMatch(
    matchId: string,
    opts: { retro?: boolean } = {},
  ): Promise<{ eligible: boolean; reason?: Ineligible; granted: number }> {
    const match = await this.loadMatch(matchId);
    if (!match) return { eligible: false, reason: "NOT_COMPLETED", granted: 0 };

    const ctx = await this.loadContext(match);
    const check = checkEligibility(match, ctx.botIds, ctx.voided);
    if (!check.ok) return { eligible: false, reason: check.reason, granted: 0 };

    const grants = planMatchGrants(match, check.humans, {
      isFinalMatch: ctx.isFinalMatch,
      hostIsBot: match.roomHostId ? ctx.botIds.has(match.roomHostId) : false,
    });
    const dayKey = kstDayKey(match.completedAt!);
    let granted = 0;
    for (const g of grants) {
      const base = {
        userId: g.userId,
        amount: g.amount,
        reason: g.reason,
        idempotencyKey: g.key,
        sourceId: match.id,
        retro: opts.retro ?? false,
        metadata: { matchId: match.id },
      };
      const res = g.capped
        ? await this.medalService.recordCapped(
            { ...base, dayKey },
            { dailyCap: MEDAL_DAILY_CAP, cappedReasons: CAPPED_REASONS },
          )
        : await this.medalService.record({ ...base, dayKey: null });
      if (!res.duplicated) granted += res.entry.amount;
    }
    return { eligible: true, granted };
  }

  /** 경기 흐름 안에서 부를 때 — 메달 정산이 실패해도 결과 처리를 막지 않는다 */
  settleMatchQuietly(matchId: string): void {
    this.settleMatch(matchId).catch((err) =>
      this.logger.warn(`메달 정산 실패 matchId=${matchId}: ${err?.message}`),
    );
  }

  /**
   * 안전망 — 최근 사흘 사이 끝난 내전을 30분마다 다시 정산한다.
   * 놓친 호출(서버 재시작 등)·늦게 들어온 칭찬·Riot 기록을 메운다. 이미 준 건 건너뛴다.
   */
  @Cron("*/30 * * * *")
  async reconcileRecent(): Promise<void> {
    const since = new Date(Date.now() - RECONCILE_WINDOW_MS);
    const matches = await this.prisma.match.findMany({
      where: {
        isInternal: true,
        status: MatchStatus.COMPLETED,
        completedAt: { gte: since },
      },
      select: { id: true },
      orderBy: { completedAt: "asc" },
    });
    for (const { id } of matches) {
      try {
        await this.settleMatch(id);
      } catch (err: any) {
        this.logger.warn(`메달 정리 정산 실패 matchId=${id}: ${err?.message}`);
      }
    }
  }

  /**
   * 소급 지급 — 메달 출시 전에 끝난 내전 전부. 끝난 순서대로 정산해야
   * 첫 내전 보너스가 진짜 첫 경기에 붙고, 하루 상한도 그날 순서대로 찬다.
   * dryRun 이면 쓰지 않고 몇 경기·몇 메달인지만 센다(이미 준 메달은 모른다고 가정).
   */
  async retroGrantAll(opts: { dryRun: boolean }) {
    const matches = await this.prisma.match.findMany({
      where: { isInternal: true, status: MatchStatus.COMPLETED },
      select: { id: true },
      orderBy: { completedAt: "asc" },
    });
    let eligible = 0;
    let total = 0;
    const perUser = new Map<string, number>();
    const skipped: Record<string, number> = {};
    // dryRun 용 상한·첫 내전 흉내
    const daySum = new Map<string, number>();
    const firstDone = new Set<string>();

    for (const { id } of matches) {
      if (!opts.dryRun) {
        const res = await this.settleMatch(id, { retro: true });
        if (res.eligible) eligible++;
        else skipped[res.reason!] = (skipped[res.reason!] ?? 0) + 1;
        total += res.granted;
        continue;
      }
      const match = await this.loadMatch(id);
      if (!match) continue;
      const ctx = await this.loadContext(match);
      const check = checkEligibility(match, ctx.botIds, ctx.voided);
      if (!check.ok) {
        skipped[check.reason] = (skipped[check.reason] ?? 0) + 1;
        continue;
      }
      eligible++;
      const day = kstDayKey(match.completedAt!);
      for (const g of planMatchGrants(match, check.humans, {
        isFinalMatch: ctx.isFinalMatch,
        hostIsBot: match.roomHostId ? ctx.botIds.has(match.roomHostId) : false,
      })) {
        let amount = g.amount;
        if (g.reason === MedalReason.FIRST_MATCH) {
          if (firstDone.has(g.userId)) continue;
          firstDone.add(g.userId);
        } else if (g.capped) {
          const k = `${g.userId}:${day}`;
          const used = daySum.get(k) ?? 0;
          amount = Math.min(amount, Math.max(0, MEDAL_DAILY_CAP - used));
          daySum.set(k, used + amount);
        }
        total += amount;
        perUser.set(g.userId, (perUser.get(g.userId) ?? 0) + amount);
      }
    }
    return {
      dryRun: opts.dryRun,
      matches: matches.length,
      eligible,
      skipped,
      totalMedals: total,
      users: opts.dryRun ? perUser.size : undefined,
      topUsers: opts.dryRun
        ? [...perUser.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([userId, medals]) => ({ userId, medals }))
        : undefined,
    };
  }

  /**
   * 경기 무효 처리 — 이후 정산에서 빼고, 이미 준 메달은 회수 원장으로 되돌린다.
   * (잔액이 모자라도 기록이 맞아야 하므로 마이너스를 허용한다)
   */
  async voidMatch(matchId: string, adminId: string, memo: string) {
    await this.prisma.medalMatchVoid.upsert({
      where: { matchId },
      create: { matchId, adminId, memo },
      update: { memo, adminId },
    });
    const rows = await this.prisma.medalLedger.findMany({
      where: { sourceId: matchId, amount: { gt: 0 }, userId: { not: null } },
      select: { id: true, userId: true, amount: true },
    });
    let clawed = 0;
    for (const r of rows) {
      const res = await this.medalService.record({
        userId: r.userId!,
        amount: -r.amount,
        reason: MedalReason.MATCH_VOID,
        idempotencyKey: `void:${r.id}`,
        sourceId: matchId,
        allowNegative: true,
        metadata: { matchId, ledgerId: r.id, memo, adminId },
      });
      if (!res.duplicated) clawed += r.amount;
    }
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: "MEDAL_ADJUST",
        targetType: "MATCH",
        targetId: matchId,
        details: { type: "void-match", memo, clawed, rows: rows.length },
      },
    });
    return { matchId, clawed, rows: rows.length };
  }

  private loadMatch(matchId: string): Promise<MedalMatch | null> {
    return this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        isInternal: true,
        status: true,
        startedAt: true,
        completedAt: true,
        gameDuration: true,
        riotMatchId: true,
        dataCollected: true,
        mvpUserId: true,
        aceUserId: true,
        roomHostId: true,
        teamAId: true,
        teamBId: true,
        teamAIdSnapshot: true,
        teamBIdSnapshot: true,
        winnerId: true,
        winnerIdSnapshot: true,
        rosterSnapshots: { select: { userId: true, teamSlot: true } },
        commendations: { select: { id: true, targetUserId: true } },
        commendationSessions: { select: { userId: true } },
      },
    }) as Promise<MedalMatch | null>;
  }

  /** 봇 목록·무효 여부·방의 마지막 경기인지 */
  private async loadContext(match: MedalMatch) {
    const ids = [
      ...match.rosterSnapshots.map((r) => r.userId),
      match.roomHostId,
    ].filter((id): id is string => Boolean(id));
    const [bots, voided, roomInfo] = await Promise.all([
      this.prisma.user.findMany({
        where: { AND: [{ id: { in: ids } }, TEST_BOT_USER_WHERE] },
        select: { id: true },
      }),
      this.prisma.medalMatchVoid.findUnique({
        where: { matchId: match.id },
        select: { matchId: true },
      }),
      this.prisma.match.findUnique({
        where: { id: match.id },
        select: {
          roomId: true,
          roomIdSnapshot: true,
          room: { select: { status: true } },
        },
      }),
    ]);

    // 방(대회)이 정상으로 끝났고, 이 경기가 그 방의 마지막 완료 경기인가
    let isFinalMatch = false;
    const roomKey = roomInfo?.roomIdSnapshot ?? roomInfo?.roomId;
    if (roomKey) {
      let roomFinished = roomInfo?.room?.status === RoomStatus.COMPLETED;
      if (!roomInfo?.room) {
        // 방이 지워졌으면 지울 때 남긴 결과로 판단한다
        const outcome = await this.prisma.roomOutcome.findUnique({
          where: { roomId: roomKey },
          select: { finalStatus: true },
        });
        roomFinished = outcome?.finalStatus === RoomStatus.COMPLETED;
      }
      if (roomFinished) {
        const last = await this.prisma.match.findFirst({
          where: {
            isInternal: true,
            status: MatchStatus.COMPLETED,
            OR: [{ roomIdSnapshot: roomKey }, { roomId: roomKey }],
          },
          orderBy: { completedAt: "desc" },
          select: { id: true },
        });
        isFinalMatch = last?.id === match.id;
      }
    }

    return {
      botIds: new Set(bots.map((b) => b.id)),
      voided: Boolean(voided),
      isFinalMatch,
    };
  }
}
