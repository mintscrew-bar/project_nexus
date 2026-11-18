"use client";

import { createElement } from "react";
import { resolveBoardIcon } from "@/lib/board-icons";

/**
 * 게시판 아이콘 — 관리자가 정한 iconName 을 lucide 아이콘으로 그린다.
 *
 * 예전엔 각 화면이 `const Icon = resolveBoardIcon(name)` 뒤 `<Icon />` 로 그렸는데, React
 * 컴파일러는 그릴 때 정해지는 컴포넌트를 "그릴 때 새로 만든 컴포넌트" 로 본다
 * (react-hooks/static-components). 실제로는 미리 만든 아이콘 표에서 고르는 것뿐이라
 * 이 한 곳에서 createElement 로 그리고, 화면들은 <BoardIcon name=... /> 만 쓴다.
 */
export function BoardIcon({
  name,
  className,
}: {
  name?: string | null;
  className?: string;
}) {
  return createElement(resolveBoardIcon(name), { className });
}
