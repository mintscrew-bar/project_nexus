// 비로그인·검색봇용 랜딩 콘텐츠 — 서버 컴포넌트로 항상 SSR HTML에 포함된다.
// (HomeAuthOverlay의 로딩 게이트 밖에 두어 봇이 본문 텍스트를 읽을 수 있게 함)
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BookOpen,
  ClipboardList,
  Gavel,
  MessageSquare,
  Radio,
  Scale,
  Swords,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { LandingBannerCarousel } from "@/components/home/LandingBannerCarousel";
import { AdSlotCard } from "@/components/ads/AdSlot";
import { LandingMobileNav } from "./LandingMobileNav";

const featureCards: Array<{
  icon: LucideIcon;
  title: string;
  description: string;
}> = [
  {
    icon: Gavel,
    title: "방을 열고 참가자를 모읍니다",
    description:
      "정원, 관전, 팀 구성 방식을 먼저 정한 뒤 준비 상태로 실제 참가자를 확인합니다. 방장은 시작을 막는 조건을 로비에서 바로 볼 수 있습니다.",
  },
  {
    icon: Scale,
    title: "상황에 맞게 팀을 구성합니다",
    description:
      "경매·스네이크·자동 밸런스·자유 팀 선택 중 내전 목적에 맞는 방식을 고릅니다. 티어, LP, 선호 포지션과 역할 배치를 한 흐름으로 확인합니다.",
  },
  {
    icon: MessageSquare,
    title: "경기 뒤에도 기록을 남깁니다",
    description:
      "대진표, 결과, 전적과 회고를 다음 내전 준비에 활용합니다. Discord 음성 채널과 방송 오버레이도 운영 흐름 안에서 연결할 수 있습니다.",
  },
];

const resourceLinks: Array<{
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}> = [
  {
    href: "/guide",
    icon: BookOpen,
    title: "기능 가이드",
    description:
      "방 만들기, 팀 구성 방식, 역할 선택, 대진표, 디스코드 봇 명령어를 순서대로 설명합니다.",
  },
  {
    href: "/resources",
    icon: ClipboardList,
    title: "운영 자료실",
    description:
      "내전 운영 체크리스트, 모드 선택 기준, 결과 기록 기준을 공개 문서로 정리했습니다.",
  },
  {
    href: "/resources/obs-broadcast-overlay-guide",
    icon: Radio,
    title: "방송 오버레이 가이드",
    description:
      "OBS 브라우저 소스 등록, 방 자동 추종, 장면 조작과 토큰 보안 절차를 안내합니다.",
  },
  {
    href: "/about",
    icon: Swords,
    title: "서비스 소개",
    description:
      "Nexus가 어떤 문제를 해결하는지, 어떤 데이터를 다루는지, Riot Games와의 관계를 안내합니다.",
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
  { href: "/about", label: "소개" },
  { href: "/resources", label: "자료실" },
  { href: "/guide", label: "가이드" },
  { href: "/contact", label: "문의" },
  { href: "/tournaments", label: "내전방" },
  { href: "/community", label: "커뮤니티" },
];

// 비로그인 사용자에게만 필요한 히어로와 배너.
export function LandingIntro() {
  return (
    <>
      {/* 모바일 전용 히어로 — 배너보다 먼저 핵심 가치와 CTA를 노출 */}
      <section className="md:hidden px-6 pt-8 pb-4">
        <h1 className="text-3xl font-extrabold text-text-primary leading-tight">
          롤 내전 운영의{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(135deg, #8b5cf6, #6366f1, #d946ef)" }}
          >
            모든 것
          </span>
          , Nexus
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          팀 구성, 경매 드래프트, 전적 기록까지 — 디스코드 채팅 없이 한 화면에서.
        </p>
        <div className="mt-5 flex gap-3">
          <Link
            href="/auth/login"
            className="rounded-lg bg-accent-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            무료로 시작하기
          </Link>
          <Link
            href="/tournaments"
            className="rounded-lg border border-bg-tertiary bg-bg-secondary px-4 py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary"
          >
            내전방 보기
          </Link>
        </div>
      </section>

      {/* 배너 캐러셀 */}
      <section className="px-6 py-6">
        <div className="mx-auto max-w-6xl">
          <LandingBannerCarousel />
        </div>
      </section>
    </>
  );
}

// 로그인 여부와 관계없이 재사용하는 랜딩 콘텐츠 섹션들 (서버 컴포넌트)
export function LandingContentSections() {
  return (
    <>
      <section
        id="features"
        className="px-6 py-16 [content-visibility:auto] [contain-intrinsic-size:auto_700px] md:py-24"
      >
        <div className="mx-auto max-w-6xl">
          <p className="text-center text-sm font-semibold text-accent-primary">NEXUS로 하는 내전 운영</p>
          <h2 className="mt-2 text-center text-2xl font-bold text-text-primary sm:text-3xl md:text-5xl">
          엑셀로 하던 내전,{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(135deg, #8b5cf6, #6366f1, #d946ef)" }}
          >
            이제 그만할 때
          </span>
          {" "}됐잖아요.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-center text-sm leading-relaxed text-text-secondary md:text-base">
            모집부터 팀 확정, 경기 기록까지 단계마다 필요한 정보만 남겨 다음 진행을 쉽게 만듭니다.
          </p>
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
          {featureCards.map((feature) => (
            <article
              key={feature.title}
              className="group rounded-xl border border-bg-tertiary bg-bg-secondary/50 p-6 transition-colors hover:border-accent-primary/40"
            >
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-text-primary">
                {feature.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                {feature.description}
              </p>
            </article>
          ))}
        </div>
        </div>
      </section>

      <section className="border-y border-bg-tertiary bg-bg-secondary/30 px-6 py-14 [content-visibility:auto] [contain-intrinsic-size:auto_720px] md:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 max-w-3xl">
            <p className="text-sm font-semibold text-accent-primary">공개 자료</p>
            <h2 className="mt-2 text-2xl sm:text-3xl md:text-4xl font-bold text-text-primary">
              가입 전에 읽을 수 있는 Nexus 자료
            </h2>
            <p className="mt-4 text-sm md:text-lg leading-relaxed text-text-secondary">
              처음 방문한 사용자도 서비스의 목적, 사용 방법, 운영 기준을 확인할
              수 있도록 운영 자료를 공개합니다. 내전 참여 전에도 필요한 정보를
              충분히 비교하고 판단할 수 있게 관련 문서를 연결했습니다.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {resourceLinks.map((resource) => (
              <Link
                key={resource.href}
                href={resource.href}
                className="group rounded-lg border border-bg-tertiary bg-bg-primary/80 p-5 transition-colors hover:border-accent-primary/40 hover:bg-bg-secondary"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
                    <resource.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
                      {resource.title}
                      <ArrowRight className="h-4 w-4 flex-shrink-0 transition-transform group-hover:translate-x-0.5" />
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                      {resource.description}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16 [content-visibility:auto] [contain-intrinsic-size:auto_360px] md:py-24">
        <div className="mx-auto max-w-6xl rounded-2xl border border-accent-primary/20 bg-accent-primary/5 p-6 md:p-10">
          <p className="text-sm font-semibold text-accent-primary">처음이라면 이렇게 시작하세요</p>
          <div className="mt-4 grid gap-6 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div>
              <h2 className="text-2xl font-bold text-text-primary">먼저 운영 기준을 정하고, 방을 열어 보세요.</h2>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">팀 구성 방식과 시작 조건이 익숙하지 않다면 운영 자료실에서 상황별 체크리스트를 확인할 수 있습니다.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/resources" className="rounded-lg border border-bg-tertiary bg-bg-secondary px-4 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-elevated">운영 자료실</Link>
              <Link href="/guide" className="rounded-lg border border-bg-tertiary bg-bg-secondary px-4 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-elevated">기능 가이드</Link>
            </div>
            <Link href="/auth/login" className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent-primary px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-accent-hover">내전 시작하기 <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>

      <section className="px-6 pb-12 [content-visibility:auto] [contain-intrinsic-size:auto_180px]">
        <div className="mx-auto max-w-4xl">
          <AdSlotCard slotKey="landingMid" minHeight={120} />
        </div>
      </section>

    </>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-bg-tertiary bg-bg-secondary px-6 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 text-sm text-text-tertiary">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-semibold text-text-secondary">Project Nexus</p>
            <p className="mt-1 text-xs leading-relaxed">
              롤 내전 운영, 전적 기록, 스크림 준비를 돕는 커뮤니티 플랫폼입니다.
            </p>
          </div>
          <nav className="flex flex-wrap gap-x-4 gap-y-2">
            {footerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="hover:text-text-secondary transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="text-xs leading-relaxed text-text-tertiary/70">
          Project Nexus isn&apos;t endorsed by Riot Games and doesn&apos;t reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. League of Legends and Riot Games are trademarks or registered trademarks of Riot Games, Inc.
        </p>
      </div>
    </footer>
  );
}

export default function LandingContent() {
  return (
    <main className="flex min-h-screen flex-col bg-bg-primary">
      <LandingHeader />
      <LandingIntro />
      <LandingContentSections />
      <LandingFooter />
    </main>
  );
}

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-bg-tertiary bg-bg-primary/95 backdrop-blur supports-[backdrop-filter]:bg-bg-primary/85">
      <div className="mx-auto flex h-20 max-w-6xl items-center gap-2 px-4 md:gap-4 md:px-6">
        <Link
          href="/"
          className="flex flex-shrink-0 items-center"
          aria-label="Nexus 홈"
        >
          <Logo size="sm" />
        </Link>

        <nav
          aria-label="랜딩 페이지 주요 메뉴"
          className="hidden min-w-0 flex-1 md:block"
        >
          <div className="flex items-center justify-center gap-1 px-1">
            {landingNavLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>

        <div className="flex flex-1 items-center justify-end gap-2 md:flex-none">
          <Link
            href="/auth/login"
            className="flex-shrink-0 rounded-lg bg-accent-primary px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover md:px-4"
          >
            시작하기
          </Link>
          {/* 모바일 전용 햄버거 — 데스크톱 nav가 숨겨지는 <md에서 전체 링크 노출 */}
          <LandingMobileNav links={landingNavLinks} />
        </div>
      </div>
    </header>
  );
}
