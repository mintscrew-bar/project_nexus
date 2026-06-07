// 비로그인·검색봇용 랜딩 콘텐츠 — 서버 컴포넌트로 항상 SSR HTML에 포함된다.
// (HomeAuthOverlay의 로딩 게이트 밖에 두어 봇이 본문 텍스트를 읽을 수 있게 함)
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  ClipboardList,
  Gavel,
  MessageSquare,
  Scale,
  ShieldCheck,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { HeroBanner } from "@/components/home/HeroBanner";
import { DiscordBanner } from "@/components/home/DiscordBanner";
import { AdSlotCard } from "@/components/ads/AdSlot";

const featureCards: Array<{
  icon: LucideIcon;
  title: string;
  description: string;
}> = [
  {
    icon: Gavel,
    title: "경매 드래프트",
    description:
      "방장이 시작 포인트와 입찰 시간을 정하면 팀장이 참가자를 직접 낙찰합니다. 포인트 흐름과 남은 매물이 한 화면에 남아, 디스코드 채팅으로 가격을 다시 확인할 필요가 없습니다.",
  },
  {
    icon: Scale,
    title: "자동 밸런싱",
    description:
      "참가자의 티어, LP, 선호 포지션을 참고해 한쪽으로 치우친 팀 구성을 줄입니다. 인원이 모두 준비되면 방장이 바로 팀 편성을 확정할 수 있습니다.",
  },
  {
    icon: MessageSquare,
    title: "Discord 연동",
    description:
      "계정 연동, 참가 확인, 음성 채널 이동, 봇 명령어를 내전 흐름에 맞춰 연결합니다. 운영자는 호출을 줄이고 참가자는 어디로 들어가야 하는지 빠르게 확인합니다.",
  },
];

const workflowCards: Array<{
  icon: LucideIcon;
  title: string;
  body: string;
}> = [
  {
    icon: ClipboardList,
    title: "모집과 준비 상태를 분리",
    body:
      "참가자, 관전자, 준비 완료 상태를 따로 관리합니다. 방장은 실제 경기 인원만 확인하고, 참가자는 로비에서 자신의 상태와 팀 이동 조건을 바로 볼 수 있습니다.",
  },
  {
    icon: Swords,
    title: "팀 구성 방식별 진행 화면",
    body:
      "경매, 스네이크, 자동 밸런스, 자유 팀 선택은 서로 다른 규칙을 사용합니다. Nexus는 각 모드의 시작 조건과 다음 단계 이동을 분리해 같은 방 안에서도 흐름이 섞이지 않게 설계합니다.",
  },
  {
    icon: Trophy,
    title: "경기 후 기록까지 연결",
    body:
      "대진표와 결과 입력, 내전 전적, 평점 기록을 이어서 남깁니다. 단순 모집 도구가 아니라 다음 내전의 밸런스와 회고에 사용할 수 있는 기록을 만드는 것이 목적입니다.",
  },
  {
    icon: ShieldCheck,
    title: "정책과 신뢰 정보 공개",
    body:
      "개인정보처리방침, 이용약관, Riot Games 고지, 커뮤니티 운영 기준을 공개 페이지에서 확인할 수 있게 정리합니다. 신규 방문자가 가입 전에 서비스 범위를 판단할 수 있습니다.",
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
    href: "/matches",
    icon: BarChart3,
    title: "내전 전적",
    description:
      "소환사와 Nexus 유저 기준으로 내전 기록, KDA, 챔피언 사용 흐름을 확인합니다.",
  },
  {
    href: "/about",
    icon: Users,
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
  { href: "/privacy", label: "개인정보처리방침" },
  { href: "/terms", label: "이용약관" },
];

const landingNavLinks = [
  { href: "/about", label: "소개" },
  { href: "/resources", label: "자료실" },
  { href: "/guide", label: "가이드" },
  { href: "/tournaments", label: "내전방" },
  { href: "/community", label: "커뮤니티" },
];

// 로그인 후에도 재사용 가능한 랜딩 콘텐츠 섹션들 (서버 컴포넌트)
export function LandingContentSections() {
  return (
    <>
      {/* Discord 배너 */}
      <section className="px-6 py-6">
        <div className="max-w-6xl mx-auto">
          <DiscordBanner />
        </div>
      </section>

      <section id="features" className="py-16 md:py-32 px-6">
        <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-center text-text-primary mb-10 md:mb-16">
          엑셀로 하던 내전,{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(135deg, #8b5cf6, #6366f1, #d946ef)" }}
          >
            이제 그만할 때
          </span>
          {" "}됐잖아요.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10 max-w-6xl mx-auto">
          {featureCards.map((feature) => (
            <article
              key={feature.title}
              className="group flex flex-col items-center text-center p-6 md:p-10 rounded-lg bg-bg-secondary/50 border border-bg-tertiary hover:border-violet-500/30 transition-all duration-300 hover:scale-[1.02]"
            >
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary md:h-16 md:w-16">
                <feature.icon className="h-8 w-8 md:h-9 md:w-9" />
              </div>
              <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-text-primary mb-3">
                {feature.title}
              </h3>
              <p className="text-sm md:text-base text-text-secondary leading-relaxed">
                {feature.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="px-6 pb-16 md:pb-28">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 max-w-3xl">
            <p className="text-sm font-semibold text-accent-primary">내전 운영 흐름</p>
            <h2 className="mt-2 text-2xl sm:text-3xl md:text-4xl font-bold text-text-primary">
              모집, 팀 구성, 경기 결과가 끊기지 않게
            </h2>
            <p className="mt-4 text-sm md:text-lg leading-relaxed text-text-secondary">
              Nexus는 단순히 방 목록만 보여주는 사이트가 아닙니다. 내전 운영자가
              매번 반복하던 참가 확인, 팀장 선정, 포지션 정리, 결과 기록을 하나의
              공개된 흐름으로 묶어 신규 방문자도 어떤 서비스인지 이해할 수 있게
              설명하고 기록합니다.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {workflowCards.map((card) => (
              <article
                key={card.title}
                className="rounded-lg border border-bg-tertiary bg-bg-secondary/50 p-5 md:p-6"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-bg-tertiary text-accent-primary">
                    <card.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary">
                      {card.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                      {card.body}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-bg-tertiary bg-bg-secondary/30 px-6 py-14 md:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 max-w-3xl">
            <p className="text-sm font-semibold text-accent-primary">공개 자료</p>
            <h2 className="mt-2 text-2xl sm:text-3xl md:text-4xl font-bold text-text-primary">
              가입 전에 읽을 수 있는 Nexus 자료
            </h2>
            <p className="mt-4 text-sm md:text-lg leading-relaxed text-text-secondary">
              처음 방문한 사용자와 검색 로봇이 서비스의 목적, 사용 방법, 운영
              기준을 확인할 수 있도록 정적 콘텐츠를 별도로 제공합니다. 내전
              참여 전에도 충분한 정보를 얻을 수 있게 내부 링크를 연결했습니다.
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

      <section className="px-6 pb-16 md:pb-32">
        <div className="mx-auto max-w-6xl pt-16 md:pt-28">
          <div className="mb-8 md:mb-10 max-w-3xl">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-text-primary">
              롤 내전, 전적, 스크림을 한 흐름으로 관리
            </h2>
            <p className="mt-4 text-sm md:text-lg leading-relaxed text-text-secondary">
              Nexus는 리그 오브 레전드 내전과 스크림을 운영하는 팀을 위해
              참가자 모집, 팀 밸런싱, 경기 기록, 롤 전적 확인, 챔피언 통계
              분석을 연결합니다.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <article className="rounded-lg border border-bg-tertiary bg-bg-secondary/50 p-6">
              <h3 className="text-xl font-semibold text-text-primary">롤 내전 운영</h3>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                디스코드 기반 참가, 팀 구성, 경매 드래프트, 자유 팀 선택,
                결과 기록까지 내전 진행에 필요한 과정을 한곳에서 처리합니다.
                방장은 시작 조건을 확인하고 참가자는 다음 단계로 넘어가는
                이유를 화면에서 확인할 수 있습니다.
              </p>
            </article>

            <article className="rounded-lg border border-bg-tertiary bg-bg-secondary/50 p-6">
              <h3 className="text-xl font-semibold text-text-primary">롤 전적 분석</h3>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                내전 기록과 랭크 기록을 구분해 챔피언 승률, 포지션, KDA,
                장인 빌드 흐름을 비교할 수 있습니다. 경기 후 평점과 결과를
                남기면 단발성 게임이 아니라 커뮤니티가 참고할 수 있는 기록으로
                쌓입니다.
              </p>
            </article>

            <article className="rounded-lg border border-bg-tertiary bg-bg-secondary/50 p-6">
              <h3 className="text-xl font-semibold text-text-primary">롤 스크림 관리</h3>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                고정 팀, 클랜, 커뮤니티 스크림에서 반복되는 매칭과 기록
                관리를 줄이고 다음 경기 준비에 집중할 수 있게 돕습니다. 클랜과
                커뮤니티 페이지를 통해 함께 경기할 사람을 찾는 흐름도 연결합니다.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="px-6 pb-12">
        <div className="mx-auto max-w-4xl">
          <AdSlotCard slotKey="landingMid" minHeight={120} />
        </div>
      </section>

      <LandingFooter />
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
      <HeroBanner />
      <LandingContentSections />
    </main>
  );
}

function LandingHeader() {
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
          className="min-w-0 flex-1 overflow-x-auto scrollbar-none"
        >
          <div className="flex min-w-max items-center justify-start gap-1 px-1 md:justify-center">
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

        <Link
          href="/auth/login"
          className="flex-shrink-0 rounded-lg bg-accent-primary px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover md:px-4"
        >
          시작하기
        </Link>
      </div>
    </header>
  );
}
