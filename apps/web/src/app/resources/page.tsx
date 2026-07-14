import type { Metadata } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Gavel,
  ListChecks,
  MessageSquare,
  Scale,
  Shuffle,
  Trophy,
  Users,
} from "lucide-react";
import { absoluteUrl } from "@/lib/seo";
import { RESOURCE_ARTICLES } from "./articles";

export const metadata: Metadata = {
  title: "롤 내전 운영 자료실 — 팀 구성, 경매, 결과 기록 체크리스트",
  description:
    "롤 내전을 안정적으로 운영하기 위한 방 생성 체크리스트, 경매·스네이크·자동 밸런스·자유 팀 선택 기준, 결과 기록 방법을 정리했습니다.",
  alternates: {
    canonical: absoluteUrl("/resources"),
  },
  openGraph: {
    title: "롤 내전 운영 자료실 — Nexus",
    description:
      "내전 방장과 커뮤니티 운영자를 위한 팀 구성 방식, 진행 체크리스트, 경기 결과 기록 가이드를 확인하세요.",
    url: absoluteUrl("/resources"),
  },
};

const resourcesJsonLd = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "롤 내전 운영 자료실",
  url: absoluteUrl("/resources"),
  inLanguage: "ko-KR",
  description:
    "롤 내전 운영을 위한 방 생성 체크리스트, 팀 구성 방식 선택 기준, 결과 기록 가이드 모음입니다.",
};

const preparationChecklist = [
  {
    title: "참가 조건을 먼저 정하기",
    body:
      "정원, 관전 허용 여부, Riot 계정 연동 필요 여부, Discord 음성 참여 기준을 방 생성 전에 정합니다. 참가 조건이 늦게 바뀌면 준비 완료 상태가 다시 흔들릴 수 있습니다.",
  },
  {
    title: "팀 구성 방식을 경기 목적에 맞추기",
    body:
      "친선전은 자유 팀 선택이나 자동 밸런스가 빠르고, 경쟁성이 강한 내전은 경매나 스네이크 드래프트가 적합합니다. 운영자는 재미와 공정성 중 무엇을 우선할지 먼저 결정해야 합니다.",
  },
  {
    title: "시작 전 역할 충돌 확인하기",
    body:
      "팀 구성 뒤에는 포지션 선택을 확인해야 합니다. 같은 라인을 여러 명이 고르면 실제 경기 시작 직전에 시간이 길어지므로, 역할 선택 단계에서 자동 배정 기준까지 함께 확인하는 것이 좋습니다.",
  },
  {
    title: "결과 입력 담당자 정하기",
    body:
      "경기가 끝난 뒤 결과 입력과 평점 등록이 늦어지면 기록의 신뢰도가 떨어집니다. 방장 또는 팀장 중 한 명이 결과 입력을 담당하도록 미리 정해두면 다음 경기 준비가 빨라집니다.",
  },
];

const modeGuides: Array<{
  icon: LucideIcon;
  title: string;
  whenToUse: string;
  watchOut: string;
}> = [
  {
    icon: Gavel,
    title: "경매 드래프트",
    whenToUse:
      "참가자 실력 차이가 크고 팀장 간 전략 싸움을 살리고 싶을 때 적합합니다. 포인트를 어디에 쓰는지 자체가 내전의 재미가 됩니다.",
    watchOut:
      "시작 포인트, 최소 입찰 단위, 남은 시간을 분명히 정해야 합니다. 매물 카드의 정보가 작거나 팀장 버튼이 가려지면 진행 속도가 떨어집니다.",
  },
  {
    icon: Shuffle,
    title: "스네이크 드래프트",
    whenToUse:
      "팀장이 번갈아 선수를 고르며 비교적 직관적인 팀 구성을 원할 때 좋습니다. 픽 순서가 왕복되므로 초반 순번의 이점을 줄일 수 있습니다.",
    watchOut:
      "픽 제한 시간을 짧게 잡으면 미선택자가 자주 생깁니다. 후보 풀이 큰 경우 팀장은 미리 선호 포지션과 최근 전적을 확인하는 것이 좋습니다.",
  },
  {
    icon: Scale,
    title: "자동 밸런스",
    whenToUse:
      "운영자가 빠르게 경기를 시작하고 싶거나 참가자 간 친분 때문에 직접 지명하기 어려울 때 적합합니다. 티어와 선호 포지션을 기준으로 팀을 나눕니다.",
    watchOut:
      "자동 편성은 완벽한 승률 예측이 아니라 운영 보조 수단입니다. 포지션 선호가 입력되지 않은 참가자가 많으면 결과를 한 번 더 확인해야 합니다.",
  },
  {
    icon: Users,
    title: "자유 팀 선택",
    whenToUse:
      "친구끼리 같은 팀을 하고 싶거나 클랜 내부 연습처럼 팀 구성이 이미 정해져 있을 때 빠르게 사용할 수 있습니다.",
    watchOut:
      "각 팀이 정확히 5명씩 채워져야 시작 조건이 안정적으로 맞습니다. 한 팀에 사람이 몰리지 않도록 방장이 로비 상황을 확인해야 합니다.",
  },
];

const recordGuides = [
  {
    icon: Trophy,
    title: "승패와 대진표",
    body:
      "대진표는 다음 라운드 이동의 기준입니다. 결과 입력이 누락되면 이후 라운드가 꼬일 수 있으므로, 경기 종료 직후 승리 팀을 먼저 확정합니다.",
  },
  {
    icon: BarChart3,
    title: "전적과 챔피언 기록",
    body:
      "내전 전적은 랭크 전적과 목적이 다릅니다. 승률뿐 아니라 조합, 라인, KDA, 자주 쓰는 챔피언을 같이 보면 다음 팀 구성에 더 도움이 됩니다.",
  },
  {
    icon: MessageSquare,
    title: "평점과 회고",
    body:
      "경기 후 평점은 운영자가 참가자의 체감 밸런스를 확인하는 자료가 됩니다. 단순 비난이 아니라 다음 경기 품질을 높이는 피드백으로 남기는 것이 좋습니다.",
  },
];

export default function ResourcesPage() {
  return (
    <div className="flex-grow bg-bg-primary">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(resourcesJsonLd) }}
      />

      <div className="mx-auto max-w-5xl px-4 py-10 md:px-6 md:py-16">
        <header className="mb-12">
          <p className="text-sm font-semibold text-accent-primary">운영 자료실</p>
          <h1 className="mt-3 text-3xl font-bold leading-tight text-text-primary md:text-5xl">
            롤 내전을 안정적으로 진행하기 위한 공개 체크리스트
          </h1>
          <p className="mt-5 max-w-3xl text-sm leading-relaxed text-text-secondary md:text-lg">
            Nexus는 내전 방을 만드는 기능만 제공하지 않습니다. 운영자가 어떤
            기준으로 팀 구성 방식을 고르고, 참가자가 어떤 순서로 준비해야 하며,
            경기 후 어떤 기록을 남겨야 하는지 공개 자료로 정리합니다.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/guide"
              className="inline-flex items-center gap-2 rounded-lg bg-accent-primary px-5 py-2.5 font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              기능 가이드로 이동
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/tournaments"
              className="inline-flex items-center gap-2 rounded-lg bg-bg-tertiary px-5 py-2.5 font-semibold text-text-primary transition-colors hover:bg-bg-elevated"
            >
              내전 방 목록
            </Link>
          </div>
        </header>

        <ResourceSection
          icon={ListChecks}
          eyebrow="방 생성 전"
          title="방장이 먼저 확인할 항목"
          description="내전은 시작 전 준비가 절반입니다. 아래 항목을 먼저 정하면 로비에서 불필요한 설명과 재설정을 줄일 수 있습니다."
        >
          <div className="grid gap-4 md:grid-cols-2">
            {preparationChecklist.map((item) => (
              <article
                key={item.title}
                className="rounded-lg border border-bg-tertiary bg-bg-secondary/50 p-5"
              >
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent-primary" />
                  <div>
                    <h3 className="font-semibold text-text-primary">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                      {item.body}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </ResourceSection>

        <ResourceSection
          icon={BookOpen}
          eyebrow="실전 운영 문서"
          title="상황별로 바로 꺼내 보는 운영 기준"
          description="기능을 소개하는 데서 끝나지 않고, 실제 내전에서 자주 생기는 지연·팀 밸런스·기록 문제를 해결하는 기준을 문서로 정리했습니다."
        >
          <div className="grid gap-4 md:grid-cols-2">
            {RESOURCE_ARTICLES.map((article) => (
              <Link
                key={article.slug}
                href={`/resources/${article.slug}`}
                className="group rounded-xl border border-bg-tertiary bg-bg-secondary/50 p-5 transition-colors hover:border-accent-primary/40 hover:bg-bg-secondary"
              >
                <p className="text-xs font-semibold text-accent-primary">{article.readingTime} 읽기 · 업데이트 {article.updatedAt}</p>
                <h3 className="mt-2 text-lg font-bold text-text-primary group-hover:text-accent-primary">{article.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-text-secondary">{article.description}</p>
              </Link>
            ))}
          </div>
        </ResourceSection>

        <ResourceSection
          icon={Scale}
          eyebrow="팀 구성"
          title="모드별 선택 기준"
          description="같은 10명 내전이라도 목적에 따라 적합한 방식이 다릅니다. 아래 기준을 참고해 방을 만들면 참가자에게 더 명확한 진행 흐름을 제공할 수 있습니다."
        >
          <div className="grid gap-4">
            {modeGuides.map((mode) => (
              <article
                key={mode.title}
                className="rounded-lg border border-bg-tertiary bg-bg-secondary/50 p-5"
              >
                <div className="flex flex-col gap-4 md:flex-row">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
                    <mode.icon className="h-6 w-6" />
                  </div>
                  <div className="grid min-w-0 gap-3 md:grid-cols-2">
                    <div>
                      <h3 className="text-lg font-semibold text-text-primary">
                        {mode.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                        <span className="font-semibold text-text-primary">추천 상황: </span>
                        {mode.whenToUse}
                      </p>
                    </div>
                    <p className="text-sm leading-relaxed text-text-secondary md:pt-8">
                      <span className="font-semibold text-text-primary">주의할 점: </span>
                      {mode.watchOut}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </ResourceSection>

        <ResourceSection
          icon={BarChart3}
          eyebrow="경기 후"
          title="결과 기록을 남겨야 하는 이유"
          description="내전은 한 판이 끝나면 바로 다음 판으로 넘어가기 쉽습니다. 하지만 기록이 남아야 운영자는 다음 경기의 밸런스를 조정하고 참가자는 자신의 흐름을 돌아볼 수 있습니다."
        >
          <div className="grid gap-4 md:grid-cols-3">
            {recordGuides.map((guide) => (
              <article
                key={guide.title}
                className="rounded-lg border border-bg-tertiary bg-bg-secondary/50 p-5"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-bg-tertiary text-accent-primary">
                  <guide.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-text-primary">
                  {guide.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                  {guide.body}
                </p>
              </article>
            ))}
          </div>
        </ResourceSection>

        <section className="rounded-lg border border-bg-tertiary bg-bg-secondary/50 p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-bg-tertiary text-accent-primary">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-text-primary">
                관련 문서와 다음 단계
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary md:text-base">
                실제 버튼 위치와 화면 흐름은 기능 가이드에서 확인할 수 있습니다. 서비스의
                목적과 데이터 처리 방식은 소개 페이지에 정리되어 있고, 커뮤니티 글과 내전
                기록은 공개 페이지에서 탐색할 수 있습니다.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/about"
                  className="rounded-lg bg-bg-tertiary px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-elevated"
                >
                  서비스 소개
                </Link>
                <Link
                  href="/community"
                  className="rounded-lg bg-bg-tertiary px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-elevated"
                >
                  커뮤니티
                </Link>
                <Link
                  href="/matches"
                  className="rounded-lg bg-bg-tertiary px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-elevated"
                >
                  내전 전적
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function ResourceSection({
  icon: Icon,
  eyebrow,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-14">
      <div className="mb-6 flex items-start gap-4">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-semibold text-accent-primary">{eyebrow}</p>
          <h2 className="mt-1 text-2xl font-bold text-text-primary">{title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-secondary md:text-base">
            {description}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}
