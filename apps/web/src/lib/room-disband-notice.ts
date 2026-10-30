import { toast } from "@/stores/toast-store";

/**
 * 방장 퇴장으로 방이 해산됐다는 안내 토스트.
 *
 * 로비에 있던 참가자는 같은 해산을 두 갈래로 듣는다 — 방 소켓의 room-disbanded 와
 * 알림 소켓의 해산 알림. 어느 쪽이 먼저 오든 토스트는 한 번만 띄운다.
 */
const announcedRoomIds = new Set<string>();

export const ROOM_DISBANDED_MESSAGE = "방장이 나가서 방이 해산되었습니다.";

export function announceRoomDisbanded(
  roomId: string,
  message: string = ROOM_DISBANDED_MESSAGE,
) {
  if (announcedRoomIds.has(roomId)) return;
  announcedRoomIds.add(roomId);
  toast.warning(message);
}
