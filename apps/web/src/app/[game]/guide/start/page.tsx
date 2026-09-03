import type { Metadata } from "next";
import { CheckCircle2, DoorOpen, Play, Users } from "lucide-react";
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
  title: "빠른 시작 가이드 — Nexus",
  description: "내전 방 생성부터 참가 확인, 준비 완료, 시작까지 필요한 순서를 안내합니다.",
  alternates: { canonical: absoluteUrl("/guide/start") },
};

export default function StartGuidePage() {
  return (
    <GuidePageLayout
      icon={Users}
      title="빠른 시작"
      description="처음 방을 만드는 순간부터 모든 참가자가 준비를 마치고 팀 구성으로 넘어갈 때까지, 방장이 확인할 핵심 흐름입니다."
    >
      <GuideSection title="방 만들기와 로비 준비" description="설정을 먼저 확정하면 참가자가 모인 뒤 다시 준비를 받을 일을 줄일 수 있습니다.">
        <ol className="grid gap-3 lg:grid-cols-3">
          <GuideStep number={1} title="방 설정">
            참가 인원, 팀 구성 모드, 비밀번호, 관전 허용 여부와 연동할 Discord 서버를 선택합니다.
          </GuideStep>
          <GuideStep number={2} title="참가와 준비">
            실제 플레이어가 모두 입장했는지 확인하고 준비를 받습니다. 관전자는 팀 구성 인원에서 제외됩니다.
          </GuideStep>
          <GuideStep number={3} title="내전 시작">
            시작 조건이 충족되면 방장이 다음 단계로 진행합니다. Discord를 사용한다면 음성 채널 입장도 함께 확인하세요.
          </GuideStep>
        </ol>
      </GuideSection>

      <GuideSection title="시작 전에 확인할 것">
        <div className="grid gap-3 md:grid-cols-3">
          <InfoCard icon={DoorOpen} title="참가 조건" description="정원과 준비 상태를 기준으로 참가자를 확정하고, 늦는 인원은 대기자 교체 여부를 먼저 정합니다." />
          <InfoCard icon={Users} title="팀 구성 방식" description="경매·스네이크·자동 밸런스·자유 팀 선택 중 이번 내전의 목적에 맞는 방식을 미리 공지합니다." />
          <InfoCard icon={Play} title="다음 단계 안내" description="팀 구성 뒤 역할 선택과 대진표가 이어진다는 점을 시작 전에 짧게 공유합니다." />
        </div>
      </GuideSection>

      <GuideSection title="15분 전 체크리스트">
        <BulletList>
          <Bullet>플레이할 인원과 관전자를 구분했습니다.</Bullet>
          <Bullet>모든 참가자가 준비 상태이며 팀 구성 방식을 알고 있습니다.</Bullet>
          <Bullet>Discord 연동을 사용한다면 봇과 음성 채널 권한을 확인했습니다.</Bullet>
          <Bullet>지연 시 대기자 교체 시각과 다음 행동을 한 문장으로 안내합니다.</Bullet>
        </BulletList>
        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-accent-primary/[0.07] p-4 text-sm leading-6 text-text-secondary">
          <CheckCircle2 className="h-5 w-5 flex-none text-accent-primary" />
          준비 상태는 단순 출석이 아니라 지금 바로 팀 구성으로 넘어갈 수 있다는 신호로 사용하세요.
        </div>
      </GuideSection>
    </GuidePageLayout>
  );
}
