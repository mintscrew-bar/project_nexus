import { Test, TestingModule } from "@nestjs/testing";
import { SnakeDraftService } from "./snake-draft.service";
import { resolveLadderOrder } from "@nexus/types";
import { PrismaService } from "../prisma/prisma.service";
import { RoomStatus, TeamMode } from "@nexus/database";

describe("SnakeDraftService", () => {
  let service: SnakeDraftService;
  let prisma: any;
  let discordVoice: any;

  beforeEach(async () => {
    prisma = {
      room: {
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      team: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      roomParticipant: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      teamMember: {
        create: jest.fn(),
      },
      snakeDraftPick: {
        create: jest.fn(),
      },
      authProvider: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(prisma)),
    };
    discordVoice = {
      assignCaptainRole: jest.fn(),
      renameTeamChannels: jest.fn(),
      handleTeamAssignment: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SnakeDraftService,
        { provide: PrismaService, useValue: prisma },
        { provide: "DISCORD_VOICE_SERVICE", useValue: discordVoice },
      ],
    }).compile();

    service = module.get<SnakeDraftService>(SnakeDraftService);
  });

  describe("generatePickOrder (순환형 스네이크 공정성 검증)", () => {
    it("2팀일 때 표준 스네이크와 동일하게 동작한다 (1-2-2-1 반복)", () => {
      const teamIds = ["T1", "T2"];
      const order = (service as any).generatePickOrder(teamIds, 2, 5);

      // R0 (start T1): T1, T2
      // R1 (start T2): T2, T1 -> T2 더블
      // R2 (start T1): T1, T2 -> T1 더블
      // R3 (start T2): T2, T1 -> T2 더블
      expect(order.slice(0, 8)).toEqual([
        "T1",
        "T2",
        "T2",
        "T1",
        "T1",
        "T2",
        "T2",
        "T1",
      ]);
    });

    it("3팀일 때 12픽 내에서 모든 팀(T1, T2, T3)이 정확히 한 번씩 연속 픽을 갖는다", () => {
      const teamIds = ["T1", "T2", "T3"];
      const order = (service as any).generatePickOrder(teamIds, 3, 5);

      // R0 (start T1): T1, T2, T3
      // R1 (start T3): T3, T1, T2 (T3 더블: index 2, 3)
      // R2 (start T2): T2, T3, T1 (T2 더블: index 5, 6)
      // R3 (start T1): T1, T2, T3 (T1 더블: index 8, 9)

      const expected = [
        "T1",
        "T2",
        "T3", // R0
        "T3",
        "T1",
        "T2", // R1 (T3 연속)
        "T2",
        "T3",
        "T1", // R2 (T2 연속)
        "T1",
        "T2",
        "T3", // R3 (T1 연속)
      ];

      expect(order.slice(0, 12)).toEqual(expected);

      // 연속 픽 지점 검증
      expect(order[2]).toBe(order[3]); // T3 연속 (3, 4번째 픽)
      expect(order[5]).toBe(order[6]); // T2 연속 (6, 7번째 픽)
      expect(order[8]).toBe(order[9]); // T1 연속 (9, 10번째 픽)
    });
  });

  describe("startSnakeDraft", () => {
    const hostId = "host-1";
    const roomId = "room-1";

    it("정상 시작 시 팀을 생성하고 순환형 스네이크 순서를 생성한다", async () => {
      const players = new Array(10).fill(0).map((_, i) => ({
        id: `p${i}`,
        userId: `u${i}`,
        role: "PLAYER",
        user: {
          username: `user${i}`,
          riotAccounts: [{ isPrimary: true, mainRole: "TOP" }],
        },
      }));

      prisma.room.findUnique.mockResolvedValue({
        id: roomId,
        hostId,
        status: RoomStatus.WAITING,
        teamMode: TeamMode.SNAKE_DRAFT,
        participants: players,
        teams: [],
        captainSelection: "RANDOM",
      });

      prisma.team.create.mockImplementation((args: any) => ({
        id: `team-${args.data.captainId}`,
        captainId: args.data.captainId,
        name: args.data.name,
      }));

      const result = await service.startSnakeDraft(hostId, roomId);

      expect(result.teams).toHaveLength(2);
      expect(result.pickOrder).toHaveLength(8);

      // 픽 순서는 주장 선발과 따로 추첨한다(Task 27). 어느 팀이 먼저 뽑는지는
      // 매번 달라지므로 팀 순서를 못박지 않고 **스네이크 모양**을 검증한다.
      const first = result.pickOrder[0];
      const second = result.pickOrder[1];
      expect(first).not.toBe(second);
      expect(new Set(result.pickOrder)).toEqual(
        new Set(result.teams.map((team: any) => team.id)),
      );
      // R0: A B / R1: B A / R2: A B / R3: B A — 라운드 경계에서 같은 팀이 연속으로 뽑는다
      expect(result.pickOrder.slice(0, 8)).toEqual([
        first,
        second,
        second,
        first,
        first,
        second,
        second,
        first,
      ]);
      // 두 팀이 정확히 4픽씩 가져간다.
      expect(
        result.pickOrder.filter((id: string) => id === first),
      ).toHaveLength(4);

      // 픽 순서 추첨을 사다리로 보여준다. 사다리를 타고 내려간 결과가
      // 실제 첫 픽 순서와 어긋나면 연출이 거짓말을 하는 셈이다.
      const ladder = result.draftState.ladder;
      expect(ladder).toBeDefined();
      expect(resolveLadderOrder(ladder!)).toEqual([first, second]);
      expect(new Set(ladder!.columns)).toEqual(
        new Set(result.teams.map((team: any) => team.id)),
      );
      expect(discordVoice.renameTeamChannels).toHaveBeenCalledWith(
        roomId,
        result.teams.map((team: any) => ({ id: team.id, name: team.name })),
      );
    });
  });
});

describe("팀 인원과 픽 순서 추첨", () => {
  const service = new SnakeDraftService({} as any, {} as any);

  it("배그 4인 스쿼드는 팀당 3픽 — 롤보다 한 번 적다", () => {
    // 캡틴을 뺀 나머지가 픽 대상이다. 5인 하드코딩을 그대로 두면
    // 4인 스쿼드에서 있지도 않은 4번째 자리를 뽑는다.
    const lol = (service as any).generatePickOrder(["T1", "T2"], 2, 5);
    const pubg = (service as any).generatePickOrder(["T1", "T2"], 2, 4);
    expect(lol).toHaveLength(8); // 4픽 × 2팀
    expect(pubg).toHaveLength(6); // 3픽 × 2팀
  });

  it("픽 순서 추첨은 주장 순서를 그대로 쓰지 않는다", () => {
    // 티어 우선으로 주장을 뽑으면 가장 센 주장이 첫 픽까지 가져가 이점이 두 번 쌓인다.
    // 셔플이 실제로 섞는지(항등 순열만 나오지 않는지) 확인한다.
    const teamIds = Array.from({ length: 8 }, (_, i) => `T${i + 1}`);
    const shuffles = new Set(
      Array.from({ length: 20 }, () =>
        (service as any).shuffle(teamIds).join(","),
      ),
    );
    expect(shuffles.size).toBeGreaterThan(1);
  });

  it("셔플은 원소를 잃거나 만들지 않는다", () => {
    const teamIds = ["A", "B", "C", "D", "E"];
    const shuffled = (service as any).shuffle(teamIds);
    expect([...shuffled].sort()).toEqual([...teamIds].sort());
    expect(teamIds).toEqual(["A", "B", "C", "D", "E"]);
  });
});
