import { Logger } from "@nestjs/common";
import { PrismaClient } from "@nexus/database";
import { isTestBotUser } from "./test-bot.util";

const logger = new Logger("RoomOutcome");

/**
 * 방이 지워지기 직전에 결과 한 줄을 남긴다 (`RoomOutcome`).
 *
 * 방은 끝나거나 비면 지워져서 나중에는 "몇 개가 만들어져 몇 개가 시작됐나"를
 * 알 수 없다. 방이 지워지는 길이 여럿이라(방 서비스, 경매, 드래프트) 호출부가
 * 이 함수 하나를 부른다.
 *
 * **기록 실패가 방 삭제를 막으면 안 된다.** 분석용 부가 기록이다. 삭제가 두 번
 * 불려도 `roomId` 가 유일해 한 줄만 남는다.
 */
export async function recordRoomOutcome(
  prisma: Pick<PrismaClient, "room" | "roomOutcome">,
  roomId: string,
): Promise<void> {
  try {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      select: {
        gameTitle: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        status: true,
        maxParticipants: true,
        isPrivate: true,
        scheduledAt: true,
        host: {
          select: {
            username: true,
            email: true,
            riotAccounts: { select: { puuid: true, tagLine: true } },
          },
        },
        participants: {
          select: {
            user: {
              select: {
                username: true,
                email: true,
                riotAccounts: { select: { puuid: true, tagLine: true } },
              },
            },
          },
        },
        matches: {
          where: { status: "COMPLETED" },
          select: { id: true },
          take: 1,
        },
        scrim: {
          select: {
            rounds: {
              where: { status: "COMPLETED" },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });
    if (!room) return;

    const participantCount = room.participants.length;
    const humanCount = room.participants.filter(
      (p) => !isTestBotUser(p.user),
    ).length;

    await prisma.roomOutcome.upsert({
      where: { roomId },
      update: {},
      create: {
        roomId,
        gameTitle: room.gameTitle,
        createdAt: room.createdAt,
        startedAt: room.startedAt,
        completedAt: room.completedAt,
        finalStatus: room.status,
        maxParticipants: room.maxParticipants,
        participantCount,
        humanCount,
        hostIsBot: isTestBotUser(room.host),
        isPrivate: room.isPrivate,
        scheduled: room.scheduledAt !== null,
        hadResult:
          room.matches.length > 0 || (room.scrim?.rounds.length ?? 0) > 0,
      },
    });
  } catch (error) {
    logger.warn(`방 결과 기록 실패 (${roomId}): ${(error as Error).message}`);
  }
}
