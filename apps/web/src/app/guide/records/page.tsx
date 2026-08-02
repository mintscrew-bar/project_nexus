import type { Metadata } from "next";
import { BarChart3, Shield, Trophy } from "lucide-react";
import { absoluteUrl } from "@/lib/seo";
import { Bullet, BulletList, GuidePageLayout, GuideSection, InfoCard } from "../_components/GuidePageLayout";

export const metadata: Metadata = {
  title: "기록과 커뮤니티 가이드 — Nexus",
  description: "내전 전적, 랭킹, 클랜 기능을 다음 경기 준비에 활용하는 방법을 안내합니다.",
  alternates: { canonical: absoluteUrl("/guide/records") },
};

export default function RecordsGuidePage() {
  return (
    <GuidePageLayout
      icon={BarChart3}
      title="기록과 커뮤니티"
      description="한 경기의 결과를 줄 세우기가 아닌, 다음 내전을 더 빠르고 납득 가능하게 준비하는 자료로 남겨보세요."
    >
      <GuideSection title="기록 살펴보기">
        <div className="grid gap-3 md:grid-cols-3">
          <InfoCard href="/matches" icon={BarChart3} title="내전 전적" description="승패, KDA, 챔피언과 역할 기록을 경기별로 확인합니다." />
          <InfoCard href="/ranking" icon={Trophy} title="랭킹" description="누적된 경기 기록을 기준으로 참가자 순위를 살펴봅니다." />
          <InfoCard href="/clans" icon={Shield} title="클랜" description="함께 플레이할 커뮤니티를 찾고 구성원의 활동을 확인합니다." />
        </div>
      </GuideSection>

      <GuideSection title="다음 내전에 남길 기록">
        <BulletList>
          <Bullet>경기 직후 승리 팀, 챔피언, 최종 역할과 대진 결과부터 입력합니다.</Bullet>
          <Bullet>개인 평가보다 역할 배치와 팀 구성에서 다음에 참고할 사실을 남깁니다.</Bullet>
          <Bullet>공개 기록과 개인 피드백을 분리해 기록이 비난 도구가 되지 않게 합니다.</Bullet>
          <Bullet>결과 입력 담당자와 오류 수정 기준을 경기 전에 정합니다.</Bullet>
        </BulletList>
      </GuideSection>
    </GuidePageLayout>
  );
}
