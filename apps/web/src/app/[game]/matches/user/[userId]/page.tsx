"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { gameFromSlug } from "@nexus/types";
import { userProfilePath } from "@/lib/profile-routes";

/**
 * 예전 "넥서스 유저 전적" 경로.
 *
 * 2026-11 개인 프로필과 한 화면으로 합쳤다. 내전 지표·내전 챔피언·내전 기록 목록은
 * 이제 프로필(`/users/:id`)의 롤 탭에 있다. 옛 링크·공유 주소가 끊기지 않게 넘긴다.
 */
export default function LegacyNexusUserRecordsRedirect() {
  const params = useParams();
  const router = useRouter();
  const userId = params.userId as string;
  const game = gameFromSlug(params.game as string) ?? "LOL";

  useEffect(() => {
    if (!userId) return;
    router.replace(userProfilePath(userId, game));
  }, [router, userId, game]);

  return null;
}
