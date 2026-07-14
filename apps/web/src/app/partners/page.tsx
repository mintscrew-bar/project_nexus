import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bot, BookOpen, Radio, Shield, Users } from "lucide-react";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "NEXUS 파트너 안내",
  description:
    "NEXUS와 함께 성장할 스트리머와 클랜을 위한 안내 페이지입니다. 스트리머 정보 등록, 클랜 만들기, Discord 봇 추가, 사용 가이드를 확인하세요.",
  alternates: {
    canonical: absoluteUrl("/partners"),
  },
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: "NEXUS 파트너 모집",
    description:
      "방송 파티와 클랜 내전을 더 쉽고 재밌게 운영할 스트리머, 클랜 파트너를 찾고 있어요.",
    url: absoluteUrl("/partners"),
  },
};

const partnerCards = [
  {
    href: "/profile",
    icon: Radio,
    title: "스트리머로 함께하기",
    body: "프로필에서 방송 채널과 소개를 정리하고, 시참 내전과 커뮤니티 내전 운영에 NEXUS를 활용해요.",
    cta: "프로필 설정하기",
  },
  {
    href: "/clans",
    icon: Users,
    title: "클랜 찾기·운영하기",
    body: "클랜을 만들고 멤버를 모집하거나, 모집 중인 클랜을 찾아 함께 내전을 시작해요.",
    cta: "클랜 보러가기",
  },
  {
    href: "/settings?tab=accounts",
    icon: Bot,
    title: "Discord 봇 추가하기",
    body: "내 서버에 NEXUS 봇을 추가해 내전 음성 채널 생성과 진행 흐름을 더 편하게 만들어요.",
    cta: "봇 추가하러 가기",
  },
  {
    href: "/guide",
    icon: BookOpen,
    title: "처음이라면",
    body: "방 생성, 팀 구성, 역할 선택, 대진표, Discord 연동까지 전체 사용 흐름을 먼저 확인해요.",
    cta: "가이드 보기",
  },
];

export default function PartnersPage() {
  return (
    <main className="flex-grow bg-bg-primary">
      <section className="mx-auto max-w-5xl px-4 py-10 md:px-6 md:py-16">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold text-accent-primary">
            NEXUS PARTNERS
          </p>
          <h1 className="mt-3 text-3xl font-bold leading-tight text-text-primary md:text-5xl">
            NEXUS와 함께 성장할
            <br />
            스트리머, 클랜을 찾고 있어요
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-text-secondary md:text-lg">
            방송 파티와 클랜 내전을 더 쉽고 재밌게 운영할 수 있도록, 기존 기능으로
            바로 이어지는 안내를 모아두었습니다.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {partnerCards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group rounded-lg border border-bg-tertiary bg-bg-secondary/60 p-5 transition-colors hover:border-accent-primary/40 hover:bg-bg-secondary"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
                  <card.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-text-primary">
                    {card.title}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                    {card.body}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-primary">
                    {card.cta}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-8 rounded-lg border border-violet-500/20 bg-violet-500/10 p-5">
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-accent-primary" />
            <p className="text-sm leading-relaxed text-text-secondary">
              파트너 페이지는 새 기능 신청 폼이 아니라, 기존 NEXUS 기능으로 빠르게
              이동하는 안내 허브입니다. 세부 협업 문의는 Discord 커뮤니티에서 이어갈
              수 있습니다.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
