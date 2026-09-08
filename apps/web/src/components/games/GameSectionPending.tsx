import Link from "next/link";
import {
  DEFAULT_GAME,
  GAMES,
  type GameSection,
  type GameTitle,
} from "@nexus/types";

/** 화면별 안내 문구. "준비 중"만 띄우면 뭘 기다리는지 알 수 없다. */
const SECTION_COPY: Record<GameSection, { label: string; detail: string }> = {
  tournaments: {
    label: "내전",
    detail: "방 개설과 팀 편성을 준비하고 있습니다.",
  },
  matches: {
    label: "내전 전적",
    detail: "스크림 결과 수집이 붙으면 라운드별 순위와 킬이 여기에 쌓입니다.",
  },
  ranking: {
    label: "랭킹",
    detail: "줄 세울 경기 기록이 아직 없습니다. 내전이 쌓이면 열립니다.",
  },
  guide: {
    label: "가이드",
    detail: "진행 방식이 롤과 달라 문서를 따로 준비하고 있습니다.",
  },
  profile: {
    label: "프로필",
    detail: "계정 연동을 준비하고 있습니다.",
  },
};

/**
 * 게임은 열었지만 이 화면은 아직인 상태.
 *
 * 롤 화면을 그대로 렌더하면 URL 과 내용이 어긋나고(배그 랭킹에 티어·KDA),
 * 검색엔진은 같은 문서를 두 URL 로 색인한다. 안내로 대체한다.
 */
export function GameSectionPending({
  game,
  section,
}: {
  game: GameTitle;
  section: GameSection;
}) {
  const copy = SECTION_COPY[section];
  const fallback = GAMES[DEFAULT_GAME];

  return (
    <div className="flex w-full flex-grow items-center justify-center px-5 py-20">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold tracking-wider text-accent-primary">
          {GAMES[game].label} · {copy.label}
        </p>
        <h1 className="mt-3 text-2xl font-bold text-text-primary">
          아직 준비 중입니다
        </h1>
        <p className="mt-2 text-sm text-text-secondary">{copy.detail}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link
            href={`/${GAMES[game].slug}/tournaments`}
            className="inline-flex min-h-11 items-center rounded-lg bg-accent-primary px-4 font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            {GAMES[game].shortLabel} 내전 보러 가기
          </Link>
          <Link
            href={`/${fallback.slug}/${section}`}
            className="inline-flex min-h-11 items-center rounded-lg bg-bg-tertiary px-4 font-semibold text-text-primary transition-colors hover:bg-bg-elevated"
          >
            {fallback.shortLabel} {copy.label} 보기
          </Link>
        </div>
      </div>
    </div>
  );
}
