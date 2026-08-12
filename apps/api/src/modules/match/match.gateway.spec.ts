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
});
