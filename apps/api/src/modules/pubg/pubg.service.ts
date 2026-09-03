import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RegisterPubgAccountDto, UpdatePubgScoreDto } from "./dto";

const calculateNexusScore = (dto: RegisterPubgAccountDto) => {
  const values = [
    dto.combatScore,
    dto.iglScore,
    dto.teamplayScore,
    dto.consistencyScore,
    dto.experienceScore,
  ];
  if (values.some((value) => value === undefined)) return null;
  return Math.round(
    dto.combatScore! * 0.35 +
      dto.iglScore! * 0.25 +
      dto.teamplayScore! * 0.2 +
      dto.consistencyScore! * 0.1 +
      dto.experienceScore! * 0.1,
  );
};

const calculateNexusTier = (score: number | null) => {
  if (score === null) return null;
  if (score >= 85) return "1";
  if (score >= 70) return "2";
  if (score >= 55) return "3";
  if (score >= 40) return "4";
  return "5";
};

@Injectable()
export class PubgService {
  constructor(private readonly prisma: PrismaService) {}

  async getAccounts(userId: string) {
    return this.prisma.pubgAccount.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
  }

  async registerAccount(userId: string, dto: RegisterPubgAccountDto) {
    const existingPlatform = await this.prisma.pubgAccount.findUnique({
      where: { userId_platform: { userId, platform: dto.platform } },
    });
    if (existingPlatform) {
      throw new ConflictException(
        "해당 플랫폼의 PUBG 계정이 이미 등록되어 있습니다.",
      );
    }

    const existingPlayer = await this.prisma.pubgAccount.findUnique({
      where: {
        platform_playerName: {
          platform: dto.platform,
          playerName: dto.playerName.trim(),
        },
      },
    });
    if (existingPlayer) {
      throw new ConflictException(
        "이미 다른 사용자에게 등록된 PUBG 계정입니다.",
      );
    }

    const nexusScore = calculateNexusScore(dto);
    return this.prisma.pubgAccount.create({
      data: {
        userId,
        platform: dto.platform,
        playerName: dto.playerName.trim(),
        playerId: dto.playerId?.trim() || null,
        verificationStatus: "UNVERIFIED",
        combatScore: dto.combatScore,
        iglScore: dto.iglScore,
        teamplayScore: dto.teamplayScore,
        consistencyScore: dto.consistencyScore,
        experienceScore: dto.experienceScore,
        nexusScore,
        nexusTier: calculateNexusTier(nexusScore),
        scoreUpdatedAt: nexusScore === null ? null : new Date(),
      },
    });
  }

  async deleteAccount(userId: string, accountId: string) {
    const account = await this.prisma.pubgAccount.findFirst({
      where: { id: accountId, userId },
    });
    if (!account) throw new NotFoundException("PUBG 계정을 찾을 수 없습니다.");
    await this.prisma.pubgAccount.delete({ where: { id: accountId } });
  }

  async updateScore(
    userId: string,
    accountId: string,
    dto: UpdatePubgScoreDto,
  ) {
    const account = await this.prisma.pubgAccount.findFirst({
      where: { id: accountId, userId },
    });
    if (!account) throw new NotFoundException("PUBG 계정을 찾을 수 없습니다.");

    const nexusScore = Math.round(
      dto.combatScore * 0.35 +
        dto.iglScore * 0.25 +
        dto.teamplayScore * 0.2 +
        dto.consistencyScore * 0.1 +
        dto.experienceScore * 0.1,
    );
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
}
