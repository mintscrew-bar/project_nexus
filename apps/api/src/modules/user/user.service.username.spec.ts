import { UserService } from "./user.service";

/**
 * 유저네임 규칙.
 *
 * 규칙이 너무 좁아 디스코드 이름을 그대로 쓰는 사람들이 프로필을 아예 저장하지
 * 못했다(2026-09-20 운영에서 400 연속 발생). 넓힌 규칙이 다시 좁아지지 않도록
 * 경계 사례를 고정한다.
 */
describe("UserService 유저네임 검증", () => {
  const makeService = (existingUsername: string | null = null) => {
    const update = jest.fn().mockImplementation(({ data }) => ({ ...data }));
    const prisma = {
      user: {
        findFirst: jest
          .fn()
          .mockImplementation(({ where }) =>
            existingUsername && where.username === existingUsername
              ? { id: "other-user" }
              : null,
          ),
        update,
      },
    };
    const service = new UserService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, update };
  };

  it.each([
    ["하루마룬", "완성형 한글"],
    ["ㅇㅈ", "자모만 쓴 이름"],
    ["haru maroon", "공백이 들어간 이름"],
    ["haru.maroon", "마침표가 들어간 이름"],
    ["haru-maroon", "하이픈이 들어간 이름"],
    ["haru_maroon", "밑줄이 들어간 이름"],
  ])("%s 는 허용한다 (%s)", async (username) => {
    const { service, update } = makeService();
    await service.updateProfile("user-1", { username });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ username }) }),
    );
  });

  it("양끝 공백은 잘라내고 연속 공백은 한 칸으로 줄인다", async () => {
    const { service, update } = makeService();
    await service.updateProfile("user-1", { username: "  haru   maroon  " });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ username: "haru maroon" }),
      }),
    );
  });

  it("이모지는 막는다", async () => {
    const { service } = makeService();
    await expect(
      service.updateProfile("user-1", { username: "하루마룬🔥" }),
    ).rejects.toThrow("사용 가능합니다");
  });

  it("문자가 하나도 없는 이름은 막는다", async () => {
    const { service } = makeService();
    await expect(
      service.updateProfile("user-1", { username: "..." }),
    ).rejects.toThrow("최소 하나는");
  });

  it("2자 미만은 막는다", async () => {
    const { service } = makeService();
    await expect(
      service.updateProfile("user-1", { username: "가" }),
    ).rejects.toThrow("2~20자");
  });

  it("공백을 줄인 뒤의 이름이 이미 쓰이고 있으면 막는다", async () => {
    const { service } = makeService("haru maroon");
    await expect(
      service.updateProfile("user-1", { username: "haru   maroon" }),
    ).rejects.toThrow("이미 사용 중");
  });
});
