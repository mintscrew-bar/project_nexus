import { MatchGateway } from "./match.gateway";

describe("MatchGateway multi-game side flow", () => {
  it("starts game 2 immediately without creating an RPS state", async () => {
    const matchService = {
      startMatch: jest.fn().mockResolvedValue({ tournamentCode: "CODE-2" }),
      findById: jest.fn().mockResolvedValue({ roomId: "room-1" }),
    };
    const emit = jest.fn();
    const gateway = new MatchGateway(
      {} as any,
      matchService as any,
      {} as any,
      {} as any,
    );
    (gateway as any).server = {
      to: jest.fn().mockReturnValue({ emit }),
    };

    await (gateway as any).doRpsStart("match-2", {
      hostId: "host-1",
      teamAId: "team-a",
      teamBId: "team-b",
      captainAId: "captain-a",
      captainBId: "captain-b",
      gameNumber: 2,
      blueSideTeamId: "team-b",
      autoSideSwap: true,
    });

    expect(matchService.startMatch).toHaveBeenCalledWith("host-1", "match-2");
    expect((gateway as any).rpsStates.has("match-2")).toBe(false);
    expect((gateway as any).startingMatches.has("match-2")).toBe(false);
    expect(emit).toHaveBeenCalledWith("match-started", {
      tournamentCode: "CODE-2",
    });
  });

  it("가위바위보 상태·공개·진영 확정을 방송 오버레이(bracket 방)에도 보낸다", async () => {
    const matchService = {
      findById: jest.fn().mockResolvedValue({ roomId: "room-1" }),
    };
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    const gateway = new MatchGateway(
      {} as any,
      matchService as any,
      {} as any,
      {} as any,
    );
    (gateway as any).server = { to };

    const state = {
      matchId: "match-1",
      teamAId: "team-a",
      teamBId: "team-b",
      captainAId: "captain-a",
      captainBId: "captain-b",
      captainAIsBot: false,
      captainBIsBot: false,
      hostId: "host-1",
      phase: "throw",
      submissions: new Map([["captain-a", "rock"]]),
      gameNumber: 1,
    };
    (gateway as any).broadcastRpsState(state);
    (gateway as any).relayRpsToBroadcast("match-1", "reveal", {
      matchId: "match-1",
      handA: "rock",
      handB: "scissors",
      tie: false,
      winnerTeamId: "team-a",
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(to).toHaveBeenCalledWith("bracket:room-1");
    const relayed = emit.mock.calls.filter(
      ([event]) => event === "broadcast-rps",
    );
    expect(relayed.map(([, payload]) => payload.kind)).toEqual([
      "state",
      "reveal",
    ]);
    // 공개 전 상태에는 누가 냈는지만 있고 손은 없다
    expect(relayed[0][1].submitted).toEqual(["captain-a"]);
    expect(JSON.stringify(relayed[0][1])).not.toContain("rock");
    // 방 id 는 한 번만 조회한다
    expect(matchService.findById).toHaveBeenCalledTimes(1);
  });
});
