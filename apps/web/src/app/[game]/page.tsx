import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Crosshair, Trophy, Users, Swords, Target } from "lucide-react";
import { GAMES, GAME_TITLES, gameFromSlug } from "@nexus/types";

const content = {
  LOL: {
    label: "LEAGUE OF LEGENDS",
    title: "롤 내전 운영을\n한곳에서 시작하세요",
    description: "모집부터 포지션 확인, 팀 편성, 대진표와 경기 기록까지 롤 내전의 모든 흐름을 연결합니다.",
    accent: "text-amber-200",
    glow: "bg-violet-400/[0.14]",
    features: [["tournaments", "롤 내전", "열린 내전에 참가하거나 새로운 방을 만듭니다.", Swords], ["ranking", "롤 랭킹", "내전 결과와 누적 기록을 확인합니다.", Trophy], ["matches", "롤 전적", "경기별 KDA와 개인 기록을 찾아봅니다.", Crosshair]],
  },
  PUBG: {
    label: "PUBG: BATTLEGROUNDS",
    title: "배그 스크림을\n한곳에서 시작하세요",
    description: "4인 스쿼드 구성부터 킬내기·배틀로얄 모드 선택, 라운드별 포인트 집계까지 배그에 맞는 흐름으로 운영합니다.",
    accent: "text-[#e4b85d]",
    glow: "bg-[#cf9e41]/[0.16]",
    features: [["tournaments", "배그 대회", "진행 중인 킬내기와 배틀로얄 스크림을 확인합니다.", Swords], ["ranking", "배그 랭킹", "팀 순위와 킬·순위 포인트를 확인합니다.", Trophy], ["matches", "라운드 기록", "스크림 라운드별 결과와 선수 기록을 찾아봅니다.", Target]],
  },
} as const;

export function generateStaticParams() {
  return GAME_TITLES.map((title) => ({ game: GAMES[title].slug }));
}

export default async function GameHome({ params }: { params: Promise<{ game: string }> }) {
  const { game: slug } = await params;
  const title = gameFromSlug(slug);
  if (!title) notFound();
  const item = content[title];
  const isPubg = title === "PUBG";

  return (
    <main className="relative min-h-full overflow-hidden bg-[#0d0e11] px-5 py-10 text-white md:px-10 md:py-16">
      <div aria-hidden className={`pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full blur-[130px] ${item.glow}`} />
      <div className="relative mx-auto max-w-6xl">
        <section className="relative overflow-hidden rounded-[32px] border border-white/[0.10] bg-[#15171c] p-7 shadow-[0_30px_100px_rgba(0,0,0,0.35)] md:p-14">
          <div className="max-w-3xl">
            <p className={`text-xs font-bold tracking-[0.2em] ${item.accent}`}>{item.label}</p>
            <h1 className="mt-5 whitespace-pre-line text-4xl font-black leading-[1.02] tracking-[-0.055em] md:text-7xl">{item.title}</h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-white/60 md:text-lg md:leading-8">{item.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/auth/login" className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#111217] transition hover:-translate-y-0.5">Nexus 로그인 <ArrowRight className="h-4 w-4" /></Link>
              <Link href={`/${slug}/tournaments?create=true`} className="inline-flex items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/[0.08]">새 {isPubg ? "스크림" : "내전"} 만들기</Link>
            </div>
          </div>
          <div className={`pointer-events-none absolute -bottom-24 -right-12 h-64 w-64 rounded-full blur-[100px] ${isPubg ? "bg-[#596044]/30" : "bg-[#764BA2]/25"}`} />
        </section>
        <section className="mt-10">
          <div className="mb-5 flex items-center gap-2 text-white/55"><Users className={`h-4 w-4 ${item.accent}`} /><h2 className="text-sm font-bold tracking-wide">{isPubg ? "배그 운영 시작하기" : "롤 운영 시작하기"}</h2></div>
          <div className="grid gap-4 md:grid-cols-3">
            {item.features.map(([href, cardTitle, description, Icon]) => (
              <Link key={href} href={`/${slug}/${href}`} className="group rounded-2xl border border-white/[0.09] bg-[#15171c] p-6 transition hover:-translate-y-1 hover:border-white/20">
                <Icon className={`h-5 w-5 ${item.accent}`} /><h3 className="mt-5 text-xl font-bold">{cardTitle}</h3><p className="mt-2 min-h-12 text-sm leading-6 text-white/55">{description}</p><span className={`mt-6 inline-flex items-center gap-1 text-sm font-semibold ${item.accent}`}>바로가기 <ArrowRight className="h-4 w-4" /></span>
              </Link>
            ))}
          </div>
        </section>
        <Link href="/" className="mt-10 inline-flex items-center gap-2 text-sm font-semibold text-white/45 transition hover:text-white/80"><ArrowRight className="h-4 w-4 rotate-180" /> 종합 홈으로 돌아가기</Link>
      </div>
    </main>
  );
}
