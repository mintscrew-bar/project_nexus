import { AuthService } from "./auth.service";

/**
 * 가입 유입 경로는 가입 직후 계정에 한 번만 찍혀야 한다. 기존 계정에 OAuth 를
 * 연결하는 경우에도 isNewUser 가 true 일 수 있어, 조건이 where 에 들어 있는지가 핵심이다.
 */
function bare(prisma: object) {
  const logger = { warn: jest.fn() };
  const service: AuthService = Object.assign(
    Object.create(AuthService.prototype),
    { prisma, logger },
  );
  return Object.assign(service, { warnings: logger.warn });
}

const attribution = {
  source: "youtube",
  medium: "video",
  referrer: "youtube.com",
};

describe("AuthService.recordSignupAttribution", () => {
  it("값이 비어 있고 가입 직후인 계정에만 쓴다", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = bare({ user: { updateMany } });

    await service.recordSignupAttribution("u1", attribution);

    const arg = updateMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ id: "u1", signupSource: null });
    // 10분 안에 만들어진 계정만
    const age = Date.now() - arg.where.createdAt.gte.getTime();
    expect(age).toBeGreaterThan(9 * 60_000);
    expect(age).toBeLessThan(11 * 60_000);
    expect(arg.data).toEqual({
      signupSource: "youtube",
      signupMedium: "video",
      signupReferrer: "youtube.com",
    });
  });

  it("쿠키가 없으면 아무것도 쓰지 않는다", async () => {
    const updateMany = jest.fn();
    await bare({ user: { updateMany } }).recordSignupAttribution("u1", null);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("기록이 실패해도 던지지 않는다 — 가입을 막으면 안 된다", async () => {
    const service = bare({
      user: { updateMany: jest.fn().mockRejectedValue(new Error("db")) },
    });
    await expect(
      service.recordSignupAttribution("u1", attribution),
    ).resolves.toBeUndefined();
    expect(service.warnings).toHaveBeenCalled();
  });
});
