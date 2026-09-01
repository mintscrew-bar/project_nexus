import { AuthController } from "./auth.controller";
import type { AuthService } from "./auth.service";
import type { ConfigService } from "@nestjs/config";

const APP_URL = "https://app.example.com";

function makeConfig(): ConfigService {
  const values: Record<string, string> = {
    APP_URL,
    API_URL: "https://api.example.com",
    NODE_ENV: "test",
    DISCORD_CLIENT_ID: "client-id",
    DISCORD_CALLBACK_URL: "https://api.example.com/api/auth/discord/callback",
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function makeRes() {
  return {
    redirect: jest.fn(),
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    json: jest.fn(),
  };
}

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    query: {},
    cookies: {},
    user: { user: { id: "user-1" }, isNewUser: false },
    ...overrides,
  };
}

describe("Discord OAuth 로그인 state (CSRF 방어)", () => {
  let authService: jest.Mocked<Partial<AuthService>>;
  let controller: AuthController;

  beforeEach(() => {
    authService = {
      issueOAuthLoginState: jest.fn().mockResolvedValue("state-abc"),
      consumeOAuthLoginState: jest.fn().mockResolvedValue(true),
      isValidLinkToken: jest.fn().mockResolvedValue(false),
      checkAccountStatus: jest.fn().mockResolvedValue(undefined),
      generateTokens: jest.fn().mockResolvedValue({
        accessToken: "at",
        refreshToken: "rt",
      }),
      generateOAuthCode: jest.fn().mockResolvedValue("one-time-code"),
    };
    controller = new AuthController(
      authService as unknown as AuthService,
      makeConfig(),
    );
    jest
      .spyOn(controller["logger"], "warn")
      .mockImplementation(() => undefined);
  });

  describe("로그인 시작", () => {
    it("state를 발급해 쿠키와 Discord URL 양쪽에 심는다", async () => {
      const res = makeRes();
      await controller.discordAuth(res as never);

      expect(res.cookie).toHaveBeenCalledWith(
        "oauth_state",
        "state-abc",
        expect.objectContaining({ httpOnly: true, sameSite: "lax" }),
      );
      const redirectedTo = res.redirect.mock.calls[0][0] as string;
      expect(redirectedTo).toContain("discord.com/api/oauth2/authorize");
      expect(redirectedTo).toContain("state=state-abc");
    });
  });

  describe("콜백", () => {
    it("state가 쿠키와 일치하면 로그인을 진행한다", async () => {
      const res = makeRes();
      const req = makeReq({
        query: { code: "c", state: "state-abc" },
        cookies: { oauth_state: "state-abc" },
      });

      await controller.discordCallback(req as never, res as never);

      expect(authService.consumeOAuthLoginState).toHaveBeenCalledWith(
        "state-abc",
      );
      expect(res.redirect).toHaveBeenCalledWith(
        `${APP_URL}/api/auth/callback?code=one-time-code`,
      );
    });

    it("state 쿠키가 없으면 로그인시키지 않는다", async () => {
      // 공격자가 자기 인가 코드를 피해자 브라우저에 흘린 경우.
      // 피해자 브라우저에는 우리가 심은 state 쿠키가 없다.
      const res = makeRes();
      const req = makeReq({ query: { code: "c", state: "state-abc" } });

      await controller.discordCallback(req as never, res as never);

      expect(authService.generateTokens).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        `${APP_URL}/auth/login?error=invalid_state`,
      );
    });

    it("쿼리 state와 쿠키가 다르면 거부한다", async () => {
      const res = makeRes();
      const req = makeReq({
        query: { code: "c", state: "attacker-state" },
        cookies: { oauth_state: "victim-state" },
      });

      await controller.discordCallback(req as never, res as never);

      expect(authService.consumeOAuthLoginState).not.toHaveBeenCalled();
      expect(authService.generateTokens).not.toHaveBeenCalled();
    });

    it("state가 아예 없으면 거부한다", async () => {
      const res = makeRes();
      const req = makeReq({ query: { code: "c" } });

      await controller.discordCallback(req as never, res as never);

      expect(authService.generateTokens).not.toHaveBeenCalled();
    });

    it("이미 사용된 state는 거부한다", async () => {
      // Redis 단회 소비 — 재생 공격 차단
      authService.consumeOAuthLoginState = jest.fn().mockResolvedValue(false);
      const res = makeRes();
      const req = makeReq({
        query: { code: "c", state: "state-abc" },
        cookies: { oauth_state: "state-abc" },
      });

      await controller.discordCallback(req as never, res as never);

      expect(authService.generateTokens).not.toHaveBeenCalled();
    });

    it("성공/실패와 무관하게 state 쿠키를 정리한다", async () => {
      const res = makeRes();
      const req = makeReq({ query: { code: "c" } });

      await controller.discordCallback(req as never, res as never);

      expect(res.clearCookie).toHaveBeenCalledWith(
        "oauth_state",
        expect.objectContaining({ path: "/api/auth" }),
      );
    });

    it("계정 연동 흐름은 state 검증을 거치지 않는다", async () => {
      // 연동은 이미 자체 link token(Redis)으로 보호된다.
      authService.isValidLinkToken = jest.fn().mockResolvedValue(true);
      authService.verifyLinkToken = jest.fn().mockResolvedValue("user-1");
      authService.getDiscordProfile = jest
        .fn()
        .mockResolvedValue({ id: "d1", email: "e@x.com" });
      authService.linkOAuthProvider = jest.fn().mockResolvedValue(undefined);

      const res = makeRes();
      const req = makeReq({ query: { code: "c", state: "link-token" } });

      await controller.discordCallback(req as never, res as never);

      expect(authService.consumeOAuthLoginState).not.toHaveBeenCalled();
      expect(authService.verifyLinkToken).toHaveBeenCalledWith(
        "link-token",
        "discord",
      );
    });
  });
});
