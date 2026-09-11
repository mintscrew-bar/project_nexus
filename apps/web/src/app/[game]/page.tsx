import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Crosshair, Swords, Trophy, Users } from "lucide-react";

const content = {
  lol: { label: "LEAGUE OF LEGENDS", title: "롤 내전 운영을 한곳에서", description: "모집부터 포지션 확인, 팀 편성, 대진표와 경기 기록까지 이어집니다.", links: [["tournaments","롤 내전","열린 내전에 참가하거나 새로운 방을 만듭니다.",Swords],["ranking","롤 랭킹","내전 결과와 누적 기록을 확인합니다.",Trophy],["matches","롤 전적","경기별 KDA와 개인 기록을 찾아봅니다.",Crosshair]] },
  pubg: { label: "PUBG", title: "배그 대회를 한곳에서", description: "킬내기와 배틀로얄 스크림을 팀 편성부터 결과 집계까지 관리합니다.", links: [["tournaments","배그 대회","진행 중인 킬내기와 배틀로얄을 확인합니다.",Swords],["ranking","배그 랭킹","팀 순위와 킬·딜량 기록을 확인합니다.",Trophy],["matches","배그 전적","라운드별 결과와 선수 기록을 찾아봅니다.",Crosshair]] },
} as const;

export default async function GameHome({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  const item = content[game as keyof typeof content];
  if (!item) notFound();
  return <main className={"min-h-screen bg-gradient-to-br " + (game === "pubg" ? "from-[#CF9E41]/25 to-[#596044]/15" : "from-[#667EEA]/30 to-[#764BA2]/10") + " from-bg-primary via-bg-primary px-5 py-12 text-text-primary md:px-10"}><div className="mx-auto max-w-6xl space-y-12"><section className="rounded-3xl border border-bg-tertiary bg-bg-secondary/80 p-7 md:p-12"><p className="text-xs font-bold tracking-[0.2em] text-accent-primary">{item.label}</p><h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight md:text-6xl">{item.title}</h1><p className="mt-5 max-w-2xl text-base leading-7 text-text-secondary md:text-lg">{item.description}</p><div className="mt-8 flex flex-wrap gap-3"><Link href={"/" + game + "/tournaments"} className="inline-flex items-center gap-2 rounded-xl bg-accent-primary px-5 py-3 text-sm font-bold text-white">내전 둘러보기 <ArrowRight className="h-4 w-4" /></Link><Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-bg-tertiary px-5 py-3 text-sm font-semibold text-text-secondary">게임 바꾸기</Link></div></section><section><div className="mb-4 flex items-center gap-2"><Users className="h-4 w-4 text-accent-primary" /><h2 className="text-sm font-bold tracking-wide text-text-secondary">이 게임에서 할 수 있는 것</h2></div><div className="grid gap-4 md:grid-cols-3">{item.links.map(([href,title,description,Icon]) => <Link key={href} href={"/" + game + "/" + href} className="group rounded-2xl border border-bg-tertiary bg-bg-secondary p-6 transition hover:-translate-y-1 hover:border-accent-primary/60"><Icon className="h-5 w-5 text-accent-primary" /><h3 className="mt-5 text-xl font-bold">{title}</h3><p className="mt-2 min-h-12 text-sm leading-6 text-text-secondary">{description}</p><span className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-accent-primary">바로가기 <ArrowRight className="h-4 w-4" /></span></Link>)}</div></section></div></main>;
}
