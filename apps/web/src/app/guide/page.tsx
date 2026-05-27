import type { Metadata } from "next";
import Link from "next/link";
import {
  Gavel,
  Scale,
  MessageSquare,
  Bot,
  Trophy,
  Shield,
  BarChart3,
  ArrowRight,
} from "lucide-react";
import { absoluteUrl } from "@/lib/seo";
import { NEXUS_DISCORD_INVITE_URL } from "@/lib/constants";

// ─────────────────────────────────────────────────────────────────────────────
// 기능 가이드 — SEO + 소개형 랜딩
// 서버 컴포넌트(정적)로 항상 SSR HTML에 포함되어 검색엔진이 본문을 읽을 수 있다.
// 틈새 키워드(롤 내전 사이트·경매 드래프트·자동 밸런싱·디스코드 내전 봇 등)를
// H1/H2/본문에 자연스럽게 배치하고, 핵심 페이지로 내부 링크를 연결한다.
// ─────────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "롤 내전 사이트 사용법 — 경매·자동 밸런싱·디스코드 봇 가이드",
  description:
    "롤 내전을 경매 드래프트와 자동 밸런싱으로 운영하고, 디스코드 봇으로 음성 자동 이동·결과 기록까지 자동화하는 방법. Nexus의 내전 기능과 초기 세팅을 한눈에 정리한 가이드입니다.",
  alternates: {
    canonical: absoluteUrl("/guide"),
  },
  openGraph: {
    title: "롤 내전 사이트 사용법 — Nexus 기능 가이드",
    description:
      "경매 드래프트·자동 밸런싱·디스코드 봇 연동까지, 롤 내전을 제대로 운영하는 방법을 Nexus 가이드에서 확인하세요.",
    url: absoluteUrl("/guide"),
  },
};

// FAQ 구조화 데이터(FAQPage) — 검색 결과 리치 스니펫 노출 가능성을 높인다.
const faqItems = [
  {
    q: "롤 내전 사이트 Nexus는 무엇인가요?",
    a: "Nexus는 리그 오브 레전드 내전을 경매 드래프트·스네이크 드래프트로 팀을 구성하고, 자동 밸런싱과 디스코드 봇 연동으로 진행·기록까지 자동화하는 롤 내전 운영 사이트입니다.",
  },
  {
    q: "내전 팀은 어떻게 구성하나요?",
    a: "경매 드래프트(팀장이 포인트로 선수를 입찰)와 스네이크 드래프트 두 가지 방식을 지원합니다. 티어 기반 자동 밸런싱으로 양 팀 전력을 맞출 수도 있습니다.",
  },
  {
    q: "디스코드 봇은 어떻게 추가하나요?",
    a: "설정 페이지의 '내 디스코드 서버에 봇 추가'에서 봇을 설치하고 관리자 승인을 받으면, 방 생성 시 해당 서버를 선택해 내전 음성 채널 자동 생성과 결과 기록을 사용할 수 있습니다.",
  },
  {
    q: "내전 전적도 볼 수 있나요?",
    a: "네. 내전 전적 검색에서 소환사별 매치 기록·KDA·승패·챔피언 픽을 확인하고, 내전 랭킹과 클랜 기능까지 함께 이용할 수 있습니다.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqItems.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export default function GuidePage() {
  return (
    <div className="flex-grow">
      {/* FAQ 구조화 데이터 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <div className="max-w-4xl mx-auto px-4 py-10 md:px-6 md:py-16">
        {/* ── 히어로 ── */}
        <header className="mb-12 md:mb-16">
          <p className="text-sm font-medium text-accent-primary mb-2">기능 가이드</p>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-text-primary leading-tight">
            롤 내전, 엑셀·눈치 게임 없이
            <br className="hidden sm:block" /> 경매·자동 밸런싱·디스코드 봇으로
          </h1>
          <p className="mt-4 text-sm md:text-lg text-text-secondary leading-relaxed">
            Nexus는 리그 오브 레전드 내전을 운영하는 팀을 위한 롤 내전 사이트입니다.
            경매 드래프트로 팀을 짜고, 티어 기반 자동 밸런싱으로 전력을 맞추고,
            디스코드 봇으로 음성 이동과 결과 기록까지 자동화합니다. 아래에서
            기능별 사용법과 초기 세팅을 확인하세요.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/tournaments"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent-primary hover:bg-accent-hover text-white font-semibold transition-colors"
            >
              롤 내전 방 보러가기
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href={NEXUS_DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-bg-tertiary hover:bg-bg-elevated text-text-primary font-semibold transition-colors"
            >
              Discord 참여
            </a>
          </div>
        </header>

        {/* ── 경매 드래프트 ── */}
        <GuideSection
          icon={<Gavel className="h-6 w-6" />}
          title="경매 드래프트로 팀 구성"
        >
          <p>
            <strong className="text-text-primary">롤 내전 경매</strong>는 팀장이 정해진
            포인트로 참가자를 입찰해 팀을 꾸리는 방식입니다. 누구를 얼마에 데려올지
            결정하는 순간부터가 이미 게임입니다. 실시간 입찰·타이머·자동 입찰을
            지원해, 단순 추첨보다 훨씬 몰입감 있는 팀 구성이 가능합니다.
          </p>
          <ul className="mt-3 space-y-1.5 list-disc pl-5 text-text-secondary">
            <li>팀장별 포인트 한도 내 실시간 입찰</li>
            <li>입찰 타이머와 자동 입찰로 빠른 진행</li>
            <li>경매 결과 그대로 팀 확정 → 바로 경기</li>
          </ul>
          <SectionLink href="/tournaments" label="경매 내전 방 만들기" />
        </GuideSection>

        {/* ── 스네이크 드래프트 / 자동 밸런싱 ── */}
        <GuideSection
          icon={<Scale className="h-6 w-6" />}
          title="스네이크 드래프트 · 자동 밸런싱"
        >
          <p>
            경매가 부담스럽다면 <strong className="text-text-primary">스네이크 드래프트</strong>로
            순서대로 선수를 지명하거나, <strong className="text-text-primary">티어 기반 자동 밸런싱</strong>으로
            양 팀 전력을 자동으로 맞출 수 있습니다. 한쪽만 터지는 내전은 이제 그만.
          </p>
          <ul className="mt-3 space-y-1.5 list-disc pl-5 text-text-secondary">
            <li>스네이크 방식 순차 지명으로 공정한 팀 분배</li>
            <li>티어·포지션을 고려한 자동 밸런싱</li>
            <li>역할(라인) 선택까지 한 흐름으로 진행</li>
          </ul>
          <SectionLink href="/tournaments" label="내전 방 둘러보기" />
        </GuideSection>

        {/* ── 디스코드 연동 ── */}
        <GuideSection
          icon={<MessageSquare className="h-6 w-6" />}
          title="디스코드 연동"
        >
          <p>
            Nexus는 디스코드 계정으로 로그인하고, 내전 진행을 디스코드와 연결합니다.
            팀이 확정되면 음성 채널 자동 이동, 경기 결과 기록까지 디스코드에서
            &lsquo;딸깍&rsquo; 처리됩니다. 운영자는 진행에, 참가자는 게임에만 집중하세요.
          </p>
          <SectionLink href="/auth/login" label="Discord로 시작하기" />
        </GuideSection>

        {/* ── 디스코드 봇 추가 및 초기 세팅 ── */}
        <GuideSection
          icon={<Bot className="h-6 w-6" />}
          title="디스코드 내전 봇 추가 방법 · 초기 세팅"
        >
          <p>
            내 서버에서 음성 자동 이동·결과 기록을 쓰려면 Nexus 봇을 추가해야 합니다.
            아래 순서대로 진행하면 됩니다.
          </p>
          <ol className="mt-4 space-y-3">
            <SetupStep n={1} title="디스코드로 로그인">
              우측 상단에서 디스코드 계정으로 로그인합니다.
            </SetupStep>
            <SetupStep n={2} title="설정에서 ‘봇 추가하기’">
              <Link href="/settings" className="text-accent-primary hover:underline">설정</Link>
              {" "}페이지의 &lsquo;내 디스코드 서버에 봇 추가&rsquo;에서 봇 추가하기를 누르고,
              봇을 설치할 서버를 선택합니다. (서버 관리 권한 필요)
            </SetupStep>
            <SetupStep n={3} title="관리자 승인 대기">
              봇을 추가하면 &lsquo;승인 대기&rsquo; 상태로 등록됩니다. Nexus 관리자가 승인하면
              해당 서버에서 내전 채널이 활성화됩니다.
            </SetupStep>
            <SetupStep n={4} title="방 생성 시 서버 선택">
              승인이 완료되면 내전 방을 만들 때 해당 디스코드 서버를 선택할 수 있고,
              내전 시작 시 음성 채널이 자동으로 생성·배정됩니다.
            </SetupStep>
          </ol>
          <SectionLink href="/settings" label="설정에서 봇 추가하기" />
        </GuideSection>

        {/* ── 전적 · 클랜 · 랭킹 ── */}
        <GuideSection
          icon={<BarChart3 className="h-6 w-6" />}
          title="내전 전적 · 클랜 · 랭킹"
        >
          <p>
            내전을 거듭할수록 기록이 쌓입니다.{" "}
            <Link href="/matches" className="text-accent-primary hover:underline">롤 내전 전적 검색</Link>
            에서 소환사별 매치 기록·KDA·승패·챔피언 픽을 확인하고,{" "}
            <Link href="/ranking" className="text-accent-primary hover:underline">내전 랭킹</Link>
            으로 승률·판수 기준 순위를 겨뤄보세요.{" "}
            <Link href="/clans" className="text-accent-primary hover:underline">클랜</Link>
            을 만들어 고정 멤버와 꾸준히 스크림을 운영할 수도 있습니다.
          </p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <MiniCard icon={<Trophy className="h-5 w-5" />} href="/matches" title="내전 전적" desc="매치·KDA·승패 기록" />
            <MiniCard icon={<BarChart3 className="h-5 w-5" />} href="/ranking" title="내전 랭킹" desc="승률·판수 순위" />
            <MiniCard icon={<Shield className="h-5 w-5" />} href="/clans" title="클랜" desc="고정 팀·스크림 운영" />
          </div>
        </GuideSection>

        {/* ── FAQ ── */}
        <section className="mt-12 md:mt-16">
          <h2 className="text-xl md:text-2xl font-bold text-text-primary mb-5">자주 묻는 질문</h2>
          <div className="space-y-3">
            {faqItems.map((item) => (
              <div
                key={item.q}
                className="rounded-xl border border-bg-tertiary bg-bg-secondary/50 p-4 md:p-5"
              >
                <h3 className="font-semibold text-text-primary">{item.q}</h3>
                <p className="mt-2 text-sm md:text-base text-text-secondary leading-relaxed">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 하단 CTA ── */}
        <section className="mt-12 md:mt-16 rounded-2xl border border-accent-primary/30 bg-accent-primary/5 p-6 md:p-8 text-center">
          <h2 className="text-xl md:text-2xl font-bold text-text-primary">
            지금 바로 롤 내전을 시작하세요
          </h2>
          <p className="mt-2 text-sm md:text-base text-text-secondary">
            경매 드래프트와 자동 밸런싱으로 제대로 된 한 판.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 justify-center">
            <Link
              href="/tournaments"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-accent-primary hover:bg-accent-hover text-white font-semibold transition-colors"
            >
              내전 방 보러가기
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href={NEXUS_DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-bg-tertiary hover:bg-bg-elevated text-text-primary font-semibold transition-colors"
            >
              Discord 커뮤니티 참여
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

// ── 섹션 래퍼 ──
function GuideSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="py-6 md:py-8 border-t border-bg-tertiary first-of-type:border-t-0">
      <h2 className="flex items-center gap-2.5 text-lg md:text-2xl font-bold text-text-primary mb-3">
        <span className="text-accent-primary">{icon}</span>
        {title}
      </h2>
      <div className="text-sm md:text-base text-text-secondary leading-relaxed">
        {children}
      </div>
    </section>
  );
}

// ── 섹션 하단 링크 ──
function SectionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent-primary hover:underline"
    >
      {label}
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

// ── 봇 세팅 단계 ──
function SetupStep({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-accent-primary/15 text-accent-primary font-bold text-sm flex items-center justify-center">
        {n}
      </span>
      <div>
        <p className="font-semibold text-text-primary">{title}</p>
        <p className="text-sm text-text-secondary mt-0.5">{children}</p>
      </div>
    </li>
  );
}

// ── 하단 미니 카드 ──
function MiniCard({
  icon,
  href,
  title,
  desc,
}: {
  icon: React.ReactNode;
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-xl border border-bg-tertiary bg-bg-secondary/50 p-4 hover:border-accent-primary/40 transition-colors"
    >
      <span className="text-accent-primary">{icon}</span>
      <span className="font-semibold text-text-primary mt-1">{title}</span>
      <span className="text-xs text-text-tertiary">{desc}</span>
    </Link>
  );
}
