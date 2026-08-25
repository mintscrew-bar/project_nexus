import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { BalanceScoreService } from "../common/balance-score.service";
import { MatchSeriesService } from "../match/match-series.service";
import type { SeriesScore } from "../match/match-series.service";
import {
  hashBroadcastToken,
  activeRoomIdForUser,
} from "./broadcast-resolve.util";
import {
  BROADCAST_CONTROL_SCENES,
  BroadcastControlScene,
  UpdateBroadcastControlDto,
} from "./dto/broadcast-control.dto";

export type BroadcastScene =
  | "control"
  | "room"
  | "match-intro"
  | "lineup"
  | "match"
  | "bracket"
  | "result"
  | "summary"
  | "idle"
  | "break";

const RESULT_SCENE_MS = 12_000;
/**
 * 중계 중인 경기 화면에 다른 경기 결과를 띄워 두는 시간.
 *
 * 야구 중계에서 한쪽에 잠깐 떴다 사라지는 배너와 같은 역할이다. 관전 화면을
 * 오래 가리면 안 되므로 짧게 보여 주고 스스로 빠진다.
 */
const SIDE_RESULT_MS = 8_000;
const BRACKET_SCENE_AFTER_RESULT_MS = 15_000;
const BRACKET_SCENE_BEFORE_MATCH_MS = 0;
const MATCH_INTRO_SCENE_MS = 60_000;

/**
 * 방송 오버레이 서비스.
 * - 스트리머당 단일 read-only 토큰 발급/관리(hash 저장).
 * - OBS 브라우저 소스가 접속 시 현재 상태를 hydrate 하는 스냅샷 제공(read-only).
 *   토큰은 유저에 귀속되고, 오버레이는 그 유저의 활성 방을 자동 추종한다.
 */
@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly balanceScores: BalanceScoreService,
    private readonly matchSeries: MatchSeriesService,
  ) {}

  /**
   * 방송 토큰 발급/재생성. 로그인 유저 본인 것만.
   * - 이미 있고 rotate=false면 원문 복구 불가라 존재 여부만 반환.
   * - rotate=true면 기존 토큰을 무효화하고 새 토큰 반환.
   */
  async createToken(userId: string, rotate = false) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { broadcastTokenHash: true, broadcastTokenCreatedAt: true },
    });
    if (!user) throw new NotFoundException("유저를 찾을 수 없습니다.");

    if (user.broadcastTokenHash && !rotate) {
      return {
        exists: true,
        createdAt: user.broadcastTokenCreatedAt,
        token: null as string | null,
      };
    }

    const token = randomBytes(24).toString("base64url");
    const createdAt = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        broadcastTokenHash: hashBroadcastToken(token),
        broadcastTokenCreatedAt: createdAt,
      },
    });
    return { exists: true, createdAt, token };
  }

  /** 방송 토큰 현재 상태(존재 여부/발급 시각). 원문은 노출하지 않는다. */
  async getTokenStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        broadcastTokenHash: true,
        broadcastTokenCreatedAt: true,
        broadcastControlTokenHash: true,
        broadcastControlTokenCreatedAt: true,
      },
    });
    return {
      exists: !!user?.broadcastTokenHash,
      createdAt: user?.broadcastTokenCreatedAt ?? null,
      controlExists: !!user?.broadcastControlTokenHash,
      controlCreatedAt: user?.broadcastControlTokenCreatedAt ?? null,
    };
  }

  /** 방송 토큰 비활성화. 송출 오버라이드도 함께 해제. */
  async revokeToken(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        broadcastTokenHash: null,
        broadcastTokenCreatedAt: null,
        broadcastControlTokenHash: null,
        broadcastControlTokenCreatedAt: null,
        broadcastLiveRoomId: null,
        broadcastScene: "auto",
        broadcastLowerThirdVisible: true,
        broadcastAnnouncement: null,
      },
    });
    return { ok: true };
  }

  /** 외부 장비/보조 패널용 컨트롤 토큰. OBS 출력 토큰과 별도로 회전/폐기한다. */
  async createControlToken(userId: string, rotate = false) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        broadcastControlTokenHash: true,
        broadcastControlTokenCreatedAt: true,
      },
    });
    if (!user) throw new NotFoundException("유저를 찾을 수 없습니다.");

    if (user.broadcastControlTokenHash && !rotate) {
      return {
        exists: true,
        createdAt: user.broadcastControlTokenCreatedAt,
        token: null as string | null,
      };
    }

    const token = randomBytes(24).toString("base64url");
    const createdAt = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        broadcastControlTokenHash: hashBroadcastToken(token),
        broadcastControlTokenCreatedAt: createdAt,
      },
    });
    return { exists: true, createdAt, token };
  }

  async revokeControlToken(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        broadcastControlTokenHash: null,
        broadcastControlTokenCreatedAt: null,
      },
    });
    return { ok: true };
  }

  private normalizeControlScene(value?: string | null): BroadcastControlScene {
    return BROADCAST_CONTROL_SCENES.includes(value as BroadcastControlScene)
      ? (value as BroadcastControlScene)
      : "auto";
  }

  private controlState(user: {
    broadcastScene?: string | null;
    broadcastLowerThirdVisible?: boolean | null;
    broadcastAnnouncement?: string | null;
  }) {
    return {
      scene: this.normalizeControlScene(user.broadcastScene),
      lowerThirdVisible: user.broadcastLowerThirdVisible ?? true,
      announcement: user.broadcastAnnouncement ?? null,
    };
  }

  private cleanAnnouncement(value: string | null | undefined) {
    if (value == null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private async controlRoomSummary(roomId: string | null) {
    if (!roomId) return null;
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        name: true,
        status: true,
        broadcastFocusMatchId: true,
        broadcastFocusChangedAt: true,
      },
    });
    return room
      ? {
          id: room.id,
          name: room.name,
          status: room.status,
          focusMatchId: room.broadcastFocusMatchId ?? null,
          focusChangedAt: room.broadcastFocusChangedAt ?? null,
        }
      : null;
  }

  async getControlState(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        broadcastLiveRoomId: true,
        broadcastScene: true,
        broadcastLowerThirdVisible: true,
        broadcastAnnouncement: true,
      },
    });
    if (!user) throw new NotFoundException("유저를 찾을 수 없습니다.");
    const roomId = await activeRoomIdForUser(
      this.prisma,
      userId,
      user.broadcastLiveRoomId,
    );
    const room = await this.controlRoomSummary(roomId);
    return {
      ...this.controlState(user),
      roomId,
      room,
      focusMatchId: room?.focusMatchId ?? null,
    };
  }

  async updateControlState(userId: string, dto: UpdateBroadcastControlDto) {
    const data: Record<string, unknown> = {};
    if (dto.scene !== undefined) data.broadcastScene = dto.scene;
    if (dto.lowerThirdVisible !== undefined) {
      data.broadcastLowerThirdVisible = dto.lowerThirdVisible;
    }
    if (dto.announcement !== undefined) {
      data.broadcastAnnouncement = this.cleanAnnouncement(dto.announcement);
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        broadcastLiveRoomId: true,
        broadcastScene: true,
        broadcastLowerThirdVisible: true,
        broadcastAnnouncement: true,
      },
    });
    const roomId = await activeRoomIdForUser(
      this.prisma,
      userId,
      user.broadcastLiveRoomId,
    );
    const room = await this.controlRoomSummary(roomId);
    return {
      ...this.controlState(user),
      roomId,
      room,
      focusMatchId: room?.focusMatchId ?? null,
    };
  }

  async updateControlStateByToken(
    controlToken: string,
    dto: UpdateBroadcastControlDto,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { broadcastControlTokenHash: hashBroadcastToken(controlToken) },
      select: { id: true },
    });
    if (!user)
      throw new NotFoundException("유효하지 않은 방송 조작 토큰입니다.");
    return this.updateControlState(user.id, dto);
  }

  /** 팀 요약 공통 형태 */
  private teamSummary(team: any) {
    if (!team) return null;
    const members = (team.members ?? []).map((m: any) => {
      const account = m.user?.riotAccounts?.[0];
      const scores = account ? this.balanceScores.readCached(account) : null;
      const lineScore =
        scores && m.assignedRole
          ? scores[m.assignedRole as keyof typeof scores]
          : null;
      return {
        userId: m.userId,
        username: m.user?.username ?? null,
        avatar: m.user?.avatar ?? null,
        assignedRole: m.assignedRole ?? null,
        soldPrice: m.soldPrice ?? null,
        tier: account?.tier ?? null,
        rank: account?.rank ?? null,
        lp: account?.lp ?? null,
        roleTiers: account?.roleTiers ?? [],
        championPreferences: account?.championPreferences ?? [],
        lineScore:
          typeof lineScore === "number" && Number.isFinite(lineScore)
            ? lineScore
            : null,
      };
    });
    const hasCompleteBalanceTotal =
      members.length > 0 &&
      members.every((member: any) => member.lineScore !== null);
    const balanceTotal = hasCompleteBalanceTotal
      ? members.reduce(
          (total: number, member: any) => total + member.lineScore,
          0,
        )
      : null;

    return {
      id: team.id,
      name: team.name,
      color: team.color ?? null,
      captainId: team.captainId,
      initialBudget: team.initialBudget,
      remainingBudget: team.remainingBudget,
      balanceTotal,
      members,
    };
  }

  /** 매치 상세(방송 Match Scene용) — 진영/상태/승패 중심. 라이브 스코어 없음. */
  private matchDetail(
    match: any,
    teamById: Map<string, any>,
    series?: SeriesScore | null,
  ) {
    if (!match) return null;
    const teamA = teamById.get(match.teamAId) ?? null;
    const teamB = teamById.get(match.teamBId) ?? null;
    // blueSideTeamId 가 지정되면 그 팀이 블루, 나머지가 레드. 미지정이면 A=블루 관례.
    const blueId = match.blueSideTeamId ?? match.teamAId ?? null;
    const blueIsTeamB = blueId === match.teamBId;
    return {
      id: match.id,
      status: match.status,
      round: match.round ?? null,
      bracketRound: match.bracketRound ?? null,
      matchNumber: match.matchNumber ?? null,
      winnerId: match.winnerId ?? null,
      blueSideTeamId: match.blueSideTeamId ?? null,
      bracketType: match.bracketType ?? null,
      bracketSection: match.bracketRound ?? null,
      blue: this.teamSummary(blueIsTeamB ? teamB : teamA),
      red: this.teamSummary(blueIsTeamB ? teamA : teamB),
      // 다전제 세트 스코어. 시리즈는 A/B 기준이라 진영(블루/레드)으로 옮겨 담는다.
      // 이 값이 비어 있던 동안 오버레이가 승패로 0/1 을 만들어 써서, 2-1 로
      // 이긴 경기가 1-0 으로 보였다.
      ...(series
        ? {
            bestOf: series.bestOf,
            currentGameNumber: series.currentGameNumber,
            blueScore: blueIsTeamB ? series.teamBWins : series.teamAWins,
            redScore: blueIsTeamB ? series.teamAWins : series.teamBWins,
          }
        : {}),
    };
  }

  /** 클랜 → 방송 테마(엠블럼/배너/강조색). 클랜 없으면 null. */
  private clanTheme(clan: any) {
    if (!clan) return null;
    return {
      accentColor: clan.accentColor ?? null,
      logo: clan.logo ?? null,
      banner: clan.banner ?? null,
      clanName: clan.name,
      clanTag: clan.tag,
    };
  }

  async getSnapshot(
    token: string,
    scene: BroadcastScene = "control",
    matchId?: string,
  ) {
    // 토큰 → 스트리머(유저). 무효한 토큰만 에러; 활성 방이 없는 건 정상(대기 상태).
    const streamer = token
      ? await this.prisma.user.findUnique({
          where: { broadcastTokenHash: hashBroadcastToken(token) },
          select: {
            id: true,
            username: true,
            broadcastLiveRoomId: true,
            broadcastScene: true,
            broadcastLowerThirdVisible: true,
            broadcastAnnouncement: true,
            clanMemberships: {
              take: 1,
              select: {
                clan: {
                  select: {
                    name: true,
                    tag: true,
                    accentColor: true,
                    logo: true,
                    banner: true,
                  },
                },
              },
            },
          },
        })
      : null;
    if (!streamer)
      throw new NotFoundException("유효하지 않은 방송 링크입니다.");

    const control = this.controlState(streamer);
    const streamerTheme = this.clanTheme(
      streamer.clanMemberships?.[0]?.clan ?? null,
    );

    const roomId = await activeRoomIdForUser(
      this.prisma,
      streamer.id,
      streamer.broadcastLiveRoomId,
    );
    // 송출할 활성 방이 없으면 브랜딩된 대기(idle) 스냅샷 반환
    if (!roomId) {
      return {
        idle: true,
        scene: scene === "control" ? "idle" : scene,
        room: null,
        theme: streamerTheme,
        streamer: { name: streamer.username },
        teams: [],
        broadcast: control,
        focusMatchId: null,
      };
    }

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        name: true,
        status: true,
        teamMode: true,
        maxParticipants: true,
        // 자동 밸런스 검토 씬에서 "다시 돌림 N회"를 시청자에게도 보여준다
        autoBalanceRerollCount: true,
        broadcastFocusMatchId: true,
        broadcastFocusChangedAt: true,
        host: {
          select: {
            username: true,
            clanMemberships: {
              take: 1,
              select: {
                clan: {
                  select: {
                    name: true,
                    tag: true,
                    accentColor: true,
                    logo: true,
                    banner: true,
                  },
                },
              },
            },
          },
        },
        participants: {
          where: { role: "PLAYER" },
          orderBy: { joinedAt: "asc" },
          select: {
            userId: true,
            isReady: true,
            isCaptain: true,
            user: {
              select: {
                username: true,
                avatar: true,
                // 대기화면에서 티어/랭크/LP를 노출하기 위해 대표 라이엇 계정을 함께 조회한다.
                // isPrimary 에 유니크 제약이 없어 where 로만 거르면 결과가 비결정적이고,
                // primary 를 지정하지 않은 유저는 계정이 있어도 '미연동'으로 보인다.
                // → 전체를 정렬해 첫 건만 대표로 쓴다. (primary → 인증 완료 → 먼저 등록된 순)
                riotAccounts: {
                  orderBy: [
                    { isPrimary: "desc" },
                    // Postgres 는 DESC 시 NULL 이 먼저 오므로 미인증 계정이
                    // 앞으로 튀지 않게 nulls: last 를 명시한다.
                    { verifiedAt: { sort: "desc", nulls: "last" } },
                    { createdAt: "asc" },
                  ],
                  take: 1,
                  select: { tier: true, rank: true, lp: true },
                },
              },
            },
          },
        },
        teams: {
          select: {
            id: true,
            name: true,
            color: true,
            captainId: true,
            initialBudget: true,
            remainingBudget: true,
            members: {
              select: {
                userId: true,
                assignedRole: true,
                soldPrice: true,
                user: {
                  select: {
                    username: true,
                    avatar: true,
                    riotAccounts: {
                      orderBy: [
                        { isPrimary: "desc" },
                        { verifiedAt: { sort: "desc", nulls: "last" } },
                        { createdAt: "asc" },
                      ],
                      take: 1,
                      select: {
                        tier: true,
                        rank: true,
                        lp: true,
                        balanceScores: true,
                        balanceScoreVersion: true,
                        championPreferences: {
                          orderBy: { order: "asc" },
                          select: {
                            role: true,
                            championId: true,
                            order: true,
                          },
                        },
                        roleTiers: {
                          select: {
                            role: true,
                            tier: true,
                            rank: true,
                            lp: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!room) throw new NotFoundException("방을 찾을 수 없습니다.");

    const clan = room.host?.clanMemberships?.[0]?.clan ?? null;
    const teamById = new Map((room.teams ?? []).map((t: any) => [t.id, t]));
    const resolved =
      scene === "control"
        ? await this.resolveControlledScene(control.scene, room.id, {
            status: room.status,
            teamMode: room.teamMode,
            broadcastFocusChangedAt: room.broadcastFocusChangedAt,
          })
        : { scene, nextChangeAt: null as number | null };
    const effectiveScene = resolved.scene;

    const common = {
      room: {
        id: room.id,
        name: room.name,
        status: room.status,
        teamMode: room.teamMode,
        participantCount: room.participants.length,
        maxParticipants: room.maxParticipants,
        autoBalanceRerollCount: room.autoBalanceRerollCount ?? 0,
        hostName: room.host?.username ?? null,
        participants: (room.participants ?? []).map((p: any) => {
          const riot = p.user?.riotAccounts?.[0] ?? null;
          return {
            userId: p.userId,
            username: p.user?.username ?? null,
            avatar: p.user?.avatar ?? null,
            isReady: p.isReady,
            isCaptain: p.isCaptain,
            // 미연동/언랭이면 null — 오버레이에서 티어 배지를 숨긴다.
            tier: riot?.tier ?? null,
            rank: riot?.rank || null,
            lp: typeof riot?.lp === "number" ? riot.lp : null,
          };
        }),
      },
      theme: this.clanTheme(clan),
      teams: (room.teams ?? []).map((t: any) => this.teamSummary(t)),
      focusMatchId: room.broadcastFocusMatchId ?? null,
      broadcast: control,
      scene: effectiveScene,
      // auto 모드의 시간 기반 전환 시각(epoch ms). 오버레이가 이 시점에 맞춰 갱신한다.
      sceneNextChangeAt: resolved.nextChangeAt,
    };

    if (
      effectiveScene === "match" ||
      effectiveScene === "match-intro" ||
      effectiveScene === "lineup" ||
      effectiveScene === "result"
    ) {
      // 우선순위: URL matchId → 방 focus → 진행 중 경기 → null
      const resolvedId =
        matchId ||
        room.broadcastFocusMatchId ||
        (effectiveScene === "result"
          ? await this.latestCompletedMatchId(roomId)
          : await this.firstLiveMatchId(roomId));
      const match = resolvedId
        ? await this.prisma.match.findFirst({
            where: { id: resolvedId, roomId },
            select: {
              id: true,
              status: true,
              round: true,
              bracketRound: true,
              matchNumber: true,
              winnerId: true,
              blueSideTeamId: true,
              bracketType: true,
              teamAId: true,
              teamBId: true,
            },
          })
        : null;
      const seriesByMatchId = await this.seriesScoreByMatchId(roomId);

      // 중계 중인 경기 옆으로 흘려보낼 "다른 경기 속보".
      // 지금 보고 있는 경기가 아닌, 방금 끝난 경기가 있을 때만 붙는다.
      const sideResult =
        effectiveScene === "match"
          ? await this.recentOtherResult(
              roomId,
              match?.id ?? null,
              teamById,
              seriesByMatchId,
            )
          : null;

      return {
        ...common,
        match: this.matchDetail(
          match,
          teamById,
          match ? seriesByMatchId.get(match.id) : null,
        ),
        ...(sideResult ? { sideResult } : {}),
      };
    }

    if (effectiveScene === "bracket" || effectiveScene === "summary") {
      const matches = await this.prisma.match.findMany({
        where: { roomId },
        orderBy: [{ round: "asc" }, { matchNumber: "asc" }],
        select: {
          id: true,
          status: true,
          round: true,
          bracketRound: true,
          matchNumber: true,
          winnerId: true,
          blueSideTeamId: true,
          bracketType: true,
          teamAId: true,
          teamBId: true,
        },
      });
      const seriesByMatchId = await this.seriesScoreByMatchId(roomId);
      return {
        ...common,
        matches: matches.map((m) =>
          this.matchDetail(m, teamById, seriesByMatchId.get(m.id)),
        ),
      };
    }

    // scene === "room" | "break": 공통(팀/참가자/상태)만으로 대기·경매·전환 렌더 가능
    return common;
  }

  /**
   * control 모드의 실제 출력 장면을 결정한다.
   * auto일 때는 경기 진행 상태 + 경과 시간으로 자동 전환하며,
   * 시간 기반 구간은 `nextChangeAt`(다음 전환 시각, epoch ms)을 함께 돌려준다.
   * 오버레이가 폴링(5초)만으로 기다리지 않고 그 시각에 정확히 갱신할 수 있게 하기 위함.
   */
  private async resolveControlledScene(
    scene: BroadcastControlScene,
    roomId: string,
    room: {
      status?: string | null;
      teamMode?: string | null;
      broadcastFocusChangedAt?: Date | null;
    },
  ): Promise<{ scene: BroadcastScene; nextChangeAt: number | null }> {
    const fixed = (value: BroadcastScene) => ({
      scene: value,
      nextChangeAt: null,
    });

    if (
      scene === "bracket" ||
      scene === "match-intro" ||
      scene === "lineup" ||
      scene === "match" ||
      scene === "result" ||
      scene === "summary"
    ) {
      return fixed(scene);
    }
    // 대기(idle)와 휴식(break)은 서로 다른 화면이다.
    if (scene === "break") return fixed("break");
    if (scene === "idle") return fixed("idle");
    if (scene !== "auto") return fixed("room");

    const [latestCompleted, liveMatch] = await Promise.all([
      this.latestCompletedMatch(roomId),
      this.firstLiveMatch(roomId),
    ]);
    const now = Date.now();

    // ── 결과 화면은 무엇보다 먼저 ──
    //
    // 아래 focus 분기가 이보다 앞에 있었을 때, 방금 끝난 경기의 결과가 화면에
    // 뜨자마자 사라졌다. 다전제는 한 세트가 끝나도 시리즈 슬롯이 IN_PROGRESS로
    // 남아 liveMatch 가 계속 잡히고, 단판도 다음 경기가 시작되는 순간 같은 일이
    // 벌어진다. 그래서 결과를 볼 새도 없이 대진표·경기 소개로 넘어갔다.
    //
    // 다만 방장이 결과를 본 뒤 직접 다음 중계 경기를 고른 경우(포커스 변경이
    // 경기 종료보다 나중)는 그 의사를 따른다.
    const focusPickedAfterResult =
      !!room.broadcastFocusChangedAt &&
      !!latestCompleted?.completedAt &&
      room.broadcastFocusChangedAt.getTime() >
        latestCompleted.completedAt.getTime();

    if (latestCompleted?.completedAt && !focusPickedAfterResult) {
      const resultUntil =
        latestCompleted.completedAt.getTime() + RESULT_SCENE_MS;
      if (now <= resultUntil) {
        return { scene: "result", nextChangeAt: resultUntil };
      }
    }

    // 조작 패널에서 중계 경기를 바꾸면 바로 경기 화면으로 점프하지 않는다.
    // 선택된 경기를 강조한 대진표를 잠깐 보여 준 뒤 자연스럽게 송출한다.
    if (room.broadcastFocusChangedAt && liveMatch) {
      // 경기가 이미 시작됐다면 가위바위보/진영 선택 완료 뒤 기록되는 startedAt을
      // 우선한다. 미리 대진을 선택해 둔 시간 때문에 60초 소개가 줄어들면 안 된다.
      const focusAt = Math.max(
        room.broadcastFocusChangedAt.getTime(),
        liveMatch.startedAt?.getTime() ?? 0,
      );
      const bracketUntil = focusAt + BRACKET_SCENE_BEFORE_MATCH_MS;
      if (now <= bracketUntil) {
        return { scene: "bracket", nextChangeAt: bracketUntil };
      }
      const introUntil = bracketUntil + MATCH_INTRO_SCENE_MS;
      if (now <= introUntil) {
        return { scene: "match-intro", nextChangeAt: introUntil };
      }
    }

    // 결승 결과도 먼저 보여 준 뒤, 우승 팀과 전체 완료 대진을 유지한다.
    if (room.status === "COMPLETED") return fixed("summary");

    if (liveMatch) {
      if (liveMatch.startedAt) {
        const bracketUntil =
          liveMatch.startedAt.getTime() + BRACKET_SCENE_BEFORE_MATCH_MS;
        if (now <= bracketUntil) {
          return { scene: "bracket", nextChangeAt: bracketUntil };
        }
        const introUntil = bracketUntil + MATCH_INTRO_SCENE_MS;
        if (now <= introUntil) {
          return { scene: "match-intro", nextChangeAt: introUntil };
        }
      }
      return fixed("match");
    }

    if (latestCompleted?.completedAt) {
      const bracketUntil =
        latestCompleted.completedAt.getTime() +
        RESULT_SCENE_MS +
        BRACKET_SCENE_AFTER_RESULT_MS;
      if (now <= bracketUntil) {
        return { scene: "bracket", nextChangeAt: bracketUntil };
      }
    }

    if (await this.hasBracket(roomId)) return fixed("bracket");

    return fixed("room");
  }

  /**
   * 중계 중인 경기 말고 방금 끝난 다른 경기.
   *
   * 여러 코트가 동시에 도는 대진에서, 한 경기를 중계하는 동안 다른 경기가
   * 먼저 끝나면 시청자는 그 사실을 알 길이 없었다. 끝난 직후 잠깐만 붙여
   * 보내고, 언제 걷을지(`hideAt`)도 함께 알려 준다.
   */
  private async recentOtherResult(
    roomId: string,
    currentMatchId: string | null,
    teamById: Map<string, any>,
    seriesByMatchId?: Map<string, SeriesScore>,
  ) {
    const since = new Date(Date.now() - SIDE_RESULT_MS);
    const match = await this.prisma.match.findFirst({
      where: {
        roomId,
        status: "COMPLETED",
        completedAt: { not: null, gte: since },
        ...(currentMatchId ? { id: { not: currentMatchId } } : {}),
      },
      orderBy: { completedAt: "desc" },
      select: {
        id: true,
        status: true,
        round: true,
        bracketRound: true,
        matchNumber: true,
        winnerId: true,
        blueSideTeamId: true,
        bracketType: true,
        teamAId: true,
        teamBId: true,
        completedAt: true,
      },
    });
    if (!match?.completedAt) return null;

    return {
      ...this.matchDetail(match, teamById, seriesByMatchId?.get(match.id)),
      hideAt: match.completedAt.getTime() + SIDE_RESULT_MS,
    };
  }

  /**
   * 매치 id → 그 매치가 속한 시리즈의 세트 스코어.
   *
   * 시리즈는 여러 세트(Match)를 묶으므로, 어느 세트를 보고 있든 같은 스코어가
   * 나와야 한다. 시리즈를 안 쓰는 단판 방이면 빈 맵이라 종전대로 동작한다.
   */
  private async seriesScoreByMatchId(
    roomId: string,
  ): Promise<Map<string, SeriesScore>> {
    const byMatchId = new Map<string, SeriesScore>();
    try {
      const scores = await this.matchSeries.getRoomSeriesScores(roomId);
      if (scores.length === 0) return byMatchId;

      const sets = await this.prisma.match.findMany({
        where: { roomId, seriesId: { not: null } },
        select: { id: true, seriesId: true },
      });
      const scoreBySeriesId = new Map(scores.map((s) => [s.seriesId, s]));
      for (const set of sets) {
        const score = set.seriesId
          ? scoreBySeriesId.get(set.seriesId)
          : undefined;
        if (score) byMatchId.set(set.id, score);
      }
    } catch (error) {
      // 스코어를 못 읽어도 오버레이는 떠야 한다. 세트 표시만 빠진다.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`시리즈 스코어 조회 실패 roomId=${roomId}: ${message}`);
    }
    return byMatchId;
  }

  /** 진행 중(IN_PROGRESS) 경기 중 첫 번째 id. */
  private async firstLiveMatchId(roomId: string): Promise<string | null> {
    const m = await this.firstLiveMatch(roomId);
    return m?.id ?? null;
  }

  private async firstLiveMatch(roomId: string) {
    return this.prisma.match.findFirst({
      where: { roomId, status: "IN_PROGRESS" },
      orderBy: [{ round: "asc" }, { matchNumber: "asc" }],
      select: { id: true, startedAt: true },
    });
  }

  private async latestCompletedMatch(roomId: string) {
    return this.prisma.match.findFirst({
      where: { roomId, status: "COMPLETED", completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      select: { id: true, completedAt: true },
    });
  }

  private async latestCompletedMatchId(roomId: string): Promise<string | null> {
    const match = await this.latestCompletedMatch(roomId);
    return match?.id ?? null;
  }

  private async hasBracket(roomId: string): Promise<boolean> {
    const match = await this.prisma.match.findFirst({
      where: { roomId },
      select: { id: true },
    });
    return !!match;
  }
}
