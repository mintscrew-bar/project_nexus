import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Mail, MessageSquare, ShieldCheck } from "lucide-react";
import { absoluteUrl } from "@/lib/seo";
import { NEXUS_DISCORD_INVITE_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "문의하기 — Nexus 운영자 연락처와 신고 안내",
  description:
    "Nexus 서비스 문의, 개인정보 요청, 커뮤니티 신고, 디스코드 연동 문의를 보낼 수 있는 연락처와 처리 기준을 안내합니다.",
  alternates: {
    canonical: absoluteUrl("/contact"),
  },
  openGraph: {
    title: "Nexus 문의하기",
    description:
      "서비스 이용, 계정, 개인정보, 커뮤니티 신고, 디스코드 연동 문의 방법을 확인하세요.",
    url: absoluteUrl("/contact"),
  },
};

const contactJsonLd = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  name: "Nexus 문의하기",
  url: absoluteUrl("/contact"),
  inLanguage: "ko-KR",
  mainEntity: {
    "@type": "Organization",
    name: "Project Nexus",
    url: absoluteUrl("/"),
    email: "nexuscshelper@gmail.com",
  },
};

const contactCards = [
  {
    icon: Mail,
    title: "서비스 문의",
    body:
      "계정, 내전 방, 전적 기록, 디스코드 연동 오류처럼 서비스 사용 중 생긴 문제를 이메일로 보낼 수 있습니다.",
    action: "nexuscshelper@gmail.com",
    href: "mailto:nexuscshelper@gmail.com",
  },
  {
    icon: ShieldCheck,
    title: "개인정보 요청",
    body:
      "개인정보 열람, 정정, 삭제, 처리 정지 요청은 개인정보처리방침에 따라 접수 후 순서대로 검토합니다.",
    action: "개인정보처리방침 보기",
    href: "/privacy",
  },
  {
    icon: AlertTriangle,
    title: "신고와 제재 문의",
    body:
      "게시글, 댓글, 채팅, 내전 참여 과정의 부적절한 행위는 서비스 내 신고 기능을 우선 이용해주세요.",
    action: "이용약관 보기",
    href: "/terms",
  },
  {
    icon: MessageSquare,
    title: "커뮤니티와 디스코드",
    body:
      "디스코드 서버 연동, 봇 승인, 커뮤니티 운영 관련 문의는 공식 Discord에서도 안내받을 수 있습니다.",
    action: "Discord 참가",
    href: NEXUS_DISCORD_INVITE_URL,
  },
];

export default function ContactPage() {
  return (
    <div className="flex-grow bg-bg-primary">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(contactJsonLd) }}
      />

      <div className="mx-auto max-w-5xl px-4 py-10 md:px-6 md:py-16">
        <header className="mb-12">
          <p className="text-sm font-semibold text-accent-primary">문의하기</p>
          <h1 className="mt-3 text-3xl font-bold leading-tight text-text-primary md:text-5xl">
            Nexus 이용 중 필요한 도움을 받을 수 있는 곳입니다.
          </h1>
          <p className="mt-5 max-w-3xl text-sm leading-relaxed text-text-secondary md:text-lg">
            서비스 오류, 계정 연동, 개인정보 요청, 커뮤니티 신고와 관련된 문의
            경로를 한곳에 정리했습니다. 문의 시 사용 중인 브라우저, 발생한 화면,
            내전 방 주소나 계정 정보를 함께 보내주면 확인이 더 빠릅니다.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          {contactCards.map((card) => (
            <article
              key={card.title}
              className="rounded-lg border border-bg-tertiary bg-bg-secondary/50 p-5"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
                  <card.icon className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-text-primary">
                    {card.title}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                    {card.body}
                  </p>
                  <Link
                    href={card.href}
                    target={card.href.startsWith("http") || card.href.startsWith("mailto") ? "_blank" : undefined}
                    rel={card.href.startsWith("http") ? "noopener noreferrer" : undefined}
                    className="mt-4 inline-flex rounded-lg bg-bg-tertiary px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-elevated"
                  >
                    {card.action}
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="mt-10 rounded-lg border border-bg-tertiary bg-bg-secondary/40 p-6">
          <h2 className="text-xl font-bold text-text-primary">응답과 처리 기준</h2>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-text-secondary">
            <li>일반 문의는 접수 순서대로 확인하며, 필요한 경우 추가 정보를 요청할 수 있습니다.</li>
            <li>개인정보 관련 요청은 본인 확인 후 처리하며, 처리 기준은 개인정보처리방침을 따릅니다.</li>
            <li>신고 대상 콘텐츠는 운영 기준과 이용약관에 따라 검토합니다.</li>
            <li>Nexus는 Riot Games의 공식 서비스가 아니며, Riot 계정과 게임 데이터는 Riot Games API 정책 범위 안에서만 사용합니다.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
