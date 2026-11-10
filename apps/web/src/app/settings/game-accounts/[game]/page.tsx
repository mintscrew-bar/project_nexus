"use client";

import { useEffect } from "react";
import { notFound, useParams, useRouter } from "next/navigation";
import { gameFromSlug } from "@nexus/types";
import { myProfilePath } from "@/lib/profile-routes";

/**
 * 옛 게임 계정 관리 주소.
 * 2026-11 내 프로필(/me)로 합쳤다 — 계정 추가·대표·수정·연동 해제는 프로필의 그 게임 탭에서 한다.
 * 로비·홈·방 만들기 등에 남아 있는 링크가 끊기지 않게 넘긴다.
 */
export default function LegacyGameAccountSettingsRedirect() {
  const params = useParams<{ game: string }>();
  const router = useRouter();
  const game = gameFromSlug(params.game);
  if (!game) notFound();

  useEffect(() => {
    router.replace(myProfilePath(game));
  }, [router, game]);

  return null;
}
