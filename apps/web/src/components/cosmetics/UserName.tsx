"use client";

import type { ReactNode } from "react";
import type { NameTint } from "@nexus/types";
import { findCosmetic, useCosmeticCatalog } from "./catalog";
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
  tint,
  className,
  children,
}: {
  userId?: string | null;
  /** 이미 아는 NAME_STYLE 상품 코드 — 있으면 userId 로 묻지 않는다 */
  styleCode?: string | null;
  /** 이미 아는 닉네임 색(styleCode 와 함께 넘긴다) */
  tint?: NameTint | null;
  className?: string;
  children: ReactNode;
}) {
  // 관리자가 추가한 상품의 그림 정의가 들어오면 다시 그린다
  useCosmeticCatalog();
  const loadout = useUserLoadout(styleCode === undefined ? userId : null);
  const code = styleCode === undefined ? loadout.NAME_STYLE : styleCode;
  // 고른 색 — styleCode 를 넘겼으면 tint 도 넘긴 값, 아니면 장착 정보의 nameTint
  const shownTint = styleCode === undefined ? loadout.nameTint : tint;
  return (
    <StyledName
      code={findCosmetic(code)?.nameStyle}
      tint={shownTint}
      className={className}
    >
      {children}
    </StyledName>
  );
}
