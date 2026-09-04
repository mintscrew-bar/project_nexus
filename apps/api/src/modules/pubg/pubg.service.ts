import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PubgPlatform, PubgTierSource } from "@nexus/database";
import { PrismaService } from "../prisma/prisma.service";
import { RegisterPubgAccountDto, UpdatePubgScoreDto } from "./dto";
import { PubgApiService, type PubgPlayerLookup } from "./pubg-api.service";
import { calculateNexusScore, calculateNexusTier } from "./pubg-score.util";
import {
  PUBG_BALANCE_VERSION,
  calculateAutoBalanceScore,
} from "@nexus/types";
import { PubgHistoryService } from "./pubg-history.service";

/** 매치가 없어 샤드를 못 정한 계정을 다시 탐색하기까지 두는 간격. */
const SHARD_RECHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PubgService {
  private readonly logger = new Logger(PubgService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pubgApi: PubgApiService,
    private readonly history: PubgHistoryService,
  ) {}

  async getAccounts(userId: string) {
    return this.prisma.pubgAccount.findMany({
      where: { userId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });
  }

  /**
   * 등록 전 닉네임 확인.
   *
   * 등록 버튼을 누르기 전에 "이 계정이 맞는지"와 "어느 플랫폼에서 하는지"를
   * 보여준다. 소유권은 검증되지 않는다는 사실도 여기서 함께 알린다.
   */
  async lookupPlayer(playerName: string) {
    const found = await this.pubgApi.lookupPlayer(playerName);
    if (!found) {
      return {
        found: false as const,
        message:
          "해당 닉네임의 PUBG 계정을 찾지 못했습니다. 대소문자까지 정확히 입력해주세요.",
      };
    }

    // 이미 누가 등록했는지도 같이 알려준다. 등록 버튼을 누른 뒤에 막히는 것보다 낫다.
    const taken = await this.prisma.pubgAccount.findUnique({
      where: { playerId: found.playerId },
      select: { userId: true },
    });

    return {
      found: true as const,
      playerId: found.playerId,
      playerName: found.playerName,
      matchShard: found.matchShard,
      recentMatchCount: found.recentMatchIds.length,
      alreadyRegistered: !!taken,
      // PUBG API 는 계정 소유권을 인증하지 않는다. 화면에서 이 사실을 명시한다.
      ownershipVerified: false as const,
    };
  }

  /**
   * 계정 등록.
   *
   * 조회에 성공한 계정만 등록한다 — 손으로 적은 식별자를 그대로 받으면
   * 오타든 사칭이든 걸러낼 방법이 전혀 없어진다.
   */
  async registerAccount(userId: string, dto: RegisterPubgAccountDto) {
    const found = await this.pubgApi.lookupPlayer(dto.playerName);
    if (!found) {
      throw new NotFoundException(
        "해당 닉네임의 PUBG 계정을 찾지 못했습니다. 대소문자까지 정확히 입력해주세요.",
      );
    }

    // 같은 계정을 두 사람이 가져갈 수 없다(Task 17).
    // 소유권을 인증할 방법이 없으므로 "먼저 등록한 사람"이 유일한 기준이다.
    const existing = await this.prisma.pubgAccount.findUnique({
      where: { playerId: found.playerId },
      select: { userId: true },
    });
    if (existing) {
      throw new ConflictException(
        existing.userId === userId
          ? "이미 등록한 PUBG 계정입니다."
          : "이미 다른 사용자에게 등록된 PUBG 계정입니다. 본인 계정이라면 문의해주세요.",
      );
    }

    const isFirst =
      (await this.prisma.pubgAccount.count({ where: { userId } })) === 0;

    return this.prisma.pubgAccount.create({
      data: {
        userId,
        playerId: found.playerId,
        playerName: found.playerName,
        lastMatchShard: found.matchShard,
        lastMatchShardCheckedAt: new Date(),
        isPrimary: isFirst,
        // PUBG API 에 소유권 인증이 없다. 상태를 올릴 경로 자체가 없다.
        verificationStatus: "UNVERIFIED",
      },
    });
  }

  async deleteAccount(userId: string, accountId: string) {
    const account = await this.findOwned(userId, accountId);
    await this.prisma.$transaction(async (tx) => {
      await tx.pubgAccount.delete({ where: { id: accountId } });
      if (!account.isPrimary) return;
      // 대표 계정을 지웠으면 남은 것 중 가장 오래된 것을 승격한다.
      // 대표가 없으면 로비·프로필이 계정을 못 고른다.
      const next = await tx.pubgAccount.findFirst({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (next) {
        await tx.pubgAccount.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    });
  }

  /** 대표 계정 지정. 로비·프로필이 보여주는 계정이 바뀐다. */
  async setPrimary(userId: string, accountId: string) {
    await this.findOwned(userId, accountId);
    await this.prisma.$transaction([
      this.prisma.pubgAccount.updateMany({
        where: { userId },
        data: { isPrimary: false },
      }),
      this.prisma.pubgAccount.update({
        where: { id: accountId },
        data: { isPrimary: true },
      }),
    ]);
    return this.getAccounts(userId);
  }

  async updateScore(
    userId: string,
    accountId: string,
    dto: UpdatePubgScoreDto,
  ) {
    await this.findOwned(userId, accountId);

    const nexusScore = calculateNexusScore(dto);
    if (nexusScore === null) {
      throw new BadRequestException("편성 점수 항목을 모두 입력해주세요.");
    }

    return this.prisma.pubgAccount.update({
      where: { id: accountId },
      data: {
        ...dto,
        nexusScore,
        nexusTier: calculateNexusTier(nexusScore),
        // 본인이 넣은 값이다. 운영자 보정·자동 산정과 구분해야 나중에 덮어쓸지
        // 판단할 수 있다.
        nexusTierSource: PubgTierSource.SELF,
        scoreUpdatedAt: new Date(),
      },
    });
  }

  /**
   * 공식 PUBG 랭크 스냅샷 갱신.
   *
   * 공식 랭크는 NEXUS 편성 등급과 **다른 값이다.** 편성 등급을 대체하지 않고,
   * 화면에서도 라벨을 갈라 적는다. 랭크가 없는 계정(배치 미완)은 null 로 둔다 —
   * "브론즈"로 떨어뜨리면 없는 정보를 지어내는 셈이다.
   */
  async refreshRankSnapshot(userId: string, accountId: string) {
    const account = await this.findOwned(userId, accountId);

    // 매치가 나온 샤드를 모르면 어느 쪽 랭크를 물어야 할지 알 수 없다.
    const shard =
      account.lastMatchShard ??
      (await this.refreshShardIfUnknown(accountId));
    if (!shard) {
      throw new BadRequestException(
        "플레이 플랫폼이 확인되지 않아 공식 랭크를 가져올 수 없습니다. 커스텀이 아닌 경기를 한 판 치른 뒤 다시 시도해주세요.",
      );
    }

    const snapshot = await this.pubgApi.getRankedStats(shard, account.playerId);

    return this.prisma.pubgAccount.update({
      where: { id: accountId },
      data: {
        // 티어 + 서브티어를 한 문자열로 둔다(예: "Diamond 3"). 모드까지 붙이면
        // 화면마다 다시 쪼개야 해서 표시용 한 줄로 저장한다.
        pubgTier: snapshot
          ? [snapshot.tier, snapshot.subTier].filter(Boolean).join(" ") || null
          : null,
        lastSyncedAt: new Date(),
      },
    });
  }

  /**
   * 편성 점수 자동 산정.
   *
   * 공식 랭크 · 내전 평균 순위 · 내전 평균 킬을 섞는다. 근거가 하나도 없으면
   * 점수를 내지 않는다 — 0점으로 떨어뜨리면 "데이터 부족"이 "실력 없음"이 된다.
   *
   * 본인이 직접 넣은 점수(SELF)나 운영자 보정(ADMIN)은 덮지 않는다.
   * 사람이 판단한 값을 기계가 조용히 지우면 왜 바뀌었는지 아무도 모른다.
   */
  async recomputeBalanceScore(accountId: string, options?: { force?: boolean }) {
    const account = await this.prisma.pubgAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        userId: true,
        pubgTier: true,
        nexusTierSource: true,
      },
    });
    if (!account) return null;

    const isManual =
      account.nexusTierSource === PubgTierSource.SELF ||
      account.nexusTierSource === PubgTierSource.ADMIN;
    if (isManual && !options?.force) return null;

    const history = await this.history.getUserHistory(account.userId, 50);
    const scrims = history.items.filter(
      (item): item is Extract<typeof item, { kind: "SCRIM" }> =>
        item.kind === "SCRIM",
    );
    const roundsPlayed = scrims.reduce((sum, item) => sum + item.rounds, 0);
    const averageTeamCount =
      scrims.length > 0
        ? scrims.reduce((sum, item) => sum + item.totalTeams, 0) / scrims.length
        : null;

    const result = calculateAutoBalanceScore({
      officialTier: account.pubgTier,
      averageScrimRank: history.summary.averageScrimRank,
      averageTeamCount,
      averageKillsPerRound: history.summary.averageKillsPerRound,
      roundsPlayed,
    });

    return this.prisma.pubgAccount.update({
      where: { id: accountId },
      data: {
        nexusScore: result.score,
        nexusTier: calculateNexusTier(result.score),
        nexusTierSource:
          result.score === null ? PubgTierSource.NONE : PubgTierSource.AUTO,
        balanceVersion: result.score === null ? null : PUBG_BALANCE_VERSION,
        balanceSampleSize: roundsPlayed,
        balanceComputedAt: new Date(),
      },
    });
  }

  /**
   * 운영자 등급 보정.
   *
   * 자동 산정이 사람 눈에 명백히 틀린 경우를 위한 경로다. 사유를 남기게 해서
   * "누가 왜 올렸는지"가 기록에 남는다.
   */
  async setTierByAdmin(accountId: string, tier: string, note?: string) {
    const account = await this.prisma.pubgAccount.findUnique({
      where: { id: accountId },
      select: { id: true },
    });
    if (!account) throw new NotFoundException("PUBG 계정을 찾을 수 없습니다.");

    return this.prisma.pubgAccount.update({
      where: { id: accountId },
      data: {
        nexusTier: tier,
        nexusTierSource: PubgTierSource.ADMIN,
        nexusTierNote: note ?? null,
        scoreUpdatedAt: new Date(),
      },
    });
  }

  /**
   * 매치가 나오는 샤드를 다시 찾는다.
   *
   * 등록 시점에 최근 매치가 없었던 계정은 샤드가 비어 있다. 그 상태로 두면
   * 결과 수집이 두 샤드를 매번 훑어 예산을 두 배로 쓴다. 하루에 한 번만 다시 본다.
   */
  async refreshShardIfUnknown(accountId: string): Promise<PubgPlatform | null> {
    const account = await this.prisma.pubgAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) return null;
    if (account.lastMatchShard) return account.lastMatchShard;

    const checkedAt = account.lastMatchShardCheckedAt?.getTime() ?? 0;
    if (Date.now() - checkedAt < SHARD_RECHECK_INTERVAL_MS) return null;

    let found: PubgPlayerLookup | null = null;
    try {
      found = await this.pubgApi.lookupPlayer(account.playerName);
    } catch (error) {
      // 예산 초과·일시 장애로 실패해도 등록 상태는 그대로 둔다.
      this.logger.warn(
        `샤드 재탐색 실패 (${account.playerName}): ${(error as Error).message}`,
      );
      return null;
    }

    await this.prisma.pubgAccount.update({
      where: { id: accountId },
      data: {
        lastMatchShard: found?.matchShard ?? null,
        lastMatchShardCheckedAt: new Date(),
        // 닉네임이 바뀌었을 수 있다. 조회로 확인된 표기를 따라간다.
        ...(found?.playerName ? { playerName: found.playerName } : {}),
      },
    });
    return found?.matchShard ?? null;
  }

  private async findOwned(userId: string, accountId: string) {
    const account = await this.prisma.pubgAccount.findFirst({
      where: { id: accountId, userId },
    });
    if (!account) throw new NotFoundException("PUBG 계정을 찾을 수 없습니다.");
    return account;
  }
}
