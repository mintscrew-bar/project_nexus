import type { Metadata } from "next";
import { GAMES, gameFromSlug, DEFAULT_GAME } from "@nexus/types";
import { gameCanonical } from "@/lib/seo";

const COPY = {
  LOL: {
    title: "롤 내전 방 모집·참여",
    description:
      "롤 내전 방을 찾고 참여하세요. 경매·스네이크 드래프트로 팀을 구성하는 리그 오브 레전드 내전 모집 목록을 Nexus에서 한눈에 확인할 수 있습니다.",
    ogDescription:
      "지금 열린 롤 내전 방을 확인하고 참여하세요. 경매·스네이크 드래프트로 팀을 짜는 내전 모집을 Nexus에서.",
  },
  PUBG: {
    title: "배그 내전 방 모집·참여",
    description:
      "배틀그라운드 내전 방을 찾고 참여하세요. 스팀·카카오 플랫폼별로 열린 4인 스쿼드 스크림과 킬내기 모집을 Nexus에서 한눈에 확인할 수 있습니다.",
    ogDescription:
      "지금 열린 배그 내전 방을 확인하고 참여하세요. 경매·스네이크 드래프트로 스쿼드를 짜는 스크림 모집을 Nexus에서.",
  },
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ game: string }>;
}): Promise<Metadata> {
  const { game: slug } = await params;
  const title = gameFromSlug(slug) ?? DEFAULT_GAME;
  const copy = COPY[title];
  const url = gameCanonical(GAMES[title].slug, "/tournaments");

  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: url },
    openGraph: {
      title: `${copy.title} | Nexus`,
      description: copy.ogDescription,
      url,
    },
  };
}

export default function TournamentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
