import {
  FRIENDS_PANEL_NOTIFICATION_TYPES,
  NotificationService,
} from "./notification.service";

/**
 * 알림(종)에는 커뮤니티·방송·경기·관리자 메시지만 나온다. 친구·클랜 관련은
 * 친구창이 맡으므로, 예전에 쌓인 기록도 목록과 안 읽은 개수에서 뺀다.
 */
describe("NotificationService 알림 범위", () => {
  const setup = () => {
    const prisma = {
      notification: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    } as any;
    return { prisma, service: new NotificationService(prisma, {} as any) };
  };

  it("친구·클랜 종류를 목록에서 뺀다", async () => {
    const { prisma, service } = setup();
    await service.getByUserId("user-1");
    expect(prisma.notification.findMany.mock.calls[0][0].where).toEqual({
      userId: "user-1",
      type: { notIn: FRIENDS_PANEL_NOTIFICATION_TYPES },
    });
  });

  it("친구·클랜 종류는 안 읽은 개수에도 넣지 않는다", async () => {
    const { prisma, service } = setup();
    await service.getUnreadCount("user-1");
    expect(prisma.notification.count.mock.calls[0][0].where).toMatchObject({
      isRead: false,
      type: { notIn: FRIENDS_PANEL_NOTIFICATION_TYPES },
    });
  });

  it("친구·클랜 관련 종류를 모두 포함하고, 알림에 남길 종류는 넣지 않는다", () => {
    expect(FRIENDS_PANEL_NOTIFICATION_TYPES).toEqual(
      expect.arrayContaining([
        "FRIEND_REQUEST",
        "FRIEND_ACCEPTED",
        "CLAN_INVITE",
        "CLAN_JOIN_REQUEST",
        "CLAN_JOIN_APPROVED",
      ]),
    );
    for (const kept of ["MATCH_RESULT", "COMMENT", "STREAMER_LIVE", "SYSTEM"]) {
      expect(FRIENDS_PANEL_NOTIFICATION_TYPES).not.toContain(kept);
    }
  });
});
