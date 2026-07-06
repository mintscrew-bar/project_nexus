import { createHash } from "crypto";
import { RoomStatus } from "@nexus/database";
import { PrismaService } from "../prisma/prisma.service";

/**
 * 방송 토큰(원문) → SHA-256 hash. 저장/조회 공통.
 */
export function hashBroadcastToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * 스트리머가 지금 송출 중인 방 id를 해석한다.
 * 1) 수동 오버라이드(broadcastLiveRoomId)가 여전히 내 방이고 종료 전이면 그 방
 * 2) 아니면 내가 호스트인 가장 최근 활성(미종료) 방
 * 활성 방이 없으면(대기 상태) null.
 */
export async function activeRoomIdForUser(
  prisma: PrismaService,
  userId: string,
  liveRoomId: string | null,
): Promise<string | null> {
  if (liveRoomId) {
    const override = await prisma.room.findFirst({
      where: {
        id: liveRoomId,
        hostId: userId,
        status: { not: RoomStatus.COMPLETED },
      },
      select: { id: true },
    });
    if (override) return override.id;
  }

  const latest = await prisma.room.findFirst({
    where: { hostId: userId, status: { not: RoomStatus.COMPLETED } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return latest?.id ?? null;
}

/**
 * 방송 토큰(원문) → 현재 송출 중인 방 id. 토큰이 유효하지 않거나 활성 방이 없으면 null.
 * (소켓 인증처럼 방 id만 필요할 때 사용)
 */
export async function resolveBroadcastRoomId(
  prisma: PrismaService,
  token: string,
): Promise<string | null> {
  if (!token) return null;
  const user = await prisma.user.findUnique({
    where: { broadcastTokenHash: hashBroadcastToken(token) },
    select: { id: true, broadcastLiveRoomId: true },
  });
  if (!user) return null;
  return activeRoomIdForUser(prisma, user.id, user.broadcastLiveRoomId);
}
