import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PubgPlatform } from "@nexus/database";
import { PrismaService } from "../prisma/prisma.service";
import { RegisterPubgAccountDto, UpdatePubgScoreDto } from "./dto";
import { PubgApiService, type PubgPlayerLookup } from "./pubg-api.service";
import { calculateNexusScore, calculateNexusTier } from "./pubg-score.util";

/** 매치가 없어 샤드를 못 정한 계정을 다시 탐색하기까지 두는 간격. */
const SHARD_RECHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PubgService {
  private readonly logger = new Logger(PubgService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pubgApi: PubgApiService,
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
