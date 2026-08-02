import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  Check,
  HelpCircle,
  Mic2,
  Trophy,
  Users,
} from "lucide-react";
import { absoluteUrl } from "@/lib/seo";
import { NEXUS_DISCORD_INVITE_URL } from "@/lib/constants";
import { RESOURCE_ARTICLES } from "../resources/articles";
import { GuideCarousel } from "./_components/GuideCarousel";

export const metadata: Metadata = {
  title: "롤 내전 가이드와 운영 자료 — Nexus",
  description:
    "Nexus의 방 생성, 팀 구성, 역할 선택, 대진표, Discord 연동 사용법과 실제 내전 운영 자료를 주제별로 확인하세요.",
  alternates: { canonical: absoluteUrl("/guide") },
  openGraph: {
    title: "롤 내전 가이드와 운영 자료 — Nexus",
    description: "기능 사용법과 실제 운영 자료를 주제별 페이지에서 확인하세요.",
    url: absoluteUrl("/guide"),
  },
};

const categories = [
  {
    href: "/guide/start",
    visual: "start",
    title: "빠른 시작",
    description: "방 생성부터 참가, 준비 완료, 내전 시작까지 처음 필요한 흐름을 확인합니다.",
  },
  {
    href: "/guide/team-modes",
    visual: "teams",
    title: "팀 구성",
    description: "경매, 스네이크, 자동 밸런스, 자유 팀 선택의 차이와 진행법을 비교합니다.",
  },
  {
    href: "/guide/match-flow",
    visual: "match",
    title: "경기 진행",
    description: "역할 선택부터 대진표, 경기 결과 입력까지 이어지는 순서를 안내합니다.",
  },
  {
    href: "/guide/discord",
    visual: "discord",
    title: "Discord 연동",
    description: "봇 추가, 서버 승인, 음성 채널 이동과 주요 명령어를 정리했습니다.",
  },
  {
    href: "/guide/records",
    visual: "records",
    title: "기록과 커뮤니티",
    description: "내전 전적, 랭킹, 클랜을 다음 내전 준비에 활용하는 방법을 확인합니다.",
  },
  {
    href: "/guide/resources",
    visual: "resources",
    title: "운영 자료",
    description: "실제 운영 체크리스트와 기능 개선 기록을 문서별로 찾아볼 수 있습니다.",
  },
  {
    href: "/guide/faq",
    visual: "faq",
    title: "자주 묻는 질문",
    description: "시작 조건, 팀 편성, 대진표와 Discord 연동에 관한 답변을 모았습니다.",
  },
];

const flow = ["방 만들기", "팀 구성", "역할 선택", "경기 기록"];

type GuideVisual = (typeof categories)[number]["visual"];

function VisualShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex h-full min-h-52 items-center justify-center overflow-hidden bg-[#111521] p-6 md:p-8">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-30"
        style={{ backgroundImage: "radial-gradient(circle, rgba(148,163,184,.22) 1px, transparent 1px)", backgroundSize: "18px 18px" }}
      />
      <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-accent-primary/15 blur-3xl" />
      <div className="relative h-[190px] w-full max-w-[390px]">{children}</div>
    </div>
  );
}

function GuideCardVisual({ type }: { type: GuideVisual }) {
  if (type === "start") {
    return (
      <VisualShell>
        <div className="mx-auto h-full w-full rounded-2xl bg-[#1a1f2c] p-4 shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="h-2.5 w-24 rounded-full bg-white/80" />
            <div className="h-2 w-2 rounded-full bg-white/25" />
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {["10명", "경매", "공개"].map((item, index) => (
              <div key={item} className={`rounded-xl px-3 py-3 ${index === 0 ? "bg-accent-primary text-white" : "bg-white/[0.05] text-white/65"}`}>
                <p className="text-[10px] text-current opacity-60">{index === 0 ? "참가 인원" : index === 1 ? "팀 구성" : "방 설정"}</p>
                <p className="mt-1 text-sm font-bold">{item}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between rounded-xl bg-white/[0.04] px-4 py-3">
            <div className="flex -space-x-1.5">
              {Array.from({ length: 5 }).map((_, index) => <span key={index} className="h-6 w-6 rounded-full border-2 border-[#1d2230] bg-gradient-to-br from-slate-400/80 to-slate-700" />)}
            </div>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400"><Check className="h-3.5 w-3.5" /> 준비 완료</span>
          </div>
        </div>
      </VisualShell>
    );
  }

  if (type === "teams") {
    return (
      <VisualShell>
        <div className="grid h-full grid-cols-[1fr_auto_1fr] items-center gap-3">
          {["TEAM A", "TEAM B"].map((team, teamIndex) => (
            <div key={team} className={teamIndex === 1 ? "order-3" : ""}>
              <p className={`mb-3 text-center text-[10px] font-bold tracking-[0.16em] ${teamIndex ? "text-rose-300" : "text-sky-300"}`}>{team}</p>
              <div className="space-y-1 rounded-2xl bg-white/[0.045] p-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-2 rounded-md bg-black/20 px-2 py-1.5">
                    <span className={`h-4 w-4 rounded ${teamIndex ? "bg-rose-400/30" : "bg-sky-400/30"}`} />
                    <span className="h-1.5 flex-1 rounded-full bg-white/15" />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="order-2 flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-xs font-black text-white/55">VS</div>
        </div>
      </VisualShell>
    );
  }

  if (type === "match") {
    return (
      <VisualShell>
        <div className="flex h-full items-center justify-center gap-4">
          <div className="space-y-3">
            {[0, 1, 2, 3].map((item) => <div key={item} className="h-7 w-24 rounded-lg bg-white/[0.07] p-1.5"><div className="h-full w-1/2 rounded bg-white/15" /></div>)}
          </div>
          <div className="space-y-10">
            {[0, 1].map((item) => <div key={item} className="h-9 w-24 rounded-lg bg-accent-primary/20 p-2"><div className="h-full w-2/3 rounded bg-accent-primary/40" /></div>)}
          </div>
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-300/10 text-amber-300">
            <Trophy className="h-9 w-9" />
          </div>
        </div>
      </VisualShell>
    );
  }

  if (type === "discord") {
    return (
      <VisualShell>
        <div className="grid h-full w-full grid-cols-[1fr_118px] overflow-hidden rounded-2xl bg-[#1a1f2c] shadow-2xl">
          <div className="p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-white"><Mic2 className="h-4 w-4 text-emerald-400" /> 내전 대기실</div>
            <div className="mt-3 space-y-1.5">
              {["대기 채널", "Team 1", "Team 2"].map((label, index) => (
                <div key={label} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 ${index === 0 ? "bg-accent-primary/15" : "bg-white/[0.035]"}`}>
                  <span className={`h-6 w-6 rounded-full ${index === 0 ? "bg-accent-primary/60" : "bg-white/10"}`} />
                  <span className="flex-1 text-[11px] font-semibold text-white/65">{label}</span>
                  <span className="text-[10px] text-white/30">{index === 0 ? "10" : "5"}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col bg-black/20 p-3.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-primary/20 text-accent-primary"><Bot className="h-4 w-4" /></div>
            <p className="mt-3 text-[10px] text-white/30">연동 상태</p>
            <p className="mt-1 text-xs font-bold text-emerald-400">연결됨</p>
            <div className="mt-4 flex -space-x-1.5">
              {Array.from({ length: 4 }).map((_, index) => <span key={index} className="h-6 w-6 rounded-full border-2 border-[#161a24] bg-slate-600" />)}
            </div>
            <p className="mt-auto text-[9px] leading-4 text-white/25">음성 채널 자동 이동</p>
          </div>
        </div>
      </VisualShell>
    );
  }

  if (type === "records") {
    const bars = [38, 62, 48, 76, 58, 88, 70];
    return (
      <VisualShell>
        <div className="grid h-full w-full grid-cols-[1fr_118px] overflow-hidden rounded-2xl bg-[#1a1f2c] shadow-2xl">
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-[10px] text-white/35">최근 경기 흐름</p><p className="mt-1 text-lg font-black text-white">5승 2패</p></div>
              <BarChart3 className="h-4 w-4 text-accent-primary" />
            </div>
            <div className="mt-4 flex h-[104px] items-end gap-2">
              {bars.map((height, index) => <div key={index} className="flex-1 rounded-t bg-accent-primary/70" style={{ height: `${height}%`, opacity: 0.45 + index * 0.07 }} />)}
            </div>
          </div>
          <div className="flex flex-col bg-black/20 p-3.5">
            <p className="text-[10px] text-white/30">승률</p>
            <p className="mt-1 text-2xl font-black text-white">71%</p>
            <div className="mt-4 grid grid-cols-2 gap-1.5">
              {["W", "W", "L", "W"].map((result, index) => (
                <span key={index} className={`flex h-7 items-center justify-center rounded-md text-[10px] font-black ${result === "W" ? "bg-emerald-400/15 text-emerald-400" : "bg-rose-400/15 text-rose-400"}`}>{result}</span>
              ))}
            </div>
            <div className="mt-auto h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full w-[71%] rounded-full bg-accent-primary" /></div>
          </div>
        </div>
      </VisualShell>
    );
  }

  if (type === "resources") {
    return (
      <VisualShell>
        <div className="relative mx-auto h-full w-full max-w-[350px]">
          {["-rotate-6 -translate-x-8 opacity-40", "rotate-6 translate-x-8 opacity-60", ""].map((className, index) => (
            <div key={index} className={`absolute inset-0 rounded-2xl bg-[#202634] p-5 shadow-xl ${className}`}>
              <BookOpen className="h-5 w-5 text-accent-primary" />
              <div className="mt-8 h-2 w-2/3 rounded-full bg-white/30" />
              <div className="mt-3 h-1.5 w-full rounded-full bg-white/10" />
              <div className="mt-2 h-1.5 w-4/5 rounded-full bg-white/10" />
              <div className="mt-7 flex gap-2"><span className="h-6 w-16 rounded-md bg-accent-primary/20" /><span className="h-6 w-12 rounded-md bg-white/[0.06]" /></div>
            </div>
          ))}
        </div>
      </VisualShell>
    );
  }

  return (
    <VisualShell>
      <div className="mx-auto flex h-full w-full flex-col justify-center space-y-2.5">
        {["방은 언제 시작할 수 있나요?", "팀 구성은 어떻게 하나요?", "Discord 연동이 필요한가요?"].map((question, index) => (
          <div key={question} className="flex items-center gap-3 rounded-xl bg-white/[0.05] px-4 py-4">
            <HelpCircle className={`h-4 w-4 ${index === 0 ? "text-accent-primary" : "text-white/25"}`} />
            <span className="flex-1 text-xs font-semibold text-white/65">{question}</span>
            <span className="text-white/25">+</span>
          </div>
        ))}
      </div>
    </VisualShell>
  );
}

export default function GuidePage() {
  return (
    <main className="flex-grow bg-bg-primary">
      <div className="mx-auto max-w-[1320px] px-4 py-10 md:px-6 md:py-16">
        <header className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-bg-secondary via-bg-secondary to-accent-primary/[0.07] p-7 shadow-[0_28px_80px_rgb(0_0_0/0.16)] md:p-10 lg:p-12">
          <div aria-hidden="true" className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent-primary/[0.08] blur-3xl" />
          <div className="relative grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-14">
            <div>
              <h1 className="text-4xl font-black leading-[1.02] tracking-[-0.055em] text-text-primary sm:text-5xl lg:text-6xl">
                필요한 가이드를
                <br />
                <span className="bg-gradient-to-r from-accent-primary via-violet-400 to-cyan-400 bg-clip-text text-transparent">
                  페이지별로 빠르게
                </span>
              </h1>
              <p className="mt-6 max-w-3xl text-sm leading-7 text-text-secondary md:text-lg">
                처음 방을 만드는 방법부터 팀 구성, 경기 진행, Discord 연동과 실제 운영 자료까지
                필요한 주제만 골라 확인하세요.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/tournaments"
                  className="inline-flex items-center gap-2 rounded-xl bg-accent-primary px-5 py-3 font-semibold text-white transition-colors hover:bg-accent-hover"
                >
                  내전 방 보기 <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href={NEXUS_DISCORD_INVITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-xl bg-bg-tertiary/70 px-5 py-3 font-semibold text-text-primary transition-colors hover:bg-bg-elevated"
                >
                  Discord 참여
                </a>
              </div>
            </div>

            <div className="rounded-[24px] bg-bg-primary/55 p-5 shadow-[0_24px_60px_rgb(0_0_0/0.18)] md:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-text-primary">내전 진행 흐름</h2>
                  <p className="mt-1 text-xs text-text-tertiary">각 단계마다 필요한 문서를 확인하세요</p>
                </div>
                <span className="rounded-full bg-accent-primary/10 px-3 py-1 text-[11px] font-bold text-accent-primary">4단계</span>
              </div>
              <ol className="mt-5 space-y-2.5">
                {flow.map((label, index) => (
                  <li key={label} className="flex items-center gap-3 rounded-xl bg-bg-secondary/65 px-4 py-3.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-primary/10 text-xs font-black text-accent-primary">
                      0{index + 1}
                    </span>
                    <span className="text-sm font-bold text-text-primary">{label}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </header>

        <GuideCarousel>
            {categories.map((category, index) => {
              return (
                <Link
                  key={category.href}
                  href={category.href}
                  data-guide-card
                  className="group grid w-[84vw] max-w-[480px] flex-none snap-start grid-rows-[230px_190px] overflow-hidden rounded-[28px] bg-bg-secondary shadow-[0_16px_45px_rgb(0_0_0/0.14)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_26px_70px_rgb(0_0_0/0.24)] sm:w-[440px] sm:grid-rows-[250px_180px] lg:w-[480px]"
                >
                  <div>
                    <GuideCardVisual type={category.visual} />
                  </div>
                  <div className="flex h-full items-end justify-between gap-5 p-6 md:p-7">
                    <div className="max-w-2xl">
                      <p className="text-[11px] font-bold tracking-[0.18em] text-text-tertiary">
                        GUIDE {String(index + 1).padStart(2, "0")}
                      </p>
                      <h3 className="mt-2 text-2xl font-black tracking-[-0.035em] text-text-primary md:text-3xl">
                        {category.title}
                      </h3>
                      <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary md:text-base">
                        {category.description}
                      </p>
                    </div>
                    <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-bg-tertiary text-text-secondary transition-colors group-hover:bg-accent-primary group-hover:text-white">
                      <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
        </GuideCarousel>

        <section className="mt-14 rounded-[28px] bg-bg-secondary/45 p-6 md:p-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-2xl font-black tracking-[-0.035em] text-text-primary">최근 운영 자료</h2>
              <p className="mt-2 text-sm text-text-tertiary">실제 운영과 개선 과정에서 남긴 문서입니다.</p>
            </div>
            <Link href="/guide/resources" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-primary">
              전체 자료 보기 <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {RESOURCE_ARTICLES.slice(0, 3).map((article) => (
              <Link key={article.slug} href={`/guide/${article.slug}`} className="rounded-2xl bg-bg-primary/35 p-5 transition-colors hover:bg-bg-elevated/35">
                <p className="text-xs text-text-tertiary">{article.readingTime} 읽기 · {article.updatedAt}</p>
                <h3 className="mt-3 line-clamp-2 font-bold leading-snug text-text-primary">{article.title}</h3>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-secondary">{article.description}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
