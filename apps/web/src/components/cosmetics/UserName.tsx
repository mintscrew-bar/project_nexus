"use client";

import type { ReactNode } from "react";
import { findCosmetic } from "./catalog";
import { StyledName } from "./name-styles";
import { useUserLoadout } from "./useCosmeticLoadouts";

/**
 * 그 사람이 장착한 닉네임 글꼴로 이름을 그린다 (Task 22).
 * 로비·호버·프로필·채팅·대진표·경매·결과창이 같이 쓴다.
 *
 * - `styleCode` 를 넘기면(로비처럼 장착 상태를 이미 모아 읽은 곳) 따로 묻지 않는다.
 * - 안 넘기면 userId 로 장착 상태를 읽는다. 같은 순간의 요청은 한 번으로 묶인다.
 * - 장착한 글꼴이 없으면 원래 글자 그대로 둔다(바깥 굵기·색을 물려받는다).
 */
export function UserName({
  userId,
  styleCode,
  className,
  children,
}: {
  userId?: string | null;
  /** 이미 아는 NAME_STYLE 상품 코드 — 있으면 userId 로 묻지 않는다 */
  styleCode?: string | null;
  className?: string;
  children: ReactNode;
}) {
  const loadout = useUserLoadout(styleCode === undefined ? userId : null);
  const code = styleCode === undefined ? loadout.NAME_STYLE : styleCode;
  return (
    <StyledName code={findCosmetic(code)?.nameStyle} className={className}>
      {children}
    </StyledName>
  );
}
