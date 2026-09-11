import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { enabledGames } from "@nexus/types";

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
const CARD_IMAGE: Record<string, string> = {
  // 최신 공식 챔피언 Locke 스플래시와 PUBG 공식 최신 키아트
  LOL: "https://ddragon.leagueoflegends.com/cdn/16.18.1/img/champion/Locke_0.jpg",
  PUBG: "https://wstatic-prod.pubg.com/web/live/main_49267b7/img/49a81ea.webp",
};

const CARD_STYLE: Record<string, { ring: string; glow: string; tag: string }> = {
  LOL: {
    ring: "",
    glow: "from-[#667EEA]/20 to-[#764BA2]/10",
    tag: "bg-[#667EEA]/15 text-[#C7D2FE]",
  },
  PUBG: {
    ring: "",
    glow: "from-[#8A5A1E]/25 to-[#5C7330]/10",
    tag: "bg-[#CF9E41]/15 text-[#F0D9A8]",
  },
};

export function GamePickerCards() {
  const games = enabledGames();

  return (
    <section
      className="relative isolate mx-auto max-w-[1480px] px-5 pb-20 pt-16 sm:px-6 md:pb-24 md:pt-20"
      aria-label="Nexus game hubs"
    >
      <div aria-hidden className="pointer-events-none absolute left-[12%] top-20 -z-10 h-48 w-48 rounded-full bg-amber-300/[0.07] blur-[90px]" />
      <div aria-hidden className="pointer-events-none absolute right-[14%] top-8 -z-10 h-56 w-56 rounded-full bg-violet-400/[0.08] blur-[110px]" />
      <div aria-hidden className="game-picker-wordmark pointer-events-none absolute inset-x-0 top-8 z-0 flex items-center justify-center px-0 text-[clamp(8rem,18vw,18rem)] font-black italic leading-none tracking-[0.02em] text-transparent opacity-80 [background:linear-gradient(105deg,rgba(251,191,36,0.18),rgba(196,181,253,0.16)_48%,rgba(103,232,249,0.12))] [background-clip:text]">
        <span>LET HIM COOK</span>
      </div>
      <div className="game-picker-cards relative z-10 mx-auto mt-24 grid max-w-[600px] grid-cols-2 gap-3 sm:gap-5">
        {games.map((game) => {
          const style = CARD_STYLE[game.title] ?? CARD_STYLE.LOL;
          return (
            <Link
              key={game.title}
              href={`/${game.slug}`}
              className={`game-picker-card group relative aspect-[9/16] overflow-hidden rounded-md border border-white/[0.09] bg-white/[0.02] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.24)] transition-all duration-300 hover:-translate-y-0.5 hover:border-amber-200/25 hover:shadow-[0_28px_90px_rgba(245,158,11,0.12)] sm:p-6 ${style.ring}`}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-100 transition duration-500 group-hover:scale-[1.02]"
                style={{ backgroundImage: `url(${CARD_IMAGE[game.title]})` }}
              />
              <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#090a0d]/90 via-[#090a0d]/35 to-transparent" />
              <div aria-hidden className={`pointer-events-none absolute inset-0 bg-gradient-to-br opacity-30 transition-opacity duration-300 group-hover:opacity-60 ${style.glow}`} />

              <div className="relative flex h-full flex-col justify-end gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold tracking-[0.16em] leading-[1.2] text-white/80 drop-shadow-[0_1px_8px_rgba(0,0,0,0.8)]">
                    {game.title === "PUBG" ? "PLAYERUNKNOWN'S BATTLEGROUNDS" : "LEAGUE OF LEGENDS"}
                  </p>
                  <p className="mt-2 text-2xl font-black tracking-[-0.03em] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] sm:text-3xl">
                    {game.title === "PUBG" ? "PUBG \uB0B4\uC804" : "\uB864 \uB0B4\uC804"}
                  </p>
                  <p className="mt-2 text-xs font-medium tracking-[0.08em] text-white/70">
                    {game.title === "PUBG" ? "\uD0AC\uB0B4\uAE30 / \uBC30\uD2C0\uB85C\uC584 / \uD300 \uAE30\uB85D" : "\uBAA8\uC9D1 / \uD300 \uD3B8\uC131 / \uACBD\uAE30 \uAE30\uB85D"}
                  </p>
                </div>

              </div>



            </Link>
          );
        })}
      </div>
    </section>
  );
}
