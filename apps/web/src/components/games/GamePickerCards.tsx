import { enabledGames } from "@nexus/types";
import { GameEntryLink } from "./GameEntryLink";

/**
 * 게임 선택 카드.
 *
 * 헤더의 `GameSwitcher` 로 게임을 바꿀 수는 있었지만 눈에 띄지 않아,
 * 배그 내전이 열려 있다는 사실 자체를 모르고 나가는 사람이 있었다.
 *
 * 다만 **가로막는 선택 화면으로 두지 않는다.** `/` 는 이 사이트에서 유일하게
 * SSR 본문이 들어간 공개 랜딩이고 canonical 도 여기다. 그 앞에 선택 화면을
 * 세우면 검색봇과 첫 방문자가 "여기 뭐 하는 곳인지" 읽기 전에 게임부터
 * 고르게 된다. 본문은 그대로 두고 히어로 바로 아래에 크게 놓는 편이,
 * 발견성은 같으면서 색인과 전환을 잃지 않는다.
 *
 * 마크업은 서버에서 그린다. 링크만 인증 상태를 보므로 그 껍데기
 * (`GameEntryLink`)만 클라이언트다 — 랜딩 초기 번들이 커지지 않는다.
 *
 * **스크롤 연동 연출을 걷어냈다.** `animation-timeline: view()` 로 등장
 * 애니메이션을 넣었었는데 세 가지가 겹쳐 망가졌다.
 * · 인셋(`view(8% 72%)`)이 타임라인 구간을 화면 위쪽 좁은 띠로 줄여서
 *   카드가 **떠날 때** 밝아졌다
 * · `fill-mode: both` 가 그전까지 `opacity: 0` 을 물고 있어 아예 안 보였다
 * · 이 랜딩은 스크롤러가 불안정하다 — body 가 `h-screen overflow-hidden`
 *   인데 `LandingMobileNav` 가 마운트되며 인라인으로 덮어야 비로소 스크롤된다.
 *   스크롤이 없으면 스크롤 타임라인은 진행하지 않는다.
 * 정적 연출은 하이드레이션 전에도, 스크롤이 없어도 그대로 성립한다.
 *
 * **외부 이미지도 걷어냈다.** 챔피언 스플래시를 버전 경로에 붙여 403 이
 * 났고(올바른 경로는 버전이 없는 `cdn/img/champion/loading/…`), PUBG 쪽은
 * 해시가 박힌 CDN 경로라 언제든 바뀐다. 공개 랜딩의 가장 큰 이미지 두 장을
 * 남의 CDN 에 맡기면 깨질 때 첫 화면이 빈다. 카드 아트는 CSS 로 짠다.
 */

/**
 * 게임별 카드 아트.
 *
 * 이미지는 **자체 호스팅**한다(`public/images/games`). 전에는 남의 CDN 을
 * 직접 걸었다가 두 가지로 깨졌다 — 챔피언 아트는 버전 경로에 splash 파일명을
 * 붙여 403 이 났고(올바른 경로는 버전 없는 `cdn/img/champion/loading/…`),
 * PUBG 쪽은 경로에 빌드 해시(`main_49267b7`)가 박혀 있어 그쪽이 재배포하면
 * 그날 첫 화면이 빈다. 합쳐서 50KB 라 받아두는 게 싸다.
 *
 * 이미지가 없어도 카드는 성립한다 — `wash` 그라디언트가 밑에 깔려 있어
 * 배경만 사라지고 글자·태그·CTA 는 그대로다.
 */
const CARD_ART: Record<
  string,
  {
    image?: string;
    /** 잘라 쓸 기준. 세로 아트는 얼굴이 있는 위쪽, 가로 아트는 가운데. */
    imagePosition?: string;
    wash: string;
    mark: string;
    kicker: string;
  }
> = {
  LOL: {
    image: "/images/games/lol.jpg",
    imagePosition: "bg-top",
    wash: "bg-[radial-gradient(120%_85%_at_20%_0%,rgba(102,126,234,0.34),transparent_62%),radial-gradient(110%_75%_at_85%_18%,rgba(118,75,162,0.28),transparent_58%),linear-gradient(180deg,#161a2e_0%,#0b0c14_72%)]",
    mark: "text-[#8b9cf0]/[0.13]",
    kicker: "LEAGUE OF LEGENDS",
  },
  PUBG: {
    // pubg.com 현행 히어로 키아트(2176×932). 가로가 길어 9:16 카드에서는
    // 가운데를 세로로 잘라 쓴다.
    image: "/images/games/pubg.webp",
    imagePosition: "bg-center",
    wash: "bg-[radial-gradient(120%_85%_at_22%_0%,rgba(242,169,0,0.3),transparent_60%),radial-gradient(110%_70%_at_88%_22%,rgba(255,209,102,0.16),transparent_55%),linear-gradient(180deg,#241c0d_0%,#0b0b0b_74%)]",
    mark: "text-[#F2A900]/[0.14]",
    kicker: "PLAYERUNKNOWN'S BATTLEGROUNDS",
  },
};

/** 카드 위에 얹는 미세한 결. 배그 테마의 그레인과 같은 계열이다. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.055'/%3E%3C/svg%3E\")";

const CARD_COPY: Record<string, { title: string }> = {
  LOL: { title: "롤 내전" },
  PUBG: { title: "PUBG 내전" },
};

export function GamePickerCards() {
  const games = enabledGames();

  return (
    <section
      className="relative isolate mx-auto max-w-[1480px] px-5 pb-20 pt-16 sm:px-6 md:pb-24 md:pt-20"
      aria-label="Nexus game hubs"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-[12%] top-20 -z-10 h-48 w-48 rounded-full bg-amber-300/[0.07] blur-[90px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-[14%] top-8 -z-10 h-56 w-56 rounded-full bg-violet-400/[0.08] blur-[110px]"
      />

      {/*
        워터마크는 **크고**, 카드와 살짝 겹쳐 뒤에 깔린다.
        폭은 `vw` 로 잰다 — 고정 크기로 두면 넓은 화면에서 양옆이 잘려
        `ET HIM COO` 처럼 읽힌다. 13rem 상한은 초광폭에서 너무 커지지 않게.
        `background-clip: text` 로 그라디언트를 물리면 Chrome 에서 접두사가
        빠질 때 글자가 아니라 사각형 색 띠가 된다 — 실제로 그렇게 나왔다.
        단색 고스트는 접두사에 의존하지 않는다.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-10 z-0 flex items-center justify-center whitespace-nowrap text-[clamp(3rem,11.5vw,13rem)] font-black italic leading-[0.82] tracking-[-0.02em] text-white/[0.07]"
      >
        <span>LET HIM COOK</span>
      </div>

      <div className="relative z-10 mx-auto mt-28 grid max-w-[600px] grid-cols-2 gap-3 sm:gap-4 md:mt-32">
        {games.map((game) => {
          const art = CARD_ART[game.title] ?? CARD_ART.LOL;
          const copy = CARD_COPY[game.title] ?? CARD_COPY.LOL;
          return (
            <GameEntryLink
              key={game.title}
              slug={game.slug}
              className={`group relative aspect-[9/16] overflow-hidden rounded-lg [container-type:inline-size] p-5 transition-transform duration-300 hover:-translate-y-1 sm:p-6 ${art.wash}`}
            >
              {/* 카드 안쪽 큰 약어. 이미지가 없을 때 카드를 받쳐준다.
                  카드 폭 기준(`cqw`)으로 재야 글자가 경계에서 잘리지 않는다 —
                  뷰포트 기준(`vw`)으로 잡았다가 `LOL` 이 `LOI` 로 잘렸다. */}
              {art.image ? null : (
                <span
                  aria-hidden
                  className={`pointer-events-none absolute right-3 top-3 text-[26cqw] font-black italic leading-[0.85] tracking-[-0.05em] transition-transform duration-500 group-hover:-translate-y-1 ${art.mark}`}
                >
                  {game.title}
                </span>
              )}

              {/* 게임 아트. `wash` 위에 덮고, 아래 그라디언트가 다시 눌러
                  글자 대비를 만든다. 없으면 `wash` 만 보인다. */}
              {art.image ? (
                <span
                  aria-hidden
                  className={`pointer-events-none absolute inset-0 bg-cover transition-transform duration-500 group-hover:scale-[1.03] ${art.imagePosition ?? "bg-center"}`}
                  style={{ backgroundImage: `url(${art.image})` }}
                />
              ) : null}

              {/* 아래쪽을 눌러 글자가 확실히 읽히게 한다.
                  **정지점을 직접 준다.** `via` 로 두면 항상 높이의 50% 에
                  걸려서, 카드가 짧아지는 모바일에서 글자 블록이 스크림 밖으로
                  나간다 — 밝은 아트(PUBG 폭발) 위에서 키커가 안 읽혔다.
                  글자가 놓이는 아래 45% 는 확실히 덮는다. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,#07080b_0%,rgba(7,8,11,0.94)_30%,rgba(7,8,11,0.6)_48%,transparent_74%)]"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-70 mix-blend-overlay"
                style={{ backgroundImage: GRAIN, backgroundSize: "160px 160px" }}
              />

              {/* 남기는 건 게임 이름뿐이다. 태그와 CTA 는 카드를 설명문으로
                  만들 뿐이고, 카드 자체가 이미 링크다. */}
              <div className="relative flex h-full flex-col justify-end gap-1.5">
                <p className="text-[10px] font-bold leading-[1.2] tracking-[0.16em] text-white/60">
                  {art.kicker}
                </p>
                <p className="text-2xl font-black tracking-[-0.03em] text-white sm:text-3xl">
                  {copy.title}
                </p>
              </div>
            </GameEntryLink>
          );
        })}
      </div>
    </section>
  );
}
