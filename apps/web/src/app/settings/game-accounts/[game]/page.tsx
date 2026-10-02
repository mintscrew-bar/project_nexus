"use client";

import { notFound, useParams } from "next/navigation";
import { GameAccountManagementPage } from "@/components/profile/GameAccountManagement";
import { gameFromSlug } from "@nexus/types";

/** 공개 프로필과 등록·삭제 같은 게임 계정 관리 동작을 분리한다. */
export default function GameAccountSettingsPage() {
  const params = useParams<{ game: string }>();
  const game = gameFromSlug(params.game);
  if (!game) notFound();

  return <GameAccountManagementPage game={game === "PUBG" ? "PUBG" : "LOL"} />;
}
