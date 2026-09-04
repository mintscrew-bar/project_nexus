import { pubgRoomTitle, type PubgPlatform } from "@nexus/types";

/**
 * 화면·공지에 보여줄 방 제목.
 *
 * DB 에는 방장이 적은 원본만 저장한다. 플랫폼 태그(`[스배]`)를 저장해 두면
 * 제목을 고칠 때마다 겹쳐 붙거나 사라져서, 보여줄 때 붙인다.
 * 카드처럼 배지를 따로 그릴 수 있는 자리에서는 원본 이름을 쓰면 된다.
 */
export function roomDisplayName(room: {
  name: string;
  gameTitle?: string | null;
  pubgPlatform?: PubgPlatform | string | null;
}): string {
  if (room.gameTitle !== "PUBG") return room.name;
  return pubgRoomTitle(room.name, (room.pubgPlatform as PubgPlatform) ?? null);
}
