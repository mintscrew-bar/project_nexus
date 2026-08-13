import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { StreamerPlatform } from "@nexus/database";
import axios from "axios";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

const CHZZK_AUTH_URL = "https://chzzk.naver.com/account-interlock";
const CHZZK_API_URL = "https://openapi.chzzk.naver.com";
const OAUTH_STATE_TTL_SECONDS = 10 * 60;

interface ChzzkResponse<T> {
  code: number;
  message: string | null;
  content: T;
}

interface ChzzkToken {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: string;
}

interface ChzzkUser {
  channelId: string;
  channelName: string;
}

@Injectable()
export class ChzzkOAuthService {
  private readonly logger = new Logger(ChzzkOAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async createAuthorizationUrl(userId: string): Promise<{ url: string }> {
    const { clientId, callbackUrl } = this.getConfig();
    const state = randomBytes(32).toString("base64url");
    await this.redis.set(
      `streamer:chzzk-oauth:${state}`,
      userId,
      OAUTH_STATE_TTL_SECONDS,
    );

    const params = new URLSearchParams({
      clientId,
      redirectUri: callbackUrl,
      state,
    });
    return { url: `${CHZZK_AUTH_URL}?${params.toString()}` };
  }

  async completeAuthorization(code: string, state: string) {
    if (!code || !state) {
      throw new BadRequestException("치지직 인증 응답이 올바르지 않습니다.");
    }

    const userId = await this.redis.getdel(`streamer:chzzk-oauth:${state}`);
    if (!userId) {
      throw new BadRequestException(
        "인증 요청이 만료되었거나 이미 사용되었습니다. 다시 연결해주세요.",
      );
    }

    const { clientId, clientSecret } = this.getConfig();
    try {
      const tokenResponse = await axios.post<ChzzkResponse<ChzzkToken>>(
        `${CHZZK_API_URL}/auth/v1/token`,
        {
          grantType: "authorization_code",
          clientId,
          clientSecret,
          code,
          state,
        },
        { timeout: 10_000 },
      );
      const accessToken = tokenResponse.data.content?.accessToken;
      if (!accessToken) throw new Error("Access token missing");

      const userResponse = await axios.get<ChzzkResponse<ChzzkUser>>(
        `${CHZZK_API_URL}/open/v1/users/me`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 10_000,
        },
      );
      const channel = userResponse.data.content;
      if (!channel?.channelId) throw new Error("Channel ID missing");

      const taken = await this.prisma.streamerProfile.findFirst({
        where: {
          platform: StreamerPlatform.CHZZK,
          channelId: channel.channelId,
          verifiedAt: { not: null },
          NOT: { userId },
        },
        select: { id: true },
      });
      if (taken) {
        throw new BadRequestException("이미 다른 계정이 인증한 채널입니다.");
      }

      const profile = await this.prisma.streamerProfile.upsert({
        where: {
          userId_platform: { userId, platform: StreamerPlatform.CHZZK },
        },
        create: {
          userId,
          platform: StreamerPlatform.CHZZK,
          channelUrl: `https://chzzk.naver.com/${channel.channelId}`,
          channelId: channel.channelId,
          channelName: channel.channelName,
          verifiedAt: new Date(),
        },
        update: {
          channelUrl: `https://chzzk.naver.com/${channel.channelId}`,
          channelId: channel.channelId,
          channelName: channel.channelName,
          verifiedAt: new Date(),
          verificationCode: null,
          verificationExpiresAt: null,
          isActive: true,
        },
      });

      this.logger.log(`치지직 OAuth 채널 인증 완료: ${userId}`);
      return profile;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const oauthError = this.describeOAuthError(error);
      this.logger.warn(`치지직 OAuth 처리 실패: ${oauthError}`);
      throw new BadGatewayException(
        "치지직 채널 정보를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.",
      );
    }
  }

  private describeOAuthError(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const data = error.response?.data as
        { code?: string | number; message?: string } | undefined;
      return [
        `status=${error.response?.status ?? "network"}`,
        `code=${data?.code ?? "unknown"}`,
        `message=${data?.message ?? error.message}`,
      ].join(" ");
    }
    return error instanceof Error ? error.message : String(error);
  }

  getSettingsRedirect(result: "success" | "error"): string {
    const appUrl =
      this.config.get<string>("APP_URL")?.replace(/\/$/, "") ||
      "http://localhost:3000";
    return `${appUrl}/settings?tab=broadcast&chzzk_oauth=${result}`;
  }

  private getConfig() {
    const clientId = this.config.get<string>("CHZZK_CLIENT_ID")?.trim();
    const clientSecret = this.config.get<string>("CHZZK_CLIENT_SECRET")?.trim();
    const callbackUrl = this.config.get<string>("CHZZK_CALLBACK_URL")?.trim();
    if (!clientId || !clientSecret || !callbackUrl) {
      throw new ServiceUnavailableException(
        "치지직 채널 연결이 아직 설정되지 않았습니다.",
      );
    }
    return { clientId, clientSecret, callbackUrl };
  }
}
