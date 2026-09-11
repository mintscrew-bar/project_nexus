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
  LOL: "https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Jinx_0.jpg",
  PUBG: "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/578080/841ea38bc58cabb70aef65365cf50bc2d79329d9/library_header_2x.jpg",
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
      <div aria-hidden className="pointer-events-none absolute -top-1 left-0 right-0 -z-10 text-center whitespace-nowrap text-[clamp(4rem,12vw,12rem)] font-black leading-none tracking-[-0.1em] text-white/[0.025]">
        NEXUS / PLAY
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {games.map((game) => {
          const style = CARD_STYLE[game.title] ?? CARD_STYLE.LOL;
          return (
            <Link
              key={game.title}
              href={`/${game.slug}`}
              className={`group relative aspect-[16/9] overflow-hidden rounded-xl bg-white/[0.02] p-6 transition-all duration-300 hover:-translate-y-1 sm:p-7 ${style.ring}`}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-75 transition duration-500 group-hover:scale-105 group-hover:opacity-95"
                style={{ backgroundImage: `url(${CARD_IMAGE[game.title]})` }}
              />
              <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#090a0d]/75 via-[#090a0d]/20 to-transparent" />
              <div aria-hidden className={`pointer-events-none absolute inset-0 bg-gradient-to-br opacity-30 transition-opacity duration-300 group-hover:opacity-60 ${style.glow}`} />

              <div className="relative flex h-full flex-col justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold tracking-[0.14em] text-white/70">
                    {game.title === "PUBG" ? "PLAYERUNKNOWN'S BATTLEGROUNDS" : "LEAGUE OF LEGENDS"}
                  </p>
                  <p className="mt-2 text-4xl font-black tracking-[-0.06em] text-white sm:text-5xl">
                    {game.label} 내전
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
