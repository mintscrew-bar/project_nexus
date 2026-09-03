import Link from "next/link";
import { notFound } from "next/navigation";
import {
  DEFAULT_GAME,
  GAMES,
  GAME_TITLES,
  gameFromSlug,
} from "@nexus/types";

/**
 * 이 세그먼트가 받을 수 있는 게임 슬러그를 못박는다.
 *
 * layout 의 `notFound()` 만으로는 부족했다 — layout 과 page 는 병렬로 렌더돼서
 * `/foobar/matches` 가 롤 전적 페이지를 그대로 200 으로 내보내고 있었다.
 * (`/zzz-not-real` 도 마찬가지로 200) 아무 URL 이나 실제 페이지가 되면
 * 검색엔진이 무한한 중복 문서를 색인한다.
 *
 * `dynamicParams = false` 와 함께 쓰면 목록에 없는 슬러그는 Next 가 세그먼트
 * 단계에서 404 로 끊는다. 아래 `notFound()` 는 이중 방어로 남겨 둔다.
 */
export function generateStaticParams() {
  return GAME_TITLES.map((title) => ({ game: GAMES[title].slug }));
}

export const dynamicParams = false;

/**
 * 게임별 화면의 공통 진입점.
 *
 * `/lol/...` `/pubg/...` 처럼 경로 첫 칸이 게임이다. 링크에 게임이 담겨야
 * 공유했을 때 받는 사람도 같은 화면을 보고, 검색엔진도 두 게임을 별개 페이지로
 * 색인한다. 클랜·커뮤니티처럼 게임과 무관한 화면은 이 아래에 두지 않는다.
 */
export default async function GameLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ game: string }>;
}) {
  const { game: slug } = await params;
  const title = gameFromSlug(slug);

  // 모르는 게임 이름은 존재하지 않는 페이지다. 여기서 걸러야 `/foobar/...` 가
  // 롤 화면을 그대로 보여주는 일이 없다.
  if (!title) notFound();

  const game = GAMES[title];

  // 정의는 있지만 아직 열지 않은 게임. 롤 화면을 그대로 렌더하면 URL 과 내용이
  // 어긋나므로 안내로 대체한다.
  if (!game.enabled) {
    return (
      <div className="flex w-full flex-grow items-center justify-center px-5 py-20">
        <div className="text-center">
          <p className="text-sm font-semibold tracking-wider text-accent-primary">
            {game.label}
          </p>
          <h1 className="mt-3 text-2xl font-bold text-text-primary">
            아직 준비 중입니다
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            {game.label} 내전은 곧 열립니다.
          </p>
          <Link
            href={`/${GAMES[DEFAULT_GAME].slug}/tournaments`}
            className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-accent-primary px-4 font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            {GAMES[DEFAULT_GAME].label} 내전 보러 가기
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
