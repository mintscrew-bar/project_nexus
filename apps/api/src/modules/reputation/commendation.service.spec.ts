import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import {
  CommendationService,
  summarizeCommendations,
} from "./commendation.service";

/** 경기 m1 — A팀 me·a2, B팀 b1·b2 (방이 지워져 로스터 스냅샷만 남은 상태) */
const MATCH = {
  id: "m1",
  status: "COMPLETED",
  teamA: null,
  teamB: null,
  rosterSnapshots: [
    { userId: "me", teamSlot: "A" },
    { userId: "a2", teamSlot: "A" },
    { userId: "b1", teamSlot: "B" },
    { userId: "b2", teamSlot: "B" },
  ],
};

describe("CommendationService", () => {
  let prisma: any;
  let service: CommendationService;

  beforeEach(() => {
    prisma = {
      match: {
        findUnique: jest.fn().mockResolvedValue(MATCH),
        findFirst: jest.fn(),
      },
      commendationSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockReturnValue("session"),
      },
      userCommendation: {
        create: jest.fn().mockReturnValue("commendation"),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    service = new CommendationService(prisma);
  });

  describe("submit", () => {
    const submit = (
      commendations: { targetUserId: string; tags: string[] }[],
    ) => service.submit("me", { matchId: "m1", commendations });

    it("함께 뛴 사람을 칭찬하고 경기 창을 끝낸 것으로 기록한다", async () => {
      await submit([{ targetUserId: "b1", tags: ["MANNER", "MANNER"] }]);

      expect(prisma.commendationSession.create).toHaveBeenCalledWith({
        data: { userId: "me", matchId: "m1", skipped: false },
      });
      // 같은 태그가 두 번 와도 한 번만 저장한다
      expect(prisma.userCommendation.create).toHaveBeenCalledWith({
        data: {
          giverId: "me",
          targetUserId: "b1",
          matchId: "m1",
          tags: ["MANNER"],
        },
      });
    });

    it("빈 목록은 건너뛰기로 기록한다", async () => {
      await submit([]);
      expect(prisma.commendationSession.create).toHaveBeenCalledWith({
        data: { userId: "me", matchId: "m1", skipped: true },
      });
      expect(prisma.userCommendation.create).not.toHaveBeenCalled();
    });

    it("자기 자신·다른 경기 사람·중복은 막는다", async () => {
      await expect(submit([{ targetUserId: "me", tags: [] }])).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        submit([{ targetUserId: "stranger", tags: [] }]),
      ).rejects.toThrow(BadRequestException);
      await expect(
        submit([
          { targetUserId: "b1", tags: [] },
          { targetUserId: "b1", tags: [] },
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    it("그 경기에 안 뛴 사람은 칭찬할 수 없다", async () => {
      await expect(
        service.submit("outsider", {
          matchId: "m1",
          commendations: [{ targetUserId: "b1", tags: [] }],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("한 경기에 두 번 제출할 수 없다", async () => {
      prisma.commendationSession.findUnique.mockResolvedValue({ id: "s" });
      await expect(submit([])).rejects.toThrow(ConflictException);
    });
  });

  describe("getPending", () => {
    it("나를 빼고 같은 팀을 표시해 돌려준다", async () => {
      prisma.match.findFirst.mockResolvedValue({
        id: "m1",
        completedAt: new Date(),
        roomName: "금요 내전",
        gameNumber: 2,
        rosterSnapshots: [
          {
            userId: "me",
            username: "나",
            teamSlot: "A",
            teamName: "A팀",
            assignedRole: "MID",
            user: null,
          },
          {
            userId: "a2",
            username: "동료",
            teamSlot: "A",
            teamName: "A팀",
            assignedRole: "TOP",
            user: { avatar: "x.png" },
          },
          {
            userId: "b1",
            username: "상대",
            teamSlot: "B",
            teamName: "B팀",
            assignedRole: "ADC",
            user: null,
          },
          {
            userId: null,
            username: "탈퇴",
            teamSlot: "B",
            teamName: "B팀",
            assignedRole: null,
            user: null,
          },
        ],
        participants: [{ userId: "b1", championName: "Jinx" }],
      });

      const pending = await service.getPending("me");

      expect(pending?.players.map((p) => [p.userId, p.isTeammate])).toEqual([
        ["a2", true],
        ["b1", false],
      ]);
      expect(pending?.players[1].championName).toBe("Jinx");
      // 이미 끝낸 경기·봇 판·오래된 경기는 조회 조건에서 거른다
      const where = prisma.match.findFirst.mock.calls[0][0].where;
      expect(where.commendationSessions).toEqual({ none: { userId: "me" } });
      expect(where.NOT).toBeDefined();
      expect(where.completedAt.gte).toBeInstanceOf(Date);
    });

    it("칭찬할 상대가 없으면 null", async () => {
      prisma.match.findFirst.mockResolvedValue(null);
      expect(await service.getPending("me")).toBeNull();
    });
  });

  it("summarizeCommendations — 받은 수와 많이 받은 태그 3개", async () => {
    prisma.userCommendation.findMany.mockResolvedValue([
      { targetUserId: "u", tags: ["MANNER", "CARRY"] },
      { targetUserId: "u", tags: ["MANNER", "MENTAL", "SHOTCALL"] },
      { targetUserId: "u", tags: ["SHOTCALL"] },
      { targetUserId: "v", tags: [] },
    ]);
    const map = await summarizeCommendations(prisma, ["u", "v"]);
    expect(map.get("u")).toEqual({
      total: 3,
      topTags: [
        { tag: "MANNER", count: 2 },
        { tag: "SHOTCALL", count: 2 },
        { tag: "CARRY", count: 1 },
      ],
    });
    expect(map.get("v")).toEqual({ total: 1, topTags: [] });
  });
});
