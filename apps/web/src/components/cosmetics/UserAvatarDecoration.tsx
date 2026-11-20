"use client";

import type { ReactNode } from "react";
import { AvatarDecoration } from "./avatar-effects";
import { findCosmetic, useCosmeticCatalog } from "./catalog";
import { useCosmeticLoadouts } from "./useCosmeticLoadouts";

/**
 * 그 사람이 장착한 아바타 장식을 입혀 아바타를 그린다(프로필 등).
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
  const loadouts = useCosmeticLoadouts([userId]);
  const code = userId
    ? findCosmetic(loadouts[userId]?.AVATAR_FRAME)?.avatarEffect
    : undefined;
  return (
    <AvatarDecoration code={code} size={size}>
      {children}
    </AvatarDecoration>
  );
}
