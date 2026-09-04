import type { Metadata } from "next";
import { GAMES, gameFromSlug, DEFAULT_GAME, isSectionReady } from "@nexus/types";
import { GameSectionPending } from "@/components/games/GameSectionPending";
import { gameCanonical } from "@/lib/seo";

/** 게임마다 전적에 담기는 내용이 달라 문구도 따로 둔다. */
const COPY = {
  LOL: {
    title: "롤 내전 전적 검색",
    description:
      "롤 내전 전적을 검색하고 확인하세요. 소환사별 매치 기록, 팀 구성, 챔피언 픽, KDA, 승패까지 리그 오브 레전드 내전 전적을 Nexus에서 한눈에.",
    ogDescription:
      "롤 내전 전적을 검색하세요. 소환사별 매치 기록, 팀 구성, 챔피언 픽, KDA, 승패를 전부 확인할 수 있습니다.",
  },
  PUBG: {
    title: "배그 내전 전적 검색",
    description:
      "배틀그라운드 내전 전적을 검색하고 확인하세요. 스크림 라운드별 순위와 킬, 팀 구성, 누적 포인트를 Nexus에서 한눈에.",
    ogDescription:
      "배그 내전 전적을 검색하세요. 라운드별 순위·킬과 팀별 누적 포인트를 확인할 수 있습니다.",
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
  // canonical 은 지금 서비스되는 URL(`/lol/matches`)이어야 한다.
  const url = gameCanonical(GAMES[title].slug, "/matches");

  // 준비 중 안내는 색인할 내용이 아니다.
  if (!isSectionReady(title, "matches")) {
    return { title: copy.title, robots: { index: false, follow: true } };
  }

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

export default async function MatchesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ game: string }>;
}) {
  const { game: slug } = await params;
  const title = gameFromSlug(slug) ?? DEFAULT_GAME;

  // 배그 전적은 스크림 결과 수집이 붙기 전까지 채울 데이터가 없다.
  // 롤 전적 화면을 그대로 내보내면 `/pubg/matches` 에 소환사·챔피언이 나온다.
  if (!isSectionReady(title, "matches")) {
    return <GameSectionPending game={title} section="matches" />;
  }

  return children;
}
