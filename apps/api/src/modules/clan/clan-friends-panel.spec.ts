import { ClanRole } from "@nexus/database";
import { ClanService } from "./clan.service";

/**
 * 친구창의 "클랜 가입 요청" — 내가 관리하는 클랜들에 들어온 요청을 한 번에 모은다.
 * 운영진 권한은 클랜 설정(officerCanManageInvitations)을 따른다.
 */
describe("ClanService.getManagedJoinRequests", () => {
  const setup = (
    memberships: Array<{ clanId: string; role: ClanRole }>,
    officerCanManageInvitations: Record<string, boolean>,
  ) => {
    const prisma = {
      clanMember: { findMany: jest.fn().mockResolvedValue(memberships) },
      clanInvitation: { findMany: jest.fn().mockResolvedValue([]) },
      // getOfficerPermissions 는 원시 쿼리로 클랜 설정을 읽는다.
      $queryRaw: jest.fn(async (query: any) => {
        const clanId = query.values[0];
        return [
          {
            officerCanManageSettings: false,
            officerCanManageMembers: false,
            officerCanManageAnnouncements: false,
            officerCanManageInvitations:
              officerCanManageInvitations[clanId] ?? false,
          },
        ];
      }),
    } as any;
    return { prisma, service: new ClanService(prisma, {} as any) };
  };

  it("오너인 클랜과 초대 관리 권한이 있는 운영진 클랜의 요청을 모은다", async () => {
    const { prisma, service } = setup(
      [
        { clanId: "lol-clan", role: ClanRole.OWNER },
        { clanId: "pubg-clan", role: ClanRole.OFFICER },
      ],
      { "pubg-clan": true },
    );

    await service.getManagedJoinRequests("user-1");

    const where = prisma.clanInvitation.findMany.mock.calls[0][0].where;
    expect(where.clanId.in).toEqual(["lol-clan", "pubg-clan"]);
    expect(where.type).toBe("JOIN_REQUEST");
    expect(where.status).toBe("PENDING");
  });

  it("초대 관리 권한이 없는 운영진 클랜은 뺀다", async () => {
    const { prisma, service } = setup(
      [
        { clanId: "lol-clan", role: ClanRole.OWNER },
        { clanId: "pubg-clan", role: ClanRole.OFFICER },
      ],
      { "pubg-clan": false },
    );

    await service.getManagedJoinRequests("user-1");

    expect(
      prisma.clanInvitation.findMany.mock.calls[0][0].where.clanId.in,
    ).toEqual(["lol-clan"]);
  });

  it("관리하는 클랜이 없으면 조회하지 않고 빈 목록을 준다", async () => {
    const { prisma, service } = setup([], {});

    await expect(service.getManagedJoinRequests("user-1")).resolves.toEqual([]);
    expect(prisma.clanInvitation.findMany).not.toHaveBeenCalled();
  });
});
