import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { Prisma, PubgPlatform } from "@nexus/database";
import {
  calculateScrimPoints,
  defaultPointRuleForMode,
  isValidPointRule,
} from "@nexus/types";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { PubgApiService } from "../pubg/pubg-api.service";
import { ConfigService } from "@nestjs/config";

export interface KillMatchCollectionState {
  roster: {
    teamId: string;
    teamName: string;
    playerId: string;
    platform: PubgPlatform;
  }[];
  cursor: number;
  pending: { id: string; platform: PubgPlatform }[];
  seen: string[];
}

/** 서버가 재시작돼도 참가 계정, 조회 위치와 미처리 경기는 DB에서 복구한다. */
@Injectable()
export class KillMatchCollectorService {
  private readonly logger = new Logger(KillMatchCollectorService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly api: PubgApiService,
    private readonly config: ConfigService,
  ) {}

  @Interval(10_000)
  async tick() {
    if (
      !this.api.isEnabled ||
      this.config.get("PUBG_SCRIM_AUTO_COLLECT") === "false"
    )
      return;
    const key = "pubg:timed-collector";
    const token = await this.redis.acquireLock(key, 300_000);
    if (!token) return;
    try {
      const scrim = await this.prisma.scrim.findFirst({
        where: {
          status: "IN_PROGRESS",
          cutoffAt: { not: null },
          room: { status: "IN_PROGRESS" },
        },
        orderBy: [
          { lastCollectedAt: { sort: "asc", nulls: "first" } },
          { createdAt: "asc" },
        ],
      });
      if (!scrim?.startsAt || !scrim.cutoffAt || !scrim.collectorState) return;
      const state = scrim.collectorState as unknown as KillMatchCollectionState;
      try {
        // 한 차례에 목록 또는 상세 한 건만 처리해 다른 방도 조회 기회를 얻는다.
        if (!state.pending.length) {
          const anchors = [...new Set(state.roster.map((p) => p.teamId))].map(
            (teamId) => state.roster.find((p) => p.teamId === teamId)!,
          );
          const account = anchors[state.cursor % anchors.length];
          const ids = await this.api.getPlayerMatchIds(
            account.platform,
            account.playerId,
          );
          state.cursor = (state.cursor + 1) % anchors.length;
          state.pending = [...new Set(ids)]
            .filter((id) => !state.seen.includes(id))
            .map((id) => ({ id, platform: account.platform }));
        } else {
          const candidate = state.pending[0];
          const detail = await this.api.getMatch(
            candidate.platform,
            candidate.id,
          );
          if (!detail)
            throw new Error(
              "경기 상세가 아직 제공되지 않았습니다. 다시 조회합니다.",
            );
          const started = new Date(detail.createdAt);
          if (!Number.isFinite(started.getTime()))
            throw new Error("경기 시작 시각을 확인하지 못했습니다.");
          const rows: {
            teamId: string;
            teamName: string;
            placement: number;
            kills: number;
            deaths: number;
            points: number;
          }[] = [];
          if (
            started >= scrim.startsAt &&
            started < scrim.cutoffAt &&
            /^squad(?:-fpp)?$/.test(detail.gameMode)
          ) {
            const rule = isValidPointRule(scrim.pointRule)
              ? scrim.pointRule
              : defaultPointRuleForMode("KILL_MATCH");
            for (const teamId of new Set(state.roster.map((p) => p.teamId))) {
              const members = state.roster.filter((p) => p.teamId === teamId);
              // 네 계정이 모두 같은 인게임 스쿼드에 있어야 한다. 외부인의 킬을 더하지 않는다.
              const team = detail.teams.find(
                (t) =>
                  t.playerIds.length === 4 &&
                  members.length === 4 &&
                  members.every((p) => t.playerIds.includes(p.playerId)),
              );
              if (!team || team.placement < 1) continue;
              rows.push({
                teamId,
                teamName: members[0].teamName,
                placement: team.placement,
                kills: team.kills,
                deaths: team.deaths,
                points: calculateScrimPoints(
                  team.placement,
                  team.kills,
                  rule,
                  team.deaths,
                ),
              });
            }
          }
          if (!(await this.redis.extendLock(key, token, 300_000))) return;
          await this.prisma.$transaction(async (tx) => {
            // 완료/삭제된 세션에 늦게 돌아온 API 응답을 쓰지 않는다.
            const active = await tx.scrim.updateMany({
              where: {
                id: scrim.id,
                status: "IN_PROGRESS",
                updatedAt: scrim.updatedAt,
              },
              data: { lastCollectedAt: new Date() },
            });
            if (!active.count)
              throw new Error(
                "집계 상태가 바뀌어 다음 차례에 다시 확인합니다.",
              );
            if (rows.length) {
              const exists = await tx.scrimRound.findUnique({
                where: {
                  scrimId_pubgMatchId: {
                    scrimId: scrim.id,
                    pubgMatchId: detail.matchId,
                  },
                },
              });
              if (!exists) {
                const last = await tx.scrimRound.aggregate({
                  where: { scrimId: scrim.id },
                  _max: { roundNumber: true },
                });
                await tx.scrimRound.create({
                  data: {
                    scrimId: scrim.id,
                    roundNumber: (last._max.roundNumber ?? 0) + 1,
                    pubgMatchId: detail.matchId,
                    startedAt: started,
                    endedAt: new Date(),
                    status: "COMPLETED",
                    resultSource: "AUTO",
                    results: { create: rows },
                  },
                });
                await tx.scrim.update({
                  where: { id: scrim.id },
                  data: { totalRounds: { increment: 1 } },
                });
              }
            }
            const nextState = {
              ...state,
              pending: state.pending.slice(1),
              seen: [...state.seen, candidate.id],
            };
            await tx.scrim.update({
              where: { id: scrim.id },
              data: {
                collectorState: nextState as unknown as Prisma.InputJsonValue,
                collectionError: null,
              },
            });
          });
          return;
        }
        if (!(await this.redis.extendLock(key, token, 300_000))) return;
        await this.prisma.scrim.updateMany({
          where: {
            id: scrim.id,
            status: "IN_PROGRESS",
            updatedAt: scrim.updatedAt,
          },
          data: {
            collectorState: state as unknown as Prisma.InputJsonValue,
            lastCollectedAt: new Date(),
            collectionError: null,
          },
        });
      } catch (error) {
        // 한 경기의 지연이 나머지 경기 조회를 막지 않도록 뒤로 보낸다.
        if (state.pending.length > 1)
          state.pending.push(state.pending.shift()!);
        this.logger.warn(
          `킬내기 수집 ${scrim.id}: ${(error as Error).message}`,
        );
        if (await this.redis.extendLock(key, token, 300_000))
          await this.prisma.scrim.updateMany({
            where: {
              id: scrim.id,
              status: "IN_PROGRESS",
              updatedAt: scrim.updatedAt,
            },
            data: {
              collectorState: state as unknown as Prisma.InputJsonValue,
              lastCollectedAt: new Date(),
              collectionError: "경기 조회가 지연되어 자동 재시도 중입니다.",
            },
          });
      }
    } catch (error) {
      this.logger.warn((error as Error).message);
    } finally {
      await this.redis.releaseLock(key, token);
    }
  }
}
