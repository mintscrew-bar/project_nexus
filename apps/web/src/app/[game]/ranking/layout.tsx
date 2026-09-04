import type { Metadata } from "next";
import {
  GAMES,
  gameFromSlug,
  DEFAULT_GAME,
  isSectionReady,
  type GameTitle,
} from "@nexus/types";
import { GameSectionPending } from "@/components/games/GameSectionPending";
import { gameCanonical, absoluteUrl, SITE_NAME } from "@/lib/seo";

/**
 * 랭킹은 게임마다 줄 세우는 기준 자체가 다르다.
 * 롤은 승률·KDA, 배그는 평균 순위·킬이라 같은 표에 올릴 수 없다.
 */
const COPY = {
  LOL: {
    title: "롤 내전 랭킹",
    description:
      "Nexus 내전 전적 기반 글로벌 랭킹입니다. 승률, 판수, KDA 기준으로 최상위 플레이어를 확인하세요.",
    ogDescription:
      "롤 내전 전적 기반 글로벌 랭킹. 최소 10판 이상 플레이어 대상 승률·KDA 순위를 제공합니다.",
    jsonLdDescription: "롤 내전 전적 기반 글로벌 랭킹 페이지",
  },
  PUBG: {
    title: "배그 내전 랭킹",
    description:
      "Nexus 배그 스크림 기록 기반 랭킹입니다. 평균 순위, 평균 킬, 누적 포인트 기준으로 상위 플레이어를 확인하세요.",
    ogDescription:
      "배그 내전 기록 기반 랭킹. 평균 순위·평균 킬·누적 포인트 순위를 제공합니다.",
    jsonLdDescription: "배그 내전 기록 기반 랭킹 페이지",
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
  const url = gameCanonical(GAMES[title].slug, "/ranking");

  // 준비 중 안내는 색인할 내용이 아니다.
  if (!isSectionReady(title, "ranking")) {
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

function buildJsonLd(title: GameTitle) {
  const copy = COPY[title];
  const url = gameCanonical(GAMES[title].slug, "/ranking");
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${copy.title} | ${SITE_NAME}`,
    description: copy.jsonLdDescription,
    url,
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "홈", item: absoluteUrl("/") },
        { "@type": "ListItem", position: 2, name: copy.title, item: url },
      ],
    },
  };
}

export default async function RankingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ game: string }>;
}) {
  const { game: slug } = await params;
  const title = gameFromSlug(slug) ?? DEFAULT_GAME;

  // 배그는 평균 순위·킬로 줄 세우는데 그 기록이 아직 0건이다.
  // 롤 랭킹표를 그대로 내보내면 `/pubg/ranking` 에 티어와 KDA 가 나온다.
  if (!isSectionReady(title, "ranking")) {
    return <GameSectionPending game={title} section="ranking" />;
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJsonLd(title)) }}
      />
      {children}
    </>
  );
}
