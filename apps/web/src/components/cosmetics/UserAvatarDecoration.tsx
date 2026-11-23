"use client";

import type { ReactNode } from "react";
import { AvatarDecoration } from "./avatar-effects";
import { findCosmetic, useCosmeticCatalog } from "./catalog";
import { useUserLoadout } from "./useCosmeticLoadouts";

/**
 * 그 사람이 장착한 아바타 장식을 입혀 아바타를 그린다(프로필·랭킹·채팅·친구창).
 * 장착한 게 없으면 children 을 그대로 둔다.
 */
export function UserAvatarDecoration({
  userId,
  size,
  children,
}: {
  userId: string | null | undefined;
  /** 장식 기준 지름(px) — 아바타는 이 상자 가운데에 놓인다 */
  size: number;
  children: ReactNode;
}) {
  // 관리자가 추가한 상품의 그림 정의가 들어오면 다시 그린다
  useCosmeticCatalog();
  // 채팅·친구창처럼 여러 줄이 한꺼번에 그려져도 장착 조회는 한 번으로 묶인다
  const loadout = useUserLoadout(userId);
  const code = userId
    ? findCosmetic(loadout.AVATAR_FRAME)?.avatarEffect
    : undefined;
  return (
    <AvatarDecoration code={code} size={size}>
      {children}
    </AvatarDecoration>
  );
}
