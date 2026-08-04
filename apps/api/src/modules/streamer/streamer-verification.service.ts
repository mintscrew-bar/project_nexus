import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { StreamerPlatform } from "@nexus/database";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { LiveProviderRegistry } from "./providers/live-provider.registry";

/** 인증 코드 유효 시간(분) */
const CODE_TTL_MINUTES = 30;

/**
 * 채널 소유권 검증.
 *
 * 라이브 뱃지가 붙는 순간 채널 URL 사칭이 실익을 갖기 때문에,
 * 검증된 채널만 스트리머 목록·라이브 뱃지에 노출한다.
 *
 * 방식은 코드 대조다 — 발급한 코드를 채널 소개글에 넣게 하고 우리가 읽어서 맞춰본다.
 * 치지직 OAuth 앱 승인이 나오면 그쪽이 더 깔끔하므로 경로를 하나 더 붙일 예정이고,
 * 이 방식은 SOOP처럼 OAuth를 못 쓰는 플랫폼용으로 계속 남는다.
 */
@Injectable()
export class StreamerVerificationService {
  private readonly logger = new Logger(StreamerVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: LiveProviderRegistry,
  ) {}

  /**
   * 검증 시작 — 채널 URL을 확인하고 일회용 코드를 발급한다.
   * 스트리머는 이 코드를 채널 소개글에 넣은 뒤 confirm을 호출한다.
   */
  async issueCode(userId: string, platform: StreamerPlatform) {
    const profile = await this.prisma.streamerProfile.findUnique({
      where: { userId_platform: { userId, platform } },
    });
    if (!profile) {
      throw new NotFoundException("먼저 방송 채널을 등록해주세요.");
    }

    const provider = this.providers.get(platform);
    if (!provider) {
      throw new BadRequestException(
        "이 플랫폼은 아직 채널 인증을 지원하지 않습니다.",
      );
    }

    const channelId = provider.parseChannelId(profile.channelUrl);
    if (!channelId) {
      throw new BadRequestException(
        "채널 주소 형식을 확인해주세요. 채널 홈 주소를 그대로 넣어야 합니다.",
      );
    }

    // 다른 계정이 이미 검증한 채널이면 막는다 (선점 사칭 방지).
    const taken = await this.prisma.streamerProfile.findFirst({
      where: {
        platform,
        channelId,
        verifiedAt: { not: null },
        NOT: { userId },
      },
      select: { id: true },
    });
    if (taken) {
      throw new BadRequestException("이미 다른 계정이 인증한 채널입니다.");
    }

    const code = `NEXUS-${randomBytes(4).toString("hex").toUpperCase()}`;
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

    await this.prisma.streamerProfile.update({
      where: { id: profile.id },
      data: {
        channelId,
        verificationCode: code,
        verificationExpiresAt: expiresAt,
      },
    });

    return {
      code,
      expiresAt,
      // 플랫폼마다 코드를 넣을 위치가 달라 안내 문구를 함께 내려준다.
      instruction:
        platform === StreamerPlatform.CHZZK
          ? "치지직 스튜디오 > 채널 관리 > 채널 소개에 아래 코드를 붙여넣고 저장한 뒤 인증하기를 눌러주세요."
          : "숲 방송국 > 방송국 설정 > 방송국 제목 뒤에 아래 코드를 붙여넣고 저장한 뒤 인증하기를 눌러주세요.",
    };
  }

  /** 검증 확인 — 채널 소개글에서 코드를 찾아 대조한다. */
  async confirm(userId: string, platform: StreamerPlatform) {
    const profile = await this.prisma.streamerProfile.findUnique({
      where: { userId_platform: { userId, platform } },
    });
    if (!profile) {
      throw new NotFoundException("먼저 방송 채널을 등록해주세요.");
    }
    if (!profile.verificationCode || !profile.channelId) {
      throw new BadRequestException("인증 코드를 먼저 발급받아주세요.");
    }
    if (
      profile.verificationExpiresAt &&
      profile.verificationExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException(
        "인증 코드가 만료되었습니다. 다시 발급받아주세요.",
      );
    }

    const provider = this.providers.get(platform);
    if (!provider) {
      throw new BadRequestException(
        "이 플랫폼은 아직 채널 인증을 지원하지 않습니다.",
      );
    }

    const identity = await provider.fetchIdentity(profile.channelId);
    if (!identity) {
      throw new BadRequestException(
        "채널 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
      );
    }

    // 코드를 넣을 수 있는 필드를 주지 않는 플랫폼은 관리자 수동 승인으로 넘긴다.
    if (identity.description == null) {
      throw new BadRequestException(
        "이 플랫폼은 자동 인증을 지원하지 않습니다. 관리자 확인 후 처리됩니다.",
      );
    }

    if (!identity.description.includes(profile.verificationCode)) {
      throw new BadRequestException(
        platform === StreamerPlatform.CHZZK
          ? "채널 소개에서 인증 코드를 찾지 못했습니다. 저장 후 다시 시도해주세요."
          : "방송국 제목에서 인증 코드를 찾지 못했습니다. 저장 후 다시 시도해주세요.",
      );
    }

    const verified = await this.prisma.streamerProfile.update({
      where: { id: profile.id },
      data: {
        verifiedAt: new Date(),
        verificationCode: null,
        verificationExpiresAt: null,
        channelName: identity.channelName ?? profile.channelName,
        channelImageUrl: identity.channelImageUrl,
        followerCount: identity.followerCount,
      },
    });

    this.logger.log(`채널 인증 완료: ${userId} · ${platform}`);

    return {
      verified: true,
      channelName: verified.channelName,
      verifiedAt: verified.verifiedAt,
    };
  }
}
