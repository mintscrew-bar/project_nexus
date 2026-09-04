import { DEFAULT_GAME, gameFromSlug, isSectionReady } from "@nexus/types";
import { GameSectionPending } from "@/components/games/GameSectionPending";

/**
 * 가이드는 지금 전부 롤 문안이다(방 생성·라인·챔피언·대진표).
 * 배그 진행 방식은 라운드 누적 포인트라 같은 글을 쓸 수 없어서,
 * 배그용 문안이 준비될 때까지 `/pubg/guide` 는 안내로 대체한다.
 */
export default async function GuideLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ game: string }>;
}) {
  const { game: slug } = await params;
  const title = gameFromSlug(slug) ?? DEFAULT_GAME;

  if (!isSectionReady(title, "guide")) {
    return <GameSectionPending game={title} section="guide" />;
  }

  return children;
}
