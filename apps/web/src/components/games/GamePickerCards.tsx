import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { enabledGames, isSectionReady, type GameSection } from "@nexus/types";

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
 * 링크 뿐이라 서버 컴포넌트로 둔다 — 랜딩 초기 번들이 커지지 않는다.
 */

/** 카드에서 "이 게임에서 볼 수 있는 것"으로 훑어줄 화면 */
const HIGHLIGHT_SECTIONS: { section: GameSection; label: string }[] = [
  { section: "tournaments", label: "내전" },
  { section: "matches", label: "전적" },
  { section: "ranking", label: "랭킹" },
  { section: "guide", label: "가이드" },
];

/**
 * 게임별 카드 색.
 *
 * 배그를 고르면 화면 색이 통째로 밀리터리 그린으로 바뀐다(`.game-pubg`).
 * 카드가 미리 그 색을 띠고 있어야 넘어갔을 때 갑작스럽지 않다.
 * 랜딩은 자체 팔레트를 쓰는 어두운 화면이라 토큰 대신 값을 직접 적는다.
 */
const CARD_IMAGE: Record<string, string> = {
  LOL: "https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Jinx_0.jpg",
  PUBG: "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/578080/841ea38bc58cabb70aef65365cf50bc2d79329d9/library_header_2x.jpg",
};

const CARD_STYLE: Record<string, { ring: string; glow: string; tag: string }> = {
  LOL: {
    ring: "hover:border-[#667EEA]/60",
    glow: "from-[#667EEA]/20 to-[#764BA2]/10",
    tag: "bg-[#667EEA]/15 text-[#C7D2FE]",
  },
  PUBG: {
    ring: "hover:border-[#CF9E41]/60",
    glow: "from-[#8A5A1E]/25 to-[#5C7330]/10",
    tag: "bg-[#CF9E41]/15 text-[#F0D9A8]",
  },
};

export function GamePickerCards() {
  const games = enabledGames();

  return (
    <section
      className="mx-auto max-w-[1480px] px-5 pb-16 sm:px-6"
      aria-labelledby="game-picker-heading"
    >
      <h2
        id="game-picker-heading"
        className="text-sm font-semibold tracking-wide text-white/45"
      >
        게임을 선택하세요
      </h2>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {games.map((game) => {
          const style = CARD_STYLE[game.title] ?? CARD_STYLE.LOL;
          // 아직 열지 않은 화면은 카드에서 밝힌다. 대등하게 보여주면
          // 골라 들어가서 "준비 중" 안내를 만난다.
          const pending = HIGHLIGHT_SECTIONS.filter(
            (item) => !isSectionReady(game.title, item.section),
          );

          return (
            <Link
              key={game.title}
              href={`/${game.slug}`}
              className={`group relative min-h-[260px] overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 transition-all duration-300 hover:-translate-y-1 sm:p-7 ${style.ring}`}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-45 grayscale-[0.15] transition duration-500 group-hover:scale-105 group-hover:opacity-65"
                style={{ backgroundImage: `url(${CARD_IMAGE[game.title]})` }}
              />
              <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#090a0d] via-[#090a0d]/55 to-[#090a0d]/10" />
              <div aria-hidden className={`pointer-events-none absolute inset-0 bg-gradient-to-br opacity-30 transition-opacity duration-300 group-hover:opacity-60 ${style.glow}`} />

              <div className="relative flex h-full min-h-[208px] flex-col justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold tracking-[0.2em] text-white/65">
                    {game.title === "PUBG" ? "PLAYERUNKNOWN'S BATTLEGROUNDS" : "LEAGUE OF LEGENDS"}
                  </p>
                  <p className="mt-2 text-2xl font-black text-white sm:text-3xl">
                    {game.label} 내전
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white/55">
                    {game.title === "PUBG"
                      ? "4인 스쿼드로 킬내기와 배틀로얄 스크림을 엽니다."
                      : "5대5 내전을 경매·스네이크 드래프트로 편성합니다."}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold ${style.tag}`}
                >
                  {game.shortLabel}
                </span>
              </div>

              <div className="relative mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-white/45">
                {HIGHLIGHT_SECTIONS.map((item) => (
                  <span key={item.section}>{item.label}</span>
                ))}
                {pending.length > 0 && (
                  <span className="text-white/35">
                    ({pending.map((item) => item.label).join("·")} 준비 중)
                  </span>
                )}
              </div>

              <span className="relative mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-white/85">
                이 게임 홈 열기
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
