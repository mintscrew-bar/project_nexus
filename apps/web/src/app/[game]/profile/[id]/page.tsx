"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/**
 * 게임별 공개 프로필 경로.
 *
 * 신원(이름·아바타·평판·클랜)은 게임과 무관해서 공개 프로필은 `/users/:id`
 * 한 곳에 둔다. 그 화면 안에서 **연동한 게임만** 탭으로 갈린다.
 *
 * 기획 문서는 `/lol/profile/:id`·`/pubg/profile/:id` 를 각각의 화면으로 두자고
 * 했지만, 그러면 같은 사람의 프로필이 두 URL 로 색인되고 신원 영역이 두 번
 * 렌더된다. 이미 색인·공유된 `/users/:id` 를 옮기는 비용도 크다.
 * "연동하지 않은 게임의 탭은 표시하지 않는다"는 요구는 탭 쪽에서 지킨다.
 *
 * 이 경로는 옛 링크(`/profile/:id` → 308 → `/lol/profile/:id`)를 받아 넘긴다.
 */
export default function LegacyPublicProfileRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const targetId = params.id as string;
  const gameSlug = params.game as string;

  useEffect(() => {
    if (!targetId) return;
    // 어느 게임 경로로 들어왔는지를 힌트로 넘긴다. 그 사람이 그 게임을
    // 연동하지 않았으면 프로필 화면이 연동된 게임 탭으로 떨어뜨린다.
    router.replace(`/users/${targetId}?game=${gameSlug}`);
  }, [router, targetId, gameSlug]);

  return null;
}
