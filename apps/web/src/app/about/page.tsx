import type { Metadata } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BarChart3,
  ClipboardList,
  MessageSquare,
  Scale,
  ShieldCheck,
  Swords,
  Users,
} from "lucide-react";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Nexus 소개 — 롤 내전 운영과 전적 기록을 연결하는 서비스",
  description:
    "Nexus가 롤 내전 모집, 팀 구성, 디스코드 연동, 경기 결과 기록, 내전 전적 분석을 어떤 방식으로 제공하는지 안내합니다.",
  alternates: {
    canonical: absoluteUrl("/about"),
  },
  openGraph: {
    title: "Nexus 소개 — 롤 내전 운영과 전적 기록",
    description:
      "롤 내전 운영자가 반복하던 모집, 팀 구성, 결과 기록을 Nexus가 어떻게 정리하는지 확인하세요.",
    url: absoluteUrl("/about"),
  },
};

const aboutJsonLd = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  name: "Nexus 소개",
  url: absoluteUrl("/about"),
  inLanguage: "ko-KR",
  description:
    "Nexus는 리그 오브 레전드 내전 운영, 전적 기록, 스크림 준비를 돕는 커뮤니티 플랫폼입니다.",
  mainEntity: {
    "@type": "WebApplication",
    name: "Nexus",
    applicationCategory: "GameApplication",
    operatingSystem: "Web",
    url: absoluteUrl("/"),
  },
};

const servicePoints: Array<{
  icon: LucideIcon;
  title: string;
  body: string;
}> = [
  {
    icon: Swords,
    title: "내전 방 운영",
    body:
      "방 생성, 참가자 준비 상태, 관전자 전환, 시작 조건 확인을 한 화면에서 처리합니다. 방장은 참가자가 실제로 준비되었는지 확인하고 다음 단계로 이동할 수 있습니다.",
  },
  {
    icon: Scale,
    title: "팀 구성 방식",
    body:
      "경매 드래프트, 스네이크 드래프트, 자동 밸런스, 자유 팀 선택을 제공합니다. 각 방식은 시작 조건과 진행 화면이 달라 운영 상황에 맞게 선택할 수 있습니다.",
  },
  {
    icon: MessageSquare,
    title: "Discord 연결",
    body:
      "Discord 계정과 서버를 연동하면 내전 참가 확인, 음성 채널 이동, 봇 명령어 안내를 함께 사용할 수 있습니다. 수동 호출을 줄이는 것이 목표입니다.",
  },
  {
    icon: BarChart3,
    title: "전적과 결과 기록",
    body:
      "경기 결과, 대진표, KDA, 챔피언 사용 기록, 경기 후 평점을 남겨 다음 내전의 팀 구성과 커뮤니티 회고에 활용할 수 있습니다.",
  },
];

const principles = [
  {
    title: "가입 전에도 읽을 수 있는 정보 제공",
    body:
      "기능 가이드, 운영 자료실, 개인정보처리방침, 이용약관을 공개 페이지로 제공합니다. 서비스 화면만 보여주는 것이 아니라 신규 방문자가 목적과 사용 흐름을 이해할 수 있게 설명합니다.",
  },
  {
    title: "커뮤니티 기록과 개인 정보를 분리",
    body:
      "내전 결과처럼 커뮤니티 운영에 필요한 기록과 로그인, OAuth, Riot 계정 연동처럼 개인 식별에 필요한 정보를 구분해 처리합니다. 자세한 항목은 개인정보처리방침에서 확인할 수 있습니다.",
  },
  {
    title: "운영자가 검토할 수 있는 공개 영역 관리",
    body:
      "커뮤니티 게시글, 내전방 채팅, 신고와 제재 기준은 이용약관에 명시되어 있습니다. 사용자 생성 콘텐츠가 포함되는 페이지는 스팸과 부적절한 콘텐츠를 줄이는 운영 기준을 따릅니다.",
  },
];

export default function AboutPage() {
  return (
    <div className="flex-grow bg-bg-primary">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutJsonLd) }}
      />

      <div className="mx-auto max-w-5xl px-4 py-10 md:px-6 md:py-16">
        <header className="mb-12">
          <p className="text-sm font-semibold text-accent-primary">서비스 소개</p>
          <h1 className="mt-3 text-3xl font-bold leading-tight text-text-primary md:text-5xl">
            Nexus는 롤 내전을 운영 가능한 기록으로 바꾸는 서비스입니다.
          </h1>
          <p className="mt-5 max-w-3xl text-sm leading-relaxed text-text-secondary md:text-lg">
            많은 내전은 디스코드 공지, 채팅 투표, 엑셀 표, 수동 대진표를 오가며
            진행됩니다. Nexus는 그 과정을 한곳에 모아 참가자 모집, 팀 구성, 역할
            선택, 경기 결과 기록까지 이어지도록 만든 리그 오브 레전드 커뮤니티
            플랫폼입니다.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/guide"
              className="inline-flex items-center gap-2 rounded-lg bg-accent-primary px-5 py-2.5 font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              사용법 보기
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/resources"
              className="inline-flex items-center gap-2 rounded-lg bg-bg-tertiary px-5 py-2.5 font-semibold text-text-primary transition-colors hover:bg-bg-elevated"
            >
              운영 자료실
            </Link>
          </div>
        </header>

        <section className="mb-14">
          <h2 className="text-2xl font-bold text-text-primary">무엇을 제공하나요?</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-secondary">
            Nexus는 내전을 시작하는 순간부터 끝난 뒤 기록을 확인하는 순간까지
            필요한 기능을 연결합니다. 각 기능은 내전 방 안에서 사용되는 실제
            운영 단계를 기준으로 설계되어 있습니다.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {servicePoints.map((point) => (
              <article
                key={point.title}
                className="rounded-lg border border-bg-tertiary bg-bg-secondary/50 p-5"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
                    <point.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-text-primary">
                      {point.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                      {point.body}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mb-14 rounded-lg border border-bg-tertiary bg-bg-secondary/40 p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-bg-tertiary text-accent-primary">
              <ClipboardList className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-text-primary">
                Nexus가 해결하려는 운영 문제
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary md:text-base">
                내전은 참가자 수가 많아질수록 운영자가 확인해야 할 항목이 늘어납니다.
                누가 준비했는지, 팀장이 누구인지, 어떤 포지션이 비었는지, 다음 라운드가
                어디인지가 흩어지면 경기 시작이 늦어집니다. Nexus는 이 정보를 방 단위로
                묶고, 로비에서 다음 단계로 넘어갈 때 필요한 조건을 화면에 드러내는 방식으로
                운영 부담을 줄입니다.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-14">
          <h2 className="text-2xl font-bold text-text-primary">운영 원칙</h2>
          <div className="mt-6 grid gap-4">
            {principles.map((principle) => (
              <article
                key={principle.title}
                className="rounded-lg border border-bg-tertiary bg-bg-secondary/50 p-5"
              >
                <h3 className="text-lg font-semibold text-text-primary">
                  {principle.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                  {principle.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="mb-14">
          <h2 className="text-2xl font-bold text-text-primary">데이터와 외부 서비스</h2>
          <div className="mt-4 space-y-4 text-sm leading-relaxed text-text-secondary md:text-base">
            <p>
              서비스 이용에는 Google 또는 Discord 로그인, Riot Games 계정 연동,
              Discord 서버 연동이 사용될 수 있습니다. Riot 계정 정보는 참가 조건 확인,
              티어와 포지션 기반 팀 구성, 내전 전적 표시를 위해 사용됩니다.
            </p>
            <p>
              Nexus는 Riot Games의 공식 서비스가 아니며 Riot Games의 보증을 받지
              않습니다. League of Legends와 Riot Games 관련 상표 및 게임 데이터는
              Riot Games, Inc.의 자산이며, Nexus는 Riot Games API 정책 범위 안에서
              게임 데이터를 활용합니다.
            </p>
          </div>
        </section>

        <section className="rounded-lg border border-bg-tertiary bg-bg-secondary/50 p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-accent-primary">
                <ShieldCheck className="h-5 w-5" />
                <p className="text-sm font-semibold">정책과 문의</p>
              </div>
              <h2 className="mt-2 text-xl font-bold text-text-primary">
                가입 전 확인할 수 있는 문서
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                개인정보 처리, 이용 제한, 사용자 생성 콘텐츠 기준, 문의 이메일은 공개
                문서에 정리되어 있습니다. 서비스 관련 문의는 nexuscshelper@gmail.com
                으로 보낼 수 있습니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/privacy"
                className="rounded-lg bg-bg-tertiary px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-elevated"
              >
                개인정보처리방침
              </Link>
              <Link
                href="/terms"
                className="rounded-lg bg-bg-tertiary px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-elevated"
              >
                이용약관
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
