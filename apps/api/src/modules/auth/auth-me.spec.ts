import { AuthService } from "./auth.service";

/**
 * /auth/me 응답 (2026-10-07).
 *
 * 설정 페이지 "내전 참여 준비" 카드가 이 응답의 authProviders·riotAccounts 로 연동 여부를
 * 판정한다. 응답을 줄이면서 이 값이 빠져 연동한 사람에게도 "안 됨"으로 보였다.
 * 반대로 민감 식별자(puuid·summonerId·providerId·이메일)는 계속 나가면 안 된다.
 */
function bare(user: unknown) {
  const findUnique = jest.fn().mockResolvedValue(user);
  const service: AuthService = Object.assign(
    Object.create(AuthService.prototype),
    {
      prisma: { user: { findUnique } },
    },
  );
  return { service, findUnique };
}

const base = {
  id: "u1",
  username: "tester",
  avatar: null,
  profileBanner: null,
  role: "USER",
  settings: null,
  authProviders: [{ provider: "DISCORD" }],
  riotAccounts: [
    {
      gameName: "Hide on bush",
      tagLine: "KR1",
      mainRole: "MID",
      subRole: "TOP",
      isPrimary: true,
    },
  ],
};

describe("AuthService.getUserById (/auth/me)", () => {
  it("설정 화면이 쓰는 연동 정보를 돌려준다", async () => {
    const { service } = bare(base);
    const me: any = await service.getUserById("u1");

    expect(me.authProviders).toEqual([{ provider: "DISCORD" }]);
    expect(me.riotAccounts[0]).toMatchObject({
      gameName: "Hide on bush",
      mainRole: "MID",
    });
    expect(me.settings).toBeUndefined();
  });

  it("민감 식별자는 조회 자체를 하지 않는다", async () => {
    const { service, findUnique } = bare(base);
    await service.getUserById("u1");

    const select = findUnique.mock.calls[0][0].select;
    expect(select.email).toBeUndefined();
    expect(select.password).toBeUndefined();
    expect(select.authProviders.select).toEqual({ provider: true });
    const riot = select.riotAccounts.select;
    expect(riot.puuid).toBeUndefined();
    expect(riot.summonerId).toBeUndefined();
    expect(Object.keys(riot).sort()).toEqual(
      ["gameName", "isPrimary", "mainRole", "subRole", "tagLine"].sort(),
    );
  });

  it("대표 계정이 첫 번째로 오도록 정렬한다 (화면은 [0] 을 쓴다)", async () => {
    const { service, findUnique } = bare(base);
    await service.getUserById("u1");
    expect(findUnique.mock.calls[0][0].select.riotAccounts.orderBy[0]).toEqual({
      isPrimary: "desc",
    });
  });

  it.each([
    [
      "설정에 본 기록이 있으면",
      { settings: { onboardingSeenAt: new Date() }, riotAccounts: [] },
      true,
    ],
    [
      "주 라인을 등록한 라이엇 계정이 있으면",
      { riotAccounts: [{ ...base.riotAccounts[0] }] },
      true,
    ],
    [
      "라이엇 계정은 있지만 주 라인이 없으면",
      { riotAccounts: [{ ...base.riotAccounts[0], mainRole: null }] },
      false,
    ],
    ["아무것도 없으면", { riotAccounts: [] }, false],
  ])("온보딩 판정: %s → %s", async (_n, over, expected) => {
    const { service } = bare({ ...base, ...over });
    const me: any = await service.getUserById("u1");
    expect(me.onboardingSeen).toBe(expected);
  });
});
