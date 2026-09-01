import { Logger } from "@nestjs/common";
import { DiscordScheduleService } from "./discord-schedule.service";

const NOW = new Date("2026-09-01T12:00:00.000Z");

/** NOW 기준 n분 뒤 시각 */
function minutesFromNow(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * 60_000);
}

function createHarness(room: Record<string, unknown>) {
  const prisma = {
    room: {
      findMany: jest.fn().mockResolvedValue([room]),
      update: jest.fn().mockResolvedValue({}),
    },
    roomParticipant: {
      findMany: jest.fn().mockResolvedValue([
        { user: { authProviders: [{ providerId: "discord-1" }] } },
        { user: { authProviders: [] } }, // 디스코드 미연동 참가자
      ]),
    },
    roomDiscordChannel: {
      findFirst: jest.fn().mockResolvedValue({ channelId: "lobby-voice" }),
    },
  };
  const botService = {
    sendRoomScheduleReminder: jest.fn().mockResolvedValue(1),
    sendDirectMessages: jest.fn().mockResolvedValue(1),
    updateRoomNotification: jest.fn().mockResolvedValue(undefined),
    closeRoomRecruitMessages: jest.fn().mockResolvedValue(1),
  };
  const voiceService = {
    createRoomChannels: jest.fn().mockResolvedValue({
      categoryId: "category-1",
      teamChannels: [],
      lobbyChannelId: "lobby-voice",
    }),
    deleteRoomChannels: jest.fn().mockResolvedValue(undefined),
  };
  const configService = {
    get: jest.fn().mockReturnValue("https://nexus.test"),
  };

  const service = new DiscordScheduleService(
    prisma as any,
    configService as any,
    botService as any,
    voiceService as any,
  );
  return { service, prisma, botService, voiceService };
}

/** 예약 방 기본값. 개설은 6시간 전에 했고 알림은 아직 하나도 안 나갔다. */
function scheduledRoom(overrides: Record<string, unknown> = {}) {
  return {
    id: "room-1",
    name: "9월 1일 내전",
    maxParticipants: 10,
    scheduledAt: minutesFromNow(60),
    createdAt: new Date(NOW.getTime() - 6 * 60 * 60_000),
    discordGuildId: "guild-1",
    discordCategoryId: null,
    scheduledRemind1hAt: null,
    scheduledRemind10mAt: null,
    scheduledStartNotifiedAt: null,
    ...overrides,
  };
}

describe("DiscordScheduleService.processScheduledRooms", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("1시간 전이면 리마인드를 보내고 발송 시각을 남긴다", async () => {
    const { service, prisma, botService } = createHarness(scheduledRoom());

    await service.processScheduledRooms();

    expect(botService.sendRoomScheduleReminder).toHaveBeenCalledWith(
      "room-1",
      "1h",
    );
    expect(prisma.room.update).toHaveBeenCalledWith({
      where: { id: "room-1" },
      data: { scheduledRemind1hAt: NOW },
    });
  });

  it("이미 보낸 리마인드는 다시 보내지 않는다", async () => {
    const { service, botService } = createHarness(
      scheduledRoom({ scheduledRemind1hAt: new Date(NOW.getTime() - 60_000) }),
    );

    await service.processScheduledRooms();

    expect(botService.sendRoomScheduleReminder).not.toHaveBeenCalled();
  });

  it("리드타임이 짧은 방에는 1시간 전 리마인드를 보내지 않는다", async () => {
    // 30분 뒤 시작으로 방금 만든 방 — 모집 공지 바로 밑에 같은 말을 또 붙일 뿐이다.
    const { service, botService } = createHarness(
      scheduledRoom({
        scheduledAt: minutesFromNow(30),
        createdAt: new Date(NOW.getTime() - 60_000),
      }),
    );

    await service.processScheduledRooms();

    expect(botService.sendRoomScheduleReminder).not.toHaveBeenCalled();
  });

  it("10분 전이면 음성채널을 만들고 공지를 갱신한 뒤 리마인드한다", async () => {
    const { service, prisma, botService, voiceService } = createHarness(
      scheduledRoom({ scheduledAt: minutesFromNow(8) }),
    );

    await service.processScheduledRooms();

    expect(voiceService.createRoomChannels).toHaveBeenCalledWith(
      "room-1",
      "9월 1일 내전",
      2,
    );
    expect(prisma.room.update).toHaveBeenCalledWith({
      where: { id: "room-1" },
      data: { discordCategoryId: "category-1" },
    });
    expect(botService.updateRoomNotification).toHaveBeenCalledWith("room-1");
    expect(botService.sendRoomScheduleReminder).toHaveBeenCalledWith(
      "room-1",
      "10m",
    );
  });

  it("음성채널이 이미 있으면 다시 만들지 않는다", async () => {
    const { service, voiceService, botService } = createHarness(
      scheduledRoom({
        scheduledAt: minutesFromNow(8),
        discordCategoryId: "category-existing",
      }),
    );

    await service.processScheduledRooms();

    expect(voiceService.createRoomChannels).not.toHaveBeenCalled();
    expect(botService.sendRoomScheduleReminder).toHaveBeenCalledWith(
      "room-1",
      "10m",
    );
  });

  it("음성채널 생성이 실패해도 리마인드는 나간다", async () => {
    const { service, voiceService, botService } = createHarness(
      scheduledRoom({ scheduledAt: minutesFromNow(8) }),
    );
    voiceService.createRoomChannels.mockRejectedValue(new Error("권한 없음"));

    await service.processScheduledRooms();

    expect(botService.sendRoomScheduleReminder).toHaveBeenCalledWith(
      "room-1",
      "10m",
    );
  });

  it("예정 시각이 되면 디스코드 연동된 참가자에게만 DM을 보낸다", async () => {
    const { service, prisma, botService } = createHarness(
      scheduledRoom({
        scheduledAt: new Date(NOW.getTime() - 30_000),
        scheduledRemind1hAt: NOW,
        scheduledRemind10mAt: NOW,
      }),
    );

    await service.processScheduledRooms();

    expect(botService.sendDirectMessages).toHaveBeenCalledTimes(1);
    const [recipients, content] = botService.sendDirectMessages.mock.calls[0];
    expect(recipients).toEqual(["discord-1"]);
    expect(content).toContain("9월 1일 내전");
    expect(content).toContain("https://nexus.test/tournaments/room-1/lobby");
    expect(content).toContain(
      "https://discord.com/channels/guild-1/lobby-voice",
    );
    expect(prisma.room.update).toHaveBeenCalledWith({
      where: { id: "room-1" },
      data: { scheduledStartNotifiedAt: NOW },
    });
  });

  it("한 방의 실패가 다음 방 처리를 막지 않는다", async () => {
    const { service, prisma, botService } = createHarness(scheduledRoom());
    prisma.room.findMany.mockResolvedValue([
      scheduledRoom({ id: "room-broken" }),
      scheduledRoom({ id: "room-ok" }),
    ]);
    prisma.room.update.mockImplementation(async ({ where }: any) => {
      if (where.id === "room-broken") throw new Error("DB 오류");
      return {};
    });

    await service.processScheduledRooms();

    expect(botService.sendRoomScheduleReminder).toHaveBeenCalledTimes(1);
    expect(botService.sendRoomScheduleReminder).toHaveBeenCalledWith(
      "room-ok",
      "1h",
    );
  });
});

/** 식은 방 기본값. 정원 10명에 3명만 모였고 음성채널은 이미 만들어져 있다. */
function staleRoom(overrides: Record<string, unknown> = {}) {
  return {
    id: "room-1",
    name: "9월 1일 내전",
    maxParticipants: 10,
    discordCategoryId: "category-1",
    host: { authProviders: [{ providerId: "host-discord" }] },
    participants: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
    ...overrides,
  };
}

describe("DiscordScheduleService.closeStaleRecruitments", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("정원 미달이면 공지를 닫고 음성채널을 정리한 뒤 호스트에게 DM한다", async () => {
    const { service, prisma, botService, voiceService } = createHarness(
      staleRoom(),
    );

    await service.closeStaleRecruitments();

    expect(prisma.room.update).toHaveBeenCalledWith({
      where: { id: "room-1" },
      data: { recruitClosedAt: NOW },
    });
    expect(botService.closeRoomRecruitMessages).toHaveBeenCalledWith("room-1");
    expect(voiceService.deleteRoomChannels).toHaveBeenCalledWith("room-1");

    const [recipients, content] = botService.sendDirectMessages.mock.calls[0];
    expect(recipients).toEqual(["host-discord"]);
    expect(content).toContain("9월 1일 내전");
    expect(content).toContain("/nexus schedule");
    // 방은 남는다 — 로비 링크를 함께 준다.
    expect(content).toContain("https://nexus.test/tournaments/room-1/lobby");
  });

  it("정원을 채운 방은 건드리지 않는다", async () => {
    const { service, prisma, botService } = createHarness(
      staleRoom({
        participants: Array.from({ length: 10 }, (_, index) => ({
          id: `p${index}`,
        })),
      }),
    );

    await service.closeStaleRecruitments();

    expect(prisma.room.update).not.toHaveBeenCalled();
    expect(botService.closeRoomRecruitMessages).not.toHaveBeenCalled();
  });

  it("음성채널이 없으면 삭제를 시도하지 않는다", async () => {
    const { service, voiceService, botService } = createHarness(
      staleRoom({ discordCategoryId: null }),
    );

    await service.closeStaleRecruitments();

    expect(voiceService.deleteRoomChannels).not.toHaveBeenCalled();
    expect(botService.closeRoomRecruitMessages).toHaveBeenCalledWith("room-1");
  });

  it("음성채널 정리가 실패해도 호스트 DM은 나간다", async () => {
    const { service, voiceService, botService } = createHarness(staleRoom());
    voiceService.deleteRoomChannels.mockRejectedValue(new Error("권한 없음"));

    await service.closeStaleRecruitments();

    expect(botService.sendDirectMessages).toHaveBeenCalledTimes(1);
  });

  it("호스트가 디스코드 미연동이면 DM을 건너뛴다", async () => {
    const { service, botService } = createHarness(
      staleRoom({ host: { authProviders: [] } }),
    );

    await service.closeStaleRecruitments();

    expect(botService.closeRoomRecruitMessages).toHaveBeenCalledWith("room-1");
    expect(botService.sendDirectMessages).not.toHaveBeenCalled();
  });
});
