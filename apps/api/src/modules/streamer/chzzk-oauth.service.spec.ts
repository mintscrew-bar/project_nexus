import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { ChzzkOAuthService } from "./chzzk-oauth.service";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("ChzzkOAuthService", () => {
  const config = {
    get: jest.fn(
      (key: string) =>
        ({
          CHZZK_CLIENT_ID: "client-id",
          CHZZK_CLIENT_SECRET: "client-secret",
          CHZZK_CALLBACK_URL:
            "https://api.example.com/streamers/verify/chzzk/callback",
          APP_URL: "https://example.com/",
        })[key],
    ),
  } as unknown as ConfigService;
  const prisma = {
    streamerProfile: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const redis = {
    set: jest.fn(),
    getdel: jest.fn(),
  };
  let service: ChzzkOAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ChzzkOAuthService(config, prisma as any, redis as any);
  });

  it("creates a short-lived state-bound authorization URL", async () => {
    const result = await service.createAuthorizationUrl("user-1");
    const url = new URL(result.url);

    expect(url.origin + url.pathname).toBe(
      "https://chzzk.naver.com/account-interlock",
    );
    expect(url.searchParams.get("clientId")).toBe("client-id");
    expect(url.searchParams.get("redirectUri")).toContain(
      "/streamers/verify/chzzk/callback",
    );
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringMatching(/^streamer:chzzk-oauth:/),
      "user-1",
      600,
    );
  });

  it("consumes state and verifies the channel from the OAuth identity", async () => {
    redis.getdel.mockResolvedValue("user-1");
    mockedAxios.post.mockResolvedValue({
      data: { content: { accessToken: "access-token" } },
    } as any);
    mockedAxios.get.mockResolvedValue({
      data: {
        content: { channelId: "channel-1", channelName: "테스트 채널" },
      },
    } as any);
    prisma.streamerProfile.findFirst.mockResolvedValue(null);
    prisma.streamerProfile.upsert.mockResolvedValue({ id: "profile-1" });

    await service.completeAuthorization("code", "state");

    expect(redis.getdel).toHaveBeenCalledWith("streamer:chzzk-oauth:state");
    expect(mockedAxios.get).toHaveBeenCalledWith(
      "https://openapi.chzzk.naver.com/open/v1/users/me",
      expect.objectContaining({
        headers: { Authorization: "Bearer access-token" },
      }),
    );
    expect(prisma.streamerProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          channelId: "channel-1",
          verifiedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("rejects an expired or reused state before contacting CHZZK", async () => {
    redis.getdel.mockResolvedValue(null);

    await expect(
      service.completeAuthorization("code", "expired"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("redirects back to the broadcast settings tab", () => {
    expect(service.getSettingsRedirect("success")).toBe(
      "https://example.com/settings?tab=broadcast&chzzk_oauth=success",
    );
  });
});
