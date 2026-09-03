import type { Metadata } from "next";
import { Bot, Link2, MessageSquareText, ShieldCheck } from "lucide-react";
import { absoluteUrl } from "@/lib/seo";
import { GuidePageLayout, GuideSection, GuideStep, InfoCard } from "../_components/GuidePageLayout";

export const metadata: Metadata = {
  title: "Discord 연동 가이드 — Nexus",
  description: "Nexus Discord 봇 추가, 서버 승인, 음성 채널 이동과 주요 명령어를 안내합니다.",
  alternates: { canonical: absoluteUrl("/guide/discord") },
};

const commands = [
  ["/nexus help", "사용 가능한 명령어 보기"],
  ["/nexus link", "Nexus 계정 연결"],
  ["/nexus profile [@유저]", "연결된 프로필 확인"],
  ["/nexus rooms", "참가 가능한 방 확인"],
  ["/nexus team", "현재 팀 정보 확인"],
  ["/nexus auction", "경매 진행 상태 확인"],
  ["/nexus match", "현재 경기 확인"],
  ["/nexus bracket", "대진표 확인"],
  ["/nexus stats", "내전 기록 확인"],
  ["/nexus leaderboard", "랭킹 확인"],
  ["/nexus clan", "클랜 정보 확인"],
];

export default function DiscordGuidePage() {
  return (
    <GuidePageLayout
      icon={Bot}
      title="Discord 연동"
      description="모집 알림부터 음성 채널 이동까지 내전 운영 흐름을 Discord와 연결하는 방법입니다."
    >
      <GuideSection title="서버 연결하기">
        <ol className="grid gap-3 lg:grid-cols-3">
          <GuideStep number={1} title="봇 추가">Nexus 설정에서 Discord 봇을 내 서버에 추가합니다.</GuideStep>
          <GuideStep number={2} title="서버 승인">관리자가 연동을 승인하고, 봇에 채널 보기·메시지·음성 이동 권한이 있는지 확인합니다.</GuideStep>
          <GuideStep number={3} title="방에서 선택">내전 방을 만들 때 승인된 Discord 서버를 선택합니다.</GuideStep>
        </ol>
      </GuideSection>

      <GuideSection title="주요 명령어">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {commands.map(([command, description]) => (
            <div key={command} className="rounded-2xl bg-bg-primary/35 p-4">
              <code className="text-sm font-bold text-accent-primary">{command}</code>
              <p className="mt-2 text-sm text-text-secondary">{description}</p>
            </div>
          ))}
        </div>
      </GuideSection>

      <GuideSection title="관리자 명령어">
        <div className="grid gap-3 md:grid-cols-3">
          <InfoCard icon={ShieldCheck} title="/nexus rules" description="서버의 내전 운영 규칙을 관리합니다." />
          <InfoCard icon={Link2} title="/nexus verify" description="연동과 인증 상태를 확인합니다." />
          <InfoCard icon={MessageSquareText} title="/nexus setuproles" description="역할과 인증 패널 설정을 준비합니다. 인증 패널은 /nexus setupverifypanel로 설정합니다." />
        </div>
      </GuideSection>
    </GuidePageLayout>
  );
}
