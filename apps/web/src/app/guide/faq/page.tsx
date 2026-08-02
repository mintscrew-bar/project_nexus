import type { Metadata } from "next";
import { HelpCircle } from "lucide-react";
import { absoluteUrl } from "@/lib/seo";
import { GuidePageLayout, GuideSection } from "../_components/GuidePageLayout";

export const metadata: Metadata = {
  title: "자주 묻는 질문 — Nexus",
  description: "Nexus 내전 시작 조건, 팀 편성, 대진표, Discord 연동에 관한 답변입니다.",
  alternates: { canonical: absoluteUrl("/guide/faq") },
};

const faqs = [
  ["Nexus는 어떤 서비스인가요?", "경매·스네이크·자동 밸런스·자유 팀 선택, 역할 선택, 대진표, Discord 음성 연동과 경기 기록을 한 흐름으로 지원하는 롤 내전 도구입니다."],
  ["팀은 어떤 방식으로 구성하나요?", "방을 만들 때 경매, 스네이크, 자동 밸런스, 자유 팀 선택 중 하나를 고릅니다. 자동 밸런스는 티어·LP와 선호 포지션을 참고하고, 자유 팀 선택은 참가자가 직접 팀으로 이동합니다."],
  ["자동 밸런스와 자유 팀 선택은 언제 시작할 수 있나요?", "두 방식 모두 정원이 차고 모든 참가자가 준비해야 합니다. 자유 팀 선택은 각 팀 인원도 맞아야 하며, 팀을 옮기면 준비 상태를 다시 확인해야 합니다."],
  ["팀 선택이 끝나면 무엇을 하나요?", "모든 팀 구성 방식은 역할 선택으로 이어집니다. 제한 시간 안에 선택하지 않은 역할은 참가자의 선호 포지션을 참고해 자동 배정됩니다."],
  ["대진표는 어떻게 만들어지나요?", "4팀과 8팀은 첫 라운드를 무작위로 배치해 단일 또는 더블 엘리미네이션으로 진행할 수 있습니다. 그 외 팀 수는 리그 방식으로 진행합니다."],
  ["Discord 봇은 어떻게 추가하나요?", "설정에서 봇을 서버에 추가하고 관리자의 연동 승인을 받은 뒤, 방 생성 시 승인된 서버를 선택합니다. 채널 보기·메시지·음성 이동 권한도 확인해야 합니다."],
  ["Discord 명령어는 어디에서 확인하나요?", "Discord에서 /nexus help를 입력하거나 Discord 연동 가이드 페이지에서 주요 사용자·관리자 명령어를 확인할 수 있습니다."],
  ["내전 기록도 볼 수 있나요?", "내전 전적에서 경기별 승패, KDA, 챔피언과 역할을 확인할 수 있고, 누적 기록은 랭킹과 클랜 페이지에서도 활용됩니다."],
] as const;

export default function FaqGuidePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };

  return (
    <GuidePageLayout
      icon={HelpCircle}
      title="자주 묻는 질문"
      description="방 생성부터 경기 기록까지, 진행 중 자주 막히는 지점을 짧게 정리했습니다."
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <GuideSection title="기능과 진행 방식">
        <div className="grid gap-3 md:grid-cols-2">
          {faqs.map(([question, answer]) => (
            <article key={question} className="rounded-2xl bg-bg-primary/35 p-5 md:p-6">
              <h2 className="font-bold leading-6 text-text-primary">{question}</h2>
              <p className="mt-3 text-sm leading-7 text-text-secondary">{answer}</p>
            </article>
          ))}
        </div>
      </GuideSection>
    </GuidePageLayout>
  );
}
