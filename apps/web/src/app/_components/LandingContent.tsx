// 비로그인·검색봇용 랜딩 콘텐츠. 핵심 본문은 서버에서 렌더링한다.
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  CircleDot,
  Scale,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { AdSlotCard } from "@/components/ads/AdSlot";
import { LandingMobileNav } from "./LandingMobileNav";

const operations: Array<{
  index: string;
  icon: LucideIcon;
  title: string;
  description: string;
  accent: string;
  glow: string;
}> = [
  {
    index: "01",
    icon: Users,
    title: "모집이 아니라 준비까지",
    description:
      "참가 인원, Riot 계정, 선호 포지션과 준비 상태를 한 화면에서 확인합니다. 시작을 막는 조건이 먼저 보입니다.",
    accent: "text-amber-300",
    glow: "from-amber-400/20",
  },
  {
    index: "02",
    icon: Scale,
    title: "감이 아니라 데이터로 편성",
    description:
      "경매·스네이크·자동 밸런스·자유 선택. 티어와 포지션 데이터를 바탕으로 내전에 맞는 팀을 만듭니다.",
    accent: "text-violet-300",
    glow: "from-violet-500/25",
  },
  {
    index: "03",
    icon: Trophy,
    title: "끝난 경기도 운영 자산으로",
    description:
      "대진표, 결과, 전적과 방송 오버레이를 연결해 한 번의 내전을 다음 운영을 위한 기록으로 남깁니다.",
    accent: "text-cyan-300",
    glow: "from-cyan-400/20",
  },
];

const footerLinks = [
  { href: "/about", label: "서비스 소개" },
  { href: "/resources", label: "자료실" },
  { href: "/guide", label: "이용 가이드" },
  { href: "/community", label: "커뮤니티" },
  { href: "/contact", label: "문의" },
  { href: "/privacy", label: "개인정보처리방침" },
  { href: "/terms", label: "이용약관" },
];

const landingNavLinks = [
  { href: "#operations", label: "서비스" },
  { href: "/tournaments", label: "내전방" },
  { href: "/community", label: "커뮤니티" },
];

const positions = ["TOP", "JGL", "MID", "BOT", "SUP"];

function OperationBoard() {
  return (
    <div className="relative mx-auto w-full max-w-[680px] lg:ml-auto">
      <div
        aria-hidden="true"
        className="absolute -inset-12 -z-10 rounded-full bg-violet-500/15 blur-[90px]"
      />

      <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#111217]/95 shadow-[0_40px_120px_rgba(0,0,0,0.55)]">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-violet-400/25 bg-violet-500/10">
              <Swords className="h-4 w-4 text-violet-300" />
            </div>
            <div>
              <p className="text-[10px] font-semibold tracking-[0.2em] text-white/35">
                MATCH CONTROL
              </p>
              <p className="mt-0.5 text-sm font-semibold text-white">금요일 밤 5:5 내전</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-1.5 text-[11px] font-semibold text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
            모집 중
          </div>
        </div>

        <div className="grid gap-4 p-4 sm:p-6 md:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-white/40">참가 준비</p>
                <p className="mt-1 text-3xl font-bold tracking-tight text-white">
                  8<span className="text-white/25"> / 10</span>
                </p>
              </div>
              <span className="text-xs font-semibold text-amber-300">2명 남음</span>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full w-4/5 rounded-full bg-gradient-to-r from-violet-500 via-indigo-400 to-cyan-300" />
            </div>

            <div className="mt-5 space-y-2.5">
              {[
                ["Riot 계정 연동", "8 / 8", true],
                ["포지션 선택", "8 / 8", true],
                ["Discord 음성", "6 / 8", false],
              ].map(([label, value, ready]) => (
                <div
                  key={String(label)}
                  className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full ${
                        ready ? "bg-emerald-400/15 text-emerald-300" : "bg-amber-400/15 text-amber-300"
                      }`}
                    >
                      {ready ? <Check className="h-3 w-3" /> : <CircleDot className="h-3 w-3" />}
                    </span>
                    <span className="text-xs text-white/65">{label}</span>
                  </div>
                  <span className="text-xs font-medium tabular-nums text-white/40">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex-1 rounded-2xl border border-white/[0.07] bg-gradient-to-br from-violet-500/[0.09] to-transparent p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold tracking-[0.18em] text-violet-300/70">
                    TEAM BUILDER
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">자동 밸런스</p>
                </div>
                <Scale className="h-5 w-5 text-violet-300" />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <p className="mb-2 text-[10px] font-bold text-cyan-300">BLUE</p>
                  {positions.map((position) => (
                    <div
                      key={`blue-${position}`}
                      className="rounded-lg border border-cyan-300/10 bg-cyan-300/[0.05] px-2 py-1.5 text-[10px] text-white/55"
                    >
                      {position}
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <p className="mb-2 text-[10px] font-bold text-rose-300">RED</p>
                  {positions.map((position) => (
                    <div
                      key={`red-${position}`}
                      className="rounded-lg border border-rose-300/10 bg-rose-300/[0.05] px-2 py-1.5 text-[10px] text-white/55"
                    >
                      {position}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#5865F2]/15 text-[#8d96ff]">
                <Bot className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white">Discord 연결 준비</p>
                <p className="mt-0.5 truncate text-[10px] text-white/35">팀 확정 후 음성 채널 자동 생성</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 border-t border-white/[0.07] bg-black/20">
          {[
            ["MODE", "자동 밸런스"],
            ["FORMAT", "5 VS 5"],
            ["STATUS", "참가 가능"],
          ].map(([label, value]) => (
            <div key={label} className="border-r border-white/[0.06] px-4 py-3 last:border-r-0 sm:px-5">
              <p className="text-[9px] font-semibold tracking-[0.16em] text-white/25">{label}</p>
              <p className="mt-1 truncate text-[11px] font-medium text-white/65">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute -bottom-5 -left-3 hidden items-center gap-3 rounded-2xl border border-white/10 bg-[#18191f]/95 px-4 py-3 shadow-2xl backdrop-blur md:flex">
        <ShieldCheck className="h-5 w-5 text-emerald-300" />
        <div>
          <p className="text-[10px] text-white/35">START CHECK</p>
          <p className="text-xs font-semibold text-white">시작 조건을 자동으로 확인 중</p>
        </div>
      </div>
    </div>
  );
}

export function LandingContentSections() {
  return (
    <>
      <section className="relative isolate overflow-hidden px-5 pb-20 pt-12 sm:px-6 md:pb-28 md:pt-20 lg:min-h-[calc(100vh-80px)] lg:py-20">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_15%_25%,rgba(102,126,234,0.18),transparent_32%),radial-gradient(circle_at_85%_65%,rgba(34,211,238,0.09),transparent_30%),linear-gradient(180deg,#0f0f0f_0%,#111117_100%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.3)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_90%)]"
        />

        <div className="mx-auto grid w-full max-w-[1480px] items-center gap-14 lg:grid-cols-[0.88fr_1.12fr] lg:gap-12">
          <div className="animate-fade-in">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              <span className="text-[10px] font-semibold tracking-[0.16em] text-white/55 sm:text-xs">
                CUSTOM MATCH OPERATIONS
              </span>
            </div>

            <h1 className="mt-7 max-w-[760px] text-[clamp(3rem,6.4vw,6.8rem)] font-black leading-[0.98] tracking-[-0.065em] text-white">
              내전 운영,
              <br />
              <span className="bg-gradient-to-r from-[#8da2ff] via-[#b89cff] to-[#70d9ec] bg-clip-text text-transparent">
                한곳에서
              </span>
              <br />
              끝까지.
            </h1>

            <p className="mt-7 max-w-xl text-base leading-7 text-white/55 sm:text-lg sm:leading-8">
              모집부터 팀 편성, 경기 기록까지. 흩어진 내전 운영을 하나의 흐름으로 연결합니다.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/auth/login"
                className="group inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-[#111217] transition-transform duration-200 hover:-translate-y-0.5"
              >
                내전 시작하기
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/tournaments"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-6 py-3.5 text-sm font-semibold text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                열린 내전 보기
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="animate-slide-up [animation-delay:120ms] [animation-fill-mode:both]">
            <OperationBoard />
          </div>
        </div>
      </section>

      <section className="border-y border-white/[0.07] bg-[#0b0c10] px-5 sm:px-6">
        <div className="mx-auto grid max-w-[1480px] grid-cols-2 divide-x divide-white/[0.07] md:grid-cols-4">
          {[
            ["01", "모집과 준비"],
            ["02", "팀 구성"],
            ["03", "로비와 경기"],
            ["04", "결과와 기록"],
          ].map(([number, label]) => (
            <div key={number} className="flex items-center gap-3 px-4 py-5 sm:px-7">
              <span className="text-[10px] font-bold text-violet-300/70">{number}</span>
              <span className="text-xs font-semibold text-white/55 sm:text-sm">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#efede7] px-5 py-24 text-[#151515] sm:px-6 md:py-36">
        <div className="mx-auto max-w-[1480px]">
          <p className="text-xs font-bold tracking-[0.18em] text-[#151515]/45">WHY NEXUS</p>
          <p className="mt-8 max-w-[1240px] text-[clamp(2.5rem,6vw,6.6rem)] font-black leading-[1.02] tracking-[-0.065em]">
            내전은 방을 만드는 순간이 아니라,
            <span className="text-[#5d63d8]"> 10명이 경기를 끝내는 순간</span> 완성됩니다.
          </p>
          <div className="mt-12 flex flex-col justify-between gap-8 border-t border-black/15 pt-6 md:flex-row md:items-start">
            <p className="max-w-xl text-base leading-7 text-black/55 md:text-lg">
              NEXUS는 참가자를 모으는 게시판을 넘어, 방장이 경기 전체를 끝까지 운영할 수 있는
              도구를 만듭니다.
            </p>
            <Link
              href="/about"
              className="group inline-flex w-fit items-center gap-3 text-sm font-bold"
            >
              NEXUS가 해결하는 문제
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#151515] text-white transition-transform group-hover:translate-x-1">
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          </div>
        </div>
      </section>

      <section id="operations" className="relative overflow-hidden bg-[#0f0f0f] px-5 py-24 sm:px-6 md:py-32">
        <div
          aria-hidden="true"
          className="absolute left-1/2 top-0 h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-violet-500/[0.08] blur-[140px]"
        />
        <div className="relative mx-auto max-w-[1480px]">
          <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
            <div>
              <p className="text-xs font-bold tracking-[0.18em] text-violet-300">OPERATIONS</p>
              <h2 className="mt-5 text-4xl font-black leading-[1.05] tracking-[-0.045em] text-white sm:text-5xl md:text-6xl">
                진행할수록
                <br />
                더 명확하게.
              </h2>
            </div>
            <p className="max-w-2xl text-base leading-7 text-white/45 lg:ml-auto lg:text-lg">
              단계마다 필요한 정보와 행동만 남깁니다. 참가자는 다음에 무엇을 해야 하는지 알고,
              방장은 무엇이 막혀 있는지 바로 확인합니다.
            </p>
          </div>

          <div className="mt-14 grid gap-4 lg:grid-cols-3">
            {operations.map((operation) => (
              <article
                key={operation.index}
                className="group relative min-h-[390px] overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#17181d] p-7 transition-transform duration-300 hover:-translate-y-1 md:p-9"
              >
                <div
                  aria-hidden="true"
                  className={`absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t ${operation.glow} to-transparent opacity-40 transition-opacity group-hover:opacity-70`}
                />
                <div className="relative flex h-full flex-col">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold tracking-[0.18em] text-white/25">
                      {operation.index}
                    </span>
                    <operation.icon className={`h-6 w-6 ${operation.accent}`} />
                  </div>
                  <div className="mt-auto pt-24">
                    <h3 className="text-2xl font-bold tracking-[-0.03em] text-white sm:text-3xl">
                      {operation.title}
                    </h3>
                    <p className="mt-5 text-sm leading-7 text-white/45">
                      {operation.description}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-white/[0.07] bg-[#0f0f0f] px-5 py-24 sm:px-6 md:py-32">
        <div className="relative mx-auto max-w-[1480px] overflow-hidden rounded-[32px] border border-violet-300/15 bg-[#191a22] px-6 py-14 sm:px-10 md:px-16 md:py-20">
          <div
            aria-hidden="true"
            className="absolute -right-24 -top-32 h-[420px] w-[420px] rounded-full bg-violet-500/25 blur-[100px]"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-40 left-1/3 h-[360px] w-[360px] rounded-full bg-cyan-400/10 blur-[100px]"
          />
          <div className="relative flex flex-col justify-between gap-10 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-bold tracking-[0.18em] text-violet-300">READY TO HOST</p>
              <h2 className="mt-5 max-w-4xl text-4xl font-black leading-[1.04] tracking-[-0.05em] text-white sm:text-5xl md:text-6xl">
                다음 내전은 채팅방이 아니라
                <br className="hidden sm:block" /> NEXUS에서 시작하세요.
              </h2>
            </div>
            <Link
              href="/auth/login"
              className="group inline-flex flex-shrink-0 items-center justify-center gap-3 rounded-xl bg-white px-6 py-4 text-sm font-bold text-[#111217] transition-transform hover:-translate-y-0.5"
            >
              무료로 시작하기
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-[#0f0f0f] px-5 pb-12 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <AdSlotCard slotKey="landingMid" minHeight={120} />
        </div>
      </section>
    </>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-white/[0.07] bg-[#0b0c10] px-5 py-10 sm:px-6">
      <div className="mx-auto flex max-w-[1480px] flex-col gap-7 text-sm text-white/35">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <Logo size="sm" />
            <p className="mt-3 max-w-md text-xs leading-5 text-white/30">
              롤 내전을 만들고, 진행하고, 기록하는 운영 플랫폼입니다.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            {footerLinks.map((link) => (
              <Link key={link.href} href={link.href} className="transition-colors hover:text-white/70">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="border-t border-white/[0.06] pt-6 text-[11px] leading-5 text-white/20">
          Project Nexus isn&apos;t endorsed by Riot Games and doesn&apos;t reflect the views or opinions
          of Riot Games or anyone officially involved in producing or managing Riot Games properties.
          League of Legends and Riot Games are trademarks or registered trademarks of Riot Games, Inc.
        </p>
      </div>
    </footer>
  );
}

function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#0f0f0f]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-[1480px] items-center gap-3 px-5 sm:px-6 md:gap-5">
        <Link href="/" className="flex flex-shrink-0 items-center" aria-label="Nexus 홈">
          <Logo size="sm" />
        </Link>

        <nav aria-label="랜딩 페이지 주요 메뉴" className="hidden min-w-0 flex-1 md:block">
          <div className="flex items-center justify-center gap-1">
            {landingNavLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-white/45 transition-colors hover:bg-white/[0.05] hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/auth/login"
            className="flex-shrink-0 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#111217] transition-colors hover:bg-white/90"
          >
            시작하기
          </Link>
          <LandingMobileNav links={landingNavLinks} />
        </div>
      </div>
    </header>
  );
}

export default function LandingContent() {
  return (
    <main className="min-h-screen overflow-x-clip bg-[#0f0f0f]">
      <LandingHeader />
      <LandingContentSections />
      <LandingFooter />
    </main>
  );
}
