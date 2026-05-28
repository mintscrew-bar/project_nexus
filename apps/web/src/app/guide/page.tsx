import type { Metadata } from "next";
import Link from "next/link";
import {
  Gavel,
  ListOrdered,
  Scale,
  ArrowLeftRight,
  Users,
  CheckCircle2,
  MessageSquare,
  Bot,
  Trophy,
  Shield,
  BarChart3,
  ArrowRight,
} from "lucide-react";
import { absoluteUrl } from "@/lib/seo";
import { NEXUS_DISCORD_INVITE_URL } from "@/lib/constants";
import { GUIDE_TOC } from "@/lib/guide-toc";

// ─────────────────────────────────────────────────────────────────────────────
// 기능 가이드 — SEO + 소개형 랜딩
// 서버 컴포넌트(정적)로 항상 SSR HTML에 포함되어 검색엔진이 본문을 읽을 수 있다.
// 틈새 키워드(롤 내전 사이트·경매 드래프트·자동 밸런싱·디스코드 내전 봇 등)를
// H1/H2/본문에 자연스럽게 배치하고, 핵심 페이지로 내부 링크를 연결한다.
// ─────────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "롤 내전 사용법 — 경매·스네이크·자동 밸런스·자유 팀 선택 가이드",
  description:
    "Nexus에서 방을 만들고 경매, 스네이크 드래프트, 자동 밸런스, 자유 팀 선택으로 팀을 구성한 뒤 역할 선택, 대진표, 디스코드 봇 명령어까지 진행하는 방법을 안내합니다.",
  alternates: {
    canonical: absoluteUrl("/guide"),
  },
  openGraph: {
    title: "롤 내전 사이트 사용법 — Nexus 기능 가이드",
    description:
      "방 생성부터 네 가지 팀 구성 방식, 역할 선택, 대진표, 디스코드 봇 연동과 명령어까지 Nexus 내전 진행 방법을 확인하세요.",
    url: absoluteUrl("/guide"),
  },
};

// FAQ 구조화 데이터(FAQPage) — 검색 결과 리치 스니펫 노출 가능성을 높인다.
const faqItems = [
  {
    q: "롤 내전 사이트 Nexus는 무엇인가요?",
    a: "Nexus는 경매, 스네이크 드래프트, 자동 밸런스, 자유 팀 선택으로 내전 팀을 구성하고 역할 선택, 디스코드 음성 이동, 결과 기록까지 진행할 수 있는 롤 내전 운영 사이트입니다.",
  },
  {
    q: "내전 팀은 어떻게 구성하나요?",
    a: "방을 만들 때 경매 드래프트, 스네이크 드래프트, 자동 밸런스, 자유 팀 선택 중 하나를 고릅니다. 자동 밸런스는 티어·LP와 선호 포지션으로 자동 편성하고, 자유 팀 선택은 참가자가 로비에서 직접 팀으로 이동합니다.",
  },
  {
    q: "자동 밸런스와 자유 팀 선택은 언제 시작할 수 있나요?",
    a: "두 모드는 설정한 정원이 모두 차고 모든 플레이어가 준비되어야 시작할 수 있습니다. 자유 팀 선택은 추가로 모든 참가자가 팀을 고르고 각 팀에 5명씩 배정되어야 합니다.",
  },
  {
    q: "팀을 정한 다음에는 무엇을 하나요?",
    a: "어떤 팀 구성 방식을 선택해도 팀 확정 후 역할 선택 화면으로 이동합니다. 각 팀원은 겹치지 않는 라인을 선택하며, 시간이 끝날 때까지 선택하지 않으면 선호 포지션을 기준으로 자동 배정됩니다.",
  },
  {
    q: "대진표는 어떻게 만들어지나요?",
    a: "역할 선택이 끝나면 대진표로 이동합니다. 4팀·8팀 토너먼트는 팀 순서를 한 번 랜덤으로 섞어 첫 라운드 매칭을 만들고, 싱글 또는 더블 엘리미네이션 방식에 맞춰 다음 라운드가 자동으로 이어집니다.",
  },
  {
    q: "디스코드 봇은 어떻게 추가하나요?",
    a: "설정 페이지의 '내 디스코드 서버에 봇 추가'에서 봇을 설치하고 관리자 승인을 받으면, 방 생성 시 해당 서버를 선택해 내전 음성 채널 자동 생성과 결과 기록을 사용할 수 있습니다.",
  },
  {
    q: "디스코드 봇 명령어는 어디서 확인하나요?",
    a: "디스코드 서버에서 /nexus help를 입력하면 명령어 도움말을 볼 수 있습니다. 계정 연동은 /nexus link, 진행 중인 방과 대진표 확인은 /nexus rooms, /nexus bracket을 사용합니다.",
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
            내전 방 만들기부터 팀 구성,
            <br className="hidden sm:block" /> 역할 선택과 경기 시작까지
          </h1>
          <p className="mt-4 text-sm md:text-lg text-text-secondary leading-relaxed">
            방장은 인원과 팀 구성 방식을 선택해 방을 만들고, 참가자는 로비에서
            준비한 뒤 팀 구성과 역할 선택을 진행합니다. 경매, 스네이크 드래프트,
            자동 밸런스, 자유 팀 선택 중 상황에 맞는 방식을 고르는 방법과
            디스코드 연동·봇 명령어를 순서대로 확인하세요.
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

        {/* ── 목차 (앵커 이동) — 모바일 전용. 데스크톱은 좌측 사이드바가 담당 ── */}
        <nav
          aria-label="가이드 목차"
          className="md:hidden mb-8 rounded-xl border border-bg-tertiary bg-bg-secondary/50 p-4"
        >
          <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">
            목차
          </p>
          <ul className="flex flex-wrap gap-2">
            {GUIDE_TOC.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-tertiary hover:bg-accent-primary/15 hover:text-accent-primary text-sm text-text-secondary font-medium transition-colors"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* ── 방 만들기와 로비 준비 ── */}
        <GuideSection
          id="start"
          icon={<Users className="h-6 w-6" />}
          title="방 만들기와 로비 준비"
        >
          <p>
            <Link href="/tournaments" className="text-accent-primary hover:underline">내전 방</Link>
            {" "}목록에서 새 방을 만들거나 기존 방에 입장합니다. 방 생성 시 참가 인원,
            팀 구성 방식, 공개 여부, 관전 허용 여부와 디스코드 서버 연동을 정할 수 있습니다.
          </p>
          <ol className="mt-4 space-y-3">
            <SetupStep n={1} title="방 생성 설정">
              인원, 대진 방식, 아래의 팀 구성 방식 중 하나를 고릅니다. 필요하면
              비밀번호, 관전 허용, 승인된 디스코드 서버도 설정합니다.
            </SetupStep>
            <SetupStep n={2} title="참가와 준비">
              참가자는 플레이어로 참여해 준비 상태를 켭니다. 관전 허용 방에서는
              관전자로 전환할 수 있으며, 관전자는 팀 구성에 포함되지 않습니다.
            </SetupStep>
            <SetupStep n={3} title="방장이 내전 시작">
              준비 상태와 선택한 모드의 시작 조건을 충족하면 방장이 시작합니다.
              디스코드 음성 연동 방은 준비한 참가자가 음성 채널에 들어와 있어야 합니다.
            </SetupStep>
          </ol>
        </GuideSection>

        {/* ── 팀 구성 방식 선택 ── */}
        <GuideSection
          id="team-modes"
          icon={<Scale className="h-6 w-6" />}
          title="팀 구성 방식 선택"
        >
          <p>
            방장이 원하는 진행 방식에 따라 네 가지 모드 중 하나를 선택합니다.
            방장은 로비의 방 설정에서도 시작 전까지 팀 구성 방식을 바꿀 수 있습니다.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ModeCard
              icon={<Gavel className="h-5 w-5" />}
              title="경매 드래프트"
              summary="팀장이 포인트로 입찰"
            >
              시작 포인트, 최소 입찰 단위, 제한 시간과 팀장 선정 방식을 설정합니다.
            </ModeCard>
            <ModeCard
              icon={<ListOrdered className="h-5 w-5" />}
              title="스네이크 드래프트"
              summary="팀장이 번갈아 선수 지명"
            >
              팀장 선정 방식과 픽 제한 시간을 정하고 순서에 맞춰 직접 선택합니다.
            </ModeCard>
            <ModeCard
              icon={<Scale className="h-5 w-5" />}
              title="자동 밸런스"
              summary="티어·LP와 선호 포지션으로 자동 편성"
            >
              설정한 인원이 모두 참가하고 준비한 뒤 시작하면 밸런스와 랜덤성을 함께 고려해 팀이 바로 편성됩니다.
            </ModeCard>
            <ModeCard
              icon={<ArrowLeftRight className="h-5 w-5" />}
              title="자유 팀 선택"
              summary="참가자가 로비에서 직접 이동"
            >
              참가자가 팀 카드로 직접 이동하며, 모든 팀에 5명씩 채워야 시작할 수 있습니다.
            </ModeCard>
          </div>
          <SectionLink href="/tournaments" label="내전 방 둘러보기" />
        </GuideSection>

        {/* ── 경매 / 스네이크 이용법 ── */}
        <GuideSection
          id="draft"
          icon={<Gavel className="h-6 w-6" />}
          title="경매 · 스네이크 드래프트 진행 방법"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <ProcessBlock title="경매 드래프트">
              <li>방장이 고른 방식에 따라 팀장이 자동 선정되거나 직접 지정·자원 모집됩니다.</li>
              <li>팀장은 현재 선수, 남은 시간, 최고 입찰가와 사용 가능한 포인트를 확인합니다.</li>
              <li>증액 버튼으로 입찰 금액을 정해 입찰합니다. 남은 빈자리를 위한 예비 포인트는 사용할 수 없습니다.</li>
              <li>모든 선수가 배정되면 역할 선택 화면으로 이동합니다.</li>
            </ProcessBlock>
            <ProcessBlock title="스네이크 드래프트">
              <li>선정된 팀장들이 표시된 픽 순서에 따라 번갈아 선택합니다.</li>
              <li>내 차례가 되면 선택 가능한 플레이어를 고르고 선택 확정을 누릅니다.</li>
              <li>제한 시간 내 선택하지 않으면 자동 진행될 수 있으므로 타이머를 확인합니다.</li>
              <li>픽이 끝나면 역할 선택 화면으로 이동합니다.</li>
            </ProcessBlock>
          </div>
        </GuideSection>

        {/* ── 자동 / 자유 팀 선택 이용법 ── */}
        <GuideSection
          id="quick-team"
          icon={<ArrowLeftRight className="h-6 w-6" />}
          title="자동 밸런스 · 자유 팀 선택 진행 방법"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <ProcessBlock title="자동 밸런스">
              <li>설정한 플레이어 정원이 모두 찰 때까지 참가자를 모읍니다.</li>
              <li>모든 플레이어가 준비하면 방장이 시작합니다.</li>
              <li>티어·LP 점수와 주/부 선호 포지션을 고려하되, 같은 조합이 반복되지 않도록 랜덤성도 함께 반영합니다.</li>
              <li>편성 직후 역할 선택 화면에서 최종 라인을 정합니다.</li>
            </ProcessBlock>
            <ProcessBlock title="자유 팀 선택">
              <li>플레이어는 로비의 팀 편성에서 원하는 팀의 <strong>이 팀으로 이동</strong>을 누릅니다.</li>
              <li>팀이 꽉 차면 더 들어갈 수 없습니다. 팀을 바꾸려면 <strong>팀 나가기</strong>로 대기석에 돌아온 뒤 빈자리가 있는 다른 팀을 선택합니다.</li>
              <li>팀을 이동하면 준비 상태가 해제되므로, 최종 팀을 고른 뒤 다시 준비합니다.</li>
              <li>모든 자리가 차고 각 팀에 5명씩 배정된 상태에서 모두 준비합니다.</li>
              <li>방장이 시작하면 확정된 구성으로 역할 선택을 진행합니다.</li>
            </ProcessBlock>
          </div>
        </GuideSection>

        {/* ── 역할 선택 ── */}
        <GuideSection
          id="roles"
          icon={<CheckCircle2 className="h-6 w-6" />}
          title="역할 선택"
        >
          <p>
            네 가지 팀 구성 방식 모두 팀이 확정되면 역할 선택으로 이어집니다.
            각 팀원은 탑, 정글, 미드, 원딜, 서포터 중 아직 팀원이 선택하지 않은
            역할을 선택합니다.
          </p>
          <ul className="mt-3 space-y-1.5 list-disc pl-5 text-text-secondary">
            <li>선택한 역할을 다시 누르면 취소하고 다른 역할로 바꿀 수 있습니다.</li>
            <li>시간이 더 필요하면 참가자마다 한 번씩 <strong>+15초</strong>를 사용할 수 있습니다.</li>
            <li>시간 내 선택하지 않은 역할은 선호 포지션을 기준으로 자동 배정됩니다.</li>
            <li>역할 선택이 완료되면 대진표로 이동합니다.</li>
          </ul>
        </GuideSection>

        {/* ── 대진표 ── */}
        <GuideSection
          id="bracket"
          icon={<Trophy className="h-6 w-6" />}
          title="대진표와 경기 진행"
        >
          <p>
            역할 선택이 끝나면 대진표 화면으로 이동합니다. 대진표에서는 각 경기의
            진행 상태, 승자, 다음 라운드 흐름을 확인하고 방장이 경기를 시작하거나
            결과를 입력할 수 있습니다.
          </p>
          <ul className="mt-3 space-y-1.5 list-disc pl-5 text-text-secondary">
            <li>4팀·8팀 토너먼트는 대진 생성 시 팀 순서를 한 번 랜덤으로 섞어 첫 라운드 매칭을 만듭니다.</li>
            <li>싱글 엘리미네이션은 승자가 다음 라운드로 올라가는 흐름을 연결선으로 확인할 수 있습니다.</li>
            <li>더블 엘리미네이션은 승자조와 패자조, 그랜드파이널 흐름을 나누어 확인할 수 있습니다.</li>
            <li>3팀·5팀·6팀·7팀 방은 리그전 방식으로 모든 팀이 서로 한 번씩 경기합니다.</li>
          </ul>
        </GuideSection>

        {/* ── 디스코드 연동 ── */}
        <GuideSection
          id="discord"
          icon={<MessageSquare className="h-6 w-6" />}
          title="디스코드 연동"
        >
          <p>
            방 생성 시 승인된 디스코드 서버를 고르면 내전용 음성 채널을 함께 사용할
            수 있습니다. 준비한 플레이어가 로비 음성 채널에 참가한 뒤 시작하면,
            팀이 확정되는 시점에 각 팀 음성 채널로 자동 이동됩니다. 경기 완료 후에는
            결과 기록도 연동됩니다.
          </p>
          <SectionLink href="/auth/login" label="Discord로 시작하기" />
        </GuideSection>

        {/* ── 디스코드 봇 추가 및 초기 세팅 ── */}
        <GuideSection
          id="bot-setup"
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

        {/* ── 디스코드 봇 명령어 ── */}
        <GuideSection
          id="bot-commands"
          icon={<Bot className="h-6 w-6" />}
          title="디스코드 봇 명령어 사용법"
        >
          <p>
            봇이 추가된 서버에서는 채팅창에 <code className="rounded bg-bg-tertiary px-1.5 py-0.5 text-text-primary">/nexus</code>
            를 입력한 뒤 필요한 하위 명령어를 고르면 됩니다. 처음에는{" "}
            <code className="rounded bg-bg-tertiary px-1.5 py-0.5 text-text-primary">/nexus help</code>
            로 전체 도움말을 확인하세요.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <CommandCard command="/nexus help" title="명령어 도움말">
              사용할 수 있는 Nexus 봇 명령어를 디스코드 안에서 확인합니다.
            </CommandCard>
            <CommandCard command="/nexus link" title="계정 연동">
              디스코드 계정을 Nexus 계정과 연결합니다. 연동 후 프로필, 통계, 방 정보를 봇에서 확인할 수 있습니다.
            </CommandCard>
            <CommandCard command="/nexus profile [@유저]" title="프로필 확인">
              내 프로필 또는 멘션한 유저의 Riot 계정 정보를 확인합니다.
            </CommandCard>
            <CommandCard command="/nexus rooms" title="활성 방 목록">
              대기 중, 역할 선택 중, 진행 중인 내전 방 목록을 확인합니다.
            </CommandCard>
            <CommandCard command="/nexus team" title="현재 팀 정보">
              내가 참가 중인 방의 팀 구성과 팀원 정보를 확인합니다.
            </CommandCard>
            <CommandCard command="/nexus auction" title="경매 상태">
              경매 방에 참가 중일 때 현재 경매 진행 상황을 확인합니다.
            </CommandCard>
            <CommandCard command="/nexus match" title="현재 매치">
              현재 진행 중인 경기 정보를 확인합니다.
            </CommandCard>
            <CommandCard command="/nexus bracket" title="대진표 확인">
              참가 중인 방의 대진표와 라운드 진행 상황을 확인합니다.
            </CommandCard>
            <CommandCard command="/nexus stats" title="내 통계">
              내 내전 기록과 주요 통계를 확인합니다.
            </CommandCard>
            <CommandCard command="/nexus leaderboard" title="리더보드">
              티어와 LP 기준 상위 10명 랭킹을 확인합니다.
            </CommandCard>
            <CommandCard command="/nexus clan" title="클랜 정보">
              내가 속한 클랜 정보를 확인합니다.
            </CommandCard>
          </div>
          <div className="mt-5 rounded-xl border border-bg-tertiary bg-bg-secondary/50 p-4">
            <h3 className="font-semibold text-text-primary">서버 관리자용 명령어</h3>
            <ul className="mt-3 space-y-2 text-sm text-text-secondary">
              <li>
                <code className="rounded bg-bg-tertiary px-1.5 py-0.5 text-text-primary">/nexus rules</code>
                {" "}서버 규칙 작성 모달을 열고 봇 메시지로 게시합니다.
              </li>
              <li>
                <code className="rounded bg-bg-tertiary px-1.5 py-0.5 text-text-primary">/nexus verify</code>
                {" "}Nexus 서버 기본 역할을 받아 채널 접근 권한을 엽니다.
              </li>
              <li>
                <code className="rounded bg-bg-tertiary px-1.5 py-0.5 text-text-primary">/nexus setuproles</code>
                {" "}티어, 주라인, 부라인, 기본 역할을 자동 생성합니다.
              </li>
              <li>
                <code className="rounded bg-bg-tertiary px-1.5 py-0.5 text-text-primary">/nexus setupverifypanel</code>
                {" "}현재 채널에 Riot ID 인증 패널을 게시합니다.
              </li>
            </ul>
          </div>
        </GuideSection>

        {/* ── 전적 · 클랜 · 랭킹 ── */}
        <GuideSection
          id="stats"
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
        <section id="faq" className="mt-12 md:mt-16 scroll-mt-20 md:scroll-mt-24">
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
            네 가지 팀 구성 방식 중 모임에 맞는 방식을 골라 진행하세요.
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
  id,
  icon,
  title,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      // sticky 헤더(top-0)에 앵커 제목이 가려지지 않도록 스크롤 여백 확보
      className="py-6 md:py-8 border-t border-bg-tertiary first-of-type:border-t-0 scroll-mt-20 md:scroll-mt-24"
    >
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

// ── 팀 구성 방식 카드 ──
function ModeCard({
  icon,
  title,
  summary,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-bg-tertiary bg-bg-secondary/50 p-4">
      <div className="flex items-center gap-2 text-text-primary">
        <span className="text-accent-primary">{icon}</span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="mt-2 text-sm font-medium text-text-primary">{summary}</p>
      <p className="mt-1 text-sm text-text-secondary">{children}</p>
    </div>
  );
}

// ── 모드별 진행 순서 ──
function ProcessBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-bg-tertiary bg-bg-secondary/50 p-4">
      <h3 className="font-semibold text-text-primary mb-3">{title}</h3>
      <ol className="space-y-2 list-decimal pl-5 text-sm text-text-secondary">
        {children}
      </ol>
    </div>
  );
}

// ── 디스코드 봇 명령어 카드 ──
function CommandCard({
  command,
  title,
  children,
}: {
  command: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-bg-tertiary bg-bg-secondary/50 p-4">
      <code className="inline-flex rounded-lg bg-bg-tertiary px-2 py-1 text-sm font-semibold text-accent-primary">
        {command}
      </code>
      <h3 className="mt-3 font-semibold text-text-primary">{title}</h3>
      <p className="mt-1 text-sm text-text-secondary">{children}</p>
    </div>
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
