import { Test, TestingModule } from "@nestjs/testing";
import {
  ServiceUnavailableException,
  BadRequestException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RoomService } from "./room.service";
import { PrismaService } from "../prisma/prisma.service";
import { ShutdownService } from "../common/shutdown.service";
import { TeamMode } from "@nexus/database";

describe("RoomService", () => {
  let service: RoomService;
  let prisma: any;
  let shutdownService: any;

  const baseDto = {
    name: "테스트 방",
    maxParticipants: 10,
    teamMode: TeamMode.AUCTION,
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      authProvider: { findFirst: jest.fn() },
      riotAccount: { findFirst: jest.fn() },
      discordGuildLink: { findFirst: jest.fn().mockResolvedValue(null) },
      room: { create: jest.fn() },
    };

    shutdownService = {
      isShuttingDown: jest.fn().mockReturnValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: ShutdownService, useValue: shutdownService },
      ],
    }).compile();

    service = module.get<RoomService>(RoomService);
  });

  // ============================================================
  // createRoom — Graceful Shutdown 가드
  // ============================================================
  describe("createRoom — shutdown 가드", () => {
    it("서버 종료 중이면 ServiceUnavailableException을 던진다", async () => {
      shutdownService.isShuttingDown.mockReturnValue(true);

      await expect(service.createRoom("host-1", baseDto)).rejects.toThrow(
        ServiceUnavailableException,
      );

      // 종료 중에는 DB 조회 없이 즉시 차단해야 한다
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("서버 정상 상태이면 shutdown 가드를 통과하여 이후 로직을 진행한다", async () => {
      shutdownService.isShuttingDown.mockReturnValue(false);
      // ADMIN 유저 → Discord/Riot 연동 면제
      prisma.user.findUnique.mockResolvedValue({ role: "ADMIN" });
      prisma.room.create.mockResolvedValue({ id: "room-1", name: "테스트 방" });

      // ServiceUnavailableException이 발생하지 않아야 함
      await expect(
        service.createRoom("host-admin", baseDto),
      ).resolves.toBeDefined();
    });
  });

  // ============================================================
  // createRoom — 계정 연동 검증
  // ============================================================
  describe("createRoom — 계정 연동 검증", () => {
    beforeEach(() => {
      shutdownService.isShuttingDown.mockReturnValue(false);
    });

    it("Discord 미연동 일반 유저는 BadRequestException을 던진다", async () => {
      prisma.user.findUnique.mockResolvedValue({ role: "USER" });
      prisma.authProvider.findFirst.mockResolvedValue(null); // Discord 미연동

      await expect(service.createRoom("host-1", baseDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("Riot 미연동 일반 유저는 BadRequestException을 던진다", async () => {
      prisma.user.findUnique.mockResolvedValue({ role: "USER" });
      prisma.authProvider.findFirst.mockResolvedValue({
        id: "discord-provider",
      }); // Discord 연동
      prisma.riotAccount.findFirst.mockResolvedValue(null); // Riot 미연동

      await expect(service.createRoom("host-1", baseDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("ADMIN은 Discord/Riot 연동 없이도 방을 생성할 수 있다", async () => {
      prisma.user.findUnique.mockResolvedValue({ role: "ADMIN" });
      prisma.room.create.mockResolvedValue({ id: "room-1", name: "테스트 방" });

      await expect(
        service.createRoom("host-admin", baseDto),
      ).resolves.toBeDefined();

      // ADMIN은 authProvider, riotAccount 조회 없이 바로 방 생성
      expect(prisma.authProvider.findFirst).not.toHaveBeenCalled();
      expect(prisma.riotAccount.findFirst).not.toHaveBeenCalled();
    });

    it("유효하지 않은 maxParticipants이면 BadRequestException을 던진다", async () => {
      prisma.user.findUnique.mockResolvedValue({ role: "ADMIN" });

      await expect(
        service.createRoom("host-admin", { ...baseDto, maxParticipants: 7 }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
