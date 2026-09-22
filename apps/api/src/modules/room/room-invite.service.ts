import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { FriendshipStatus, RoomStatus } from "@nexus/database";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { NotificationGateway } from "../notification/notification.gateway";
import { roomDisplayName } from "../../common/utils/room-title.util";

/**
 * 초대가 살아 있는 시간(초). 대기방은 길어야 수십 분이라, 그보다 오래된
 * 초대는 "지금 같이 하자"는 의미를 잃는다.
 */
export const ROOM_INVITE_TTL_SECONDS = 30 * 60;

/** 같은 방에서 같은 친구를 다시 부르기까지(초). 연타로 팝업이 계속 뜨는 걸 막는다. */
export const ROOM_INVITE_COOLDOWN_SECONDS = 30;

/**
 * 받은 초대 보관 위치 — 받는 사람마다 해시 하나, 필드는 방 id.
 * 방 하나에는 초대가 하나만 남는다(다른 사람이 또 부르면 초대한 사람만 바뀐다).
 * 키 수명은 쓸 때마다 늘리고, 필드별 만료는 값의 expiresAt 으로 따진다.
 */
export const roomInviteKey = (inviteeId: string) => `room-invites:${inviteeId}`;

interface StoredRoomInvite {
  roomId: string;
  inviterId: string;
  createdAt: string;
  expiresAt: string;
}

/** 초대받은 사람 화면(팝업·친구창 대기 탭)에 보여줄 내용 */
export interface RoomInvitePayload {
  roomId: string;
  roomName: string;
  gameTitle: "LOL" | "PUBG";
  /** 참가 인원 / 정원 — 팝업에 "7/10" 으로 보여준다 */
  playerCount: number;
  maxParticipants: number;
  inviter: { id: string; username: string; avatar: string | null };
  createdAt: string;
  expiresAt: string;
}

/** 저장된 값을 읽어 아직 유효한 초대만 돌려준다. 깨졌거나 만료됐으면 null. */
export function parseStoredInvite(
  raw: string | null,
  now = Date.now(),
): StoredRoomInvite | null {
  if (!raw) return null;
  try {
    const invite = JSON.parse(raw) as StoredRoomInvite;
    if (!invite?.roomId || !invite.expiresAt) return null;
    return new Date(invite.expiresAt).getTime() > now ? invite : null;
  } catch {
    return null;
  }
}

/**
 * 친구를 내전 방에 초대한다.
 *
 * 예전 "내전 초대하기"는 방 링크를 클립보드에 복사할 뿐이라 친구에게는 아무것도
 * 가지 않았다. 이제 받은 친구 화면에 팝업이 뜨고, 놓치면 친구창 "대기" 탭에
 * 남는다. 알림(종)에는 쌓지 않는다 — 친구·클랜 관련은 친구창이 맡는다
 * (운영자 결정, 2026-09-22).
 *
 * - 방 참가자(관전자 포함)라면 누구나 자기 친구를 부를 수 있다.
 * - 유효한 초대가 있으면 비공개 방 비밀번호를 묻지 않는다(RoomService.joinRoom).
 * - 전달은 알림 소켓으로 한다. 방 소켓은 로비에 있는 사람만 붙어 있다.
 */
@Injectable()
export class RoomInviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  async invite(inviterId: string, roomId: string, friendId: string) {
    if (inviterId === friendId) {
      throw new BadRequestException("자기 자신은 초대할 수 없습니다.");
    }

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        name: true,
        gameTitle: true,
        pubgPlatform: true,
        status: true,
        maxParticipants: true,
        allowSpectators: true,
        participants: { select: { userId: true, role: true } },
      },
    });
    if (!room) throw new NotFoundException("방을 찾을 수 없습니다.");
    if (!room.participants.some((p) => p.userId === inviterId)) {
      throw new ForbiddenException("방에 참가한 사람만 초대할 수 있습니다.");
    }
    if (room.status !== RoomStatus.WAITING) {
      throw new BadRequestException("이미 시작한 방에는 초대할 수 없습니다.");
    }
    if (room.participants.some((p) => p.userId === friendId)) {
      throw new BadRequestException("이미 방에 있는 친구입니다.");
    }
    const playerCount = room.participants.filter(
      (p) => p.role === "PLAYER",
    ).length;
    // 관전 허용 방은 만석이어도 관전자로 들어올 수 있다(joinRoom 과 같은 기준).
    if (playerCount >= room.maxParticipants && room.allowSpectators === false) {
      throw new BadRequestException("방이 가득 찼습니다.");
    }

    // 수락된 친구만 부를 수 있다. 친구가 아닌 사람에게 팝업을 띄우는 통로가 되면 안 된다.
    const friendship = await this.prisma.friendship.findFirst({
      where: {
        status: FriendshipStatus.ACCEPTED,
        OR: [
          { userId: inviterId, friendId },
          { userId: friendId, friendId: inviterId },
        ],
      },
      select: { id: true },
    });
    if (!friendship) {
      throw new ForbiddenException("친구만 초대할 수 있습니다.");
    }

    // 같은 방·같은 친구 연타 방지. 첫 호출만 1을 받는다.
    const cooldownKey = `room-invite-cooldown:${roomId}:${friendId}`;
    const hits = await this.redis.incr(cooldownKey);
    if (hits === 1) {
      await this.redis.expire(cooldownKey, ROOM_INVITE_COOLDOWN_SECONDS);
    } else {
      throw new BadRequestException(
        "방금 초대를 보냈습니다. 잠시 후 다시 시도해주세요.",
      );
    }

    const now = new Date();
    const stored: StoredRoomInvite = {
      roomId,
      inviterId,
      createdAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + ROOM_INVITE_TTL_SECONDS * 1000,
      ).toISOString(),
    };
    const key = roomInviteKey(friendId);
    await this.redis.hset(key, roomId, JSON.stringify(stored));
    await this.redis.expire(key, ROOM_INVITE_TTL_SECONDS);

    const inviter = await this.prisma.user.findUnique({
      where: { id: inviterId },
      select: { id: true, username: true, avatar: true },
    });
    const payload: RoomInvitePayload = {
      roomId,
      roomName: roomDisplayName(room as any),
      gameTitle: room.gameTitle as "LOL" | "PUBG",
      playerCount,
      maxParticipants: room.maxParticipants,
      inviter: inviter ?? {
        id: inviterId,
        username: "알 수 없음",
        avatar: null,
      },
      createdAt: stored.createdAt,
      expiresAt: stored.expiresAt,
    };
    // 사이트를 안 보고 있으면 아무도 못 받는다. 초대는 남아 있어 돌아오면 대기 탭에서 본다.
    this.notificationGateway.sendRoomInvite(friendId, payload);

    return { success: true };
  }

  /**
   * 받은 초대 목록(친구창 대기 탭). 만료됐거나, 방이 사라졌거나 시작했거나,
   * 이미 들어가 있는 초대는 여기서 지운다.
   */
  async listReceived(userId: string): Promise<RoomInvitePayload[]> {
    const key = roomInviteKey(userId);
    const all = await this.redis.hgetall(key);
    const valid = new Map<string, StoredRoomInvite>();
    const stale: string[] = [];
    for (const [roomId, raw] of Object.entries(all)) {
      const invite = parseStoredInvite(raw);
      if (invite) valid.set(roomId, invite);
      else stale.push(roomId);
    }
    if (valid.size === 0) {
      await Promise.all(stale.map((roomId) => this.redis.hdel(key, roomId)));
      return [];
    }

    const rooms = await this.prisma.room.findMany({
      where: { id: { in: [...valid.keys()] } },
      select: {
        id: true,
        name: true,
        gameTitle: true,
        pubgPlatform: true,
        status: true,
        maxParticipants: true,
        participants: { select: { userId: true, role: true } },
      },
    });
    const inviters = await this.prisma.user.findMany({
      where: { id: { in: [...valid.values()].map((i) => i.inviterId) } },
      select: { id: true, username: true, avatar: true },
    });
    const inviterById = new Map(inviters.map((u) => [u.id, u]));
    const roomById = new Map(rooms.map((r) => [r.id, r]));

    const result: RoomInvitePayload[] = [];
    for (const [roomId, invite] of valid) {
      const room = roomById.get(roomId);
      const usable =
        room &&
        room.status === RoomStatus.WAITING &&
        !room.participants.some((p) => p.userId === userId);
      if (!usable) {
        stale.push(roomId);
        continue;
      }
      result.push({
        roomId,
        roomName: roomDisplayName(room as any),
        gameTitle: room.gameTitle as "LOL" | "PUBG",
        playerCount: room.participants.filter((p) => p.role === "PLAYER")
          .length,
        maxParticipants: room.maxParticipants,
        inviter: inviterById.get(invite.inviterId) ?? {
          id: invite.inviterId,
          username: "알 수 없음",
          avatar: null,
        },
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
      });
    }
    await Promise.all(stale.map((roomId) => this.redis.hdel(key, roomId)));

    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** 거절 — 초대를 지운다. 초대한 사람에게 따로 알리지 않는다. */
  async decline(userId: string, roomId: string) {
    await this.redis.hdel(roomInviteKey(userId), roomId);
    return { success: true };
  }
}
