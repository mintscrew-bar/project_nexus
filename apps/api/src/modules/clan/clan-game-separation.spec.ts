import { GameTitle } from "@nexus/database";
import { ClanService } from "./clan.service";

describe("ClanService game separation", () => {
  const createService = (prismaOverrides: Record<string, unknown> = {}) => {
    const prisma = {
      clanMember: { findFirst: jest.fn() },
      clan: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
      ...prismaOverrides,
    } as any;

    return {
      prisma,
      service: new ClanService(prisma, {} as any, {} as any),
    };
  };

  it("queries the current user's clan within the selected game", async () => {
    const { prisma, service } = createService();
    prisma.clanMember.findFirst.mockResolvedValue(null);

    await service.getUserClan("user-1", GameTitle.PUBG);

    expect(prisma.clanMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", clan: { gameTitle: GameTitle.PUBG } },
      }),
    );
  });

  it("filters clan discovery by game", async () => {
    const { prisma, service } = createService();
    prisma.clan.findMany.mockResolvedValue([]);

    await service.listClans({ gameTitle: GameTitle.PUBG });

    expect(prisma.clan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { gameTitle: GameTitle.PUBG } }),
    );
  });

  it("checks membership and tag uniqueness only within the new clan's game", async () => {
    const { prisma, service } = createService();
    prisma.clanMember.findFirst.mockResolvedValue(null);
    prisma.clan.findFirst.mockResolvedValue(null);
    prisma.clan.create.mockResolvedValue({ id: "pubg-clan" });

    await service.createClan("owner-1", {
      gameTitle: GameTitle.PUBG,
      name: "PUBG Clan",
      tag: "PUBG",
      isRecruiting: true,
    });

    expect(prisma.clanMember.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "owner-1",
        clan: { gameTitle: GameTitle.PUBG },
      },
    });
    expect(prisma.clan.findFirst).toHaveBeenCalledWith({
      where: { gameTitle: GameTitle.PUBG, tag: "PUBG" },
    });
    expect(prisma.clan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ gameTitle: GameTitle.PUBG }),
      }),
    );
  });
});
