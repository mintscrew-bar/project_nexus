import type { Metadata } from "next";
import { ArrowLeftRight, Gavel, ListOrdered, Scale } from "lucide-react";
import { absoluteUrl } from "@/lib/seo";
import {
  Bullet,
  BulletList,
  GuidePageLayout,
  GuideSection,
  GuideStep,
  InfoCard,
} from "../_components/GuidePageLayout";

export const metadata: Metadata = {
  title: "팀 구성 모드 가이드 — Nexus",
  description: "경매, 스네이크, 자동 밸런스, 자유 팀 선택의 차이와 진행 방법을 비교합니다.",
  alternates: { canonical: absoluteUrl("/guide/team-modes") },
};

export default function TeamModesGuidePage() {
  return (
    <GuidePageLayout
      icon={Scale}
      title="팀 구성"
      description="가장 공정한 방식 하나를 찾기보다, 이번 내전에서 빠른 시작과 선택의 재미 중 무엇이 중요한지 먼저 정하세요."
    >
      <GuideSection title="모드 한눈에 비교">
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoCard icon={Gavel} title="경매" description="팀장이 제한된 포인트로 선수를 영입합니다. 선택 과정의 전략과 보는 재미가 큽니다." />
          <InfoCard icon={ListOrdered} title="스네이크" description="팀장이 정해진 순서로 번갈아 선수를 선택합니다. 규칙이 단순하고 진행을 따라가기 쉽습니다." />
          <InfoCard icon={Scale} title="자동 밸런스" description="티어·LP와 선호 포지션을 참고해 빠르게 팀을 나눕니다. 친선전과 빠른 시작에 적합합니다." />
          <InfoCard icon={ArrowLeftRight} title="자유 팀 선택" description="참가자가 직접 팀을 고릅니다. 이미 구성이 합의된 연습 경기나 클랜전에 적합합니다." />
        </div>
      </GuideSection>

      <GuideSection title="경매와 스네이크 진행">
        <ol className="grid gap-3 lg:grid-cols-3">
          <GuideStep number={1} title="팀장과 규칙 확정">팀장, 선택 제한 시간, 경매 포인트와 최소 입찰 단위를 시작 전에 공지합니다.</GuideStep>
          <GuideStep number={2} title="순서대로 선택">경매는 최고 입찰 팀이 영입하고, 스네이크는 화면에 표시된 순서로 선수를 선택합니다.</GuideStep>
          <GuideStep number={3} title="역할 선택으로 이동">모든 선수가 배정되면 팀 구성을 확인한 뒤 역할 선택 단계로 넘어갑니다.</GuideStep>
        </ol>
      </GuideSection>

      <GuideSection title="자동 밸런스와 자유 팀 선택">
        <BulletList>
          <Bullet>자동 밸런스는 전원 입장과 준비 완료 뒤 실행하며, 티어·LP와 선호 포지션이 최신인지 확인합니다.</Bullet>
          <Bullet>결과가 어색하면 포지션 충돌처럼 분명한 이유가 있을 때만 소수 인원을 조정합니다.</Bullet>
          <Bullet>자유 팀 선택은 참가자가 직접 이동하며, 팀 이동 시 준비 상태가 해제될 수 있습니다.</Bullet>
          <Bullet>각 팀 정원이 맞고 모든 참가자가 다시 준비한 뒤 다음 단계로 진행합니다.</Bullet>
        </BulletList>
      </GuideSection>
    </GuidePageLayout>
  );
}
