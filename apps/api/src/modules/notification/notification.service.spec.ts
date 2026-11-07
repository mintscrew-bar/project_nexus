import {
  FRIENDS_PANEL_NOTIFICATION_TYPES,
  NotificationService,
  POPUP_NOTICE_DATA,
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

describe("NotificationService 모달 공지", () => {
  it("읽지 않은 운영자 공지 중 popup 표시된 것만, 오래된 것부터 돌려준다", async () => {
    const rows = [
      { id: "new", title: "b", message: "m", link: null, createdAt: 2 },
      { id: "old", title: "a", message: "m", link: null, createdAt: 1 },
    ];
    const prisma = {
      notification: { findMany: jest.fn().mockResolvedValue([...rows]) },
    } as any;
    const service = new NotificationService(prisma, {} as any);

    const popups = await service.getPendingPopups("user-1");

    const query = prisma.notification.findMany.mock.calls[0][0];
    expect(query.where).toEqual({
      userId: "user-1",
      type: "SYSTEM",
      isRead: false,
      data: { path: ["popup"], equals: true },
    });
    // 최근 것부터 잘라 온 뒤 순서를 뒤집어, 화면에는 먼저 온 공지가 먼저 뜬다
    expect(query.orderBy).toEqual({ createdAt: "desc" });
    expect(popups.map((p: any) => p.id)).toEqual(["old", "new"]);
    expect(POPUP_NOTICE_DATA).toEqual({ popup: true });
  });
});
