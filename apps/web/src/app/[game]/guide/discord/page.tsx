import type { Metadata } from "next";
import { Bot, Link2, Megaphone, MessageSquareText, ShieldCheck } from "lucide-react";
import { guideGame, guideUrl } from "@/lib/guide-links";
import { GuidePageLayout, GuideSection, GuideStep, InfoCard } from "../_components/GuidePageLayout";
import { PubgDiscordGuide } from "../_content/pubg";

/**
 * 가이드는 게임마다 문안이 다르다. canonical 을 게임 경로로 내지 않으면
 * 같은 주소 하나에 두 글이 걸린 것처럼 색인된다.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ game: string }>;
}): Promise<Metadata> {
  const game = guideGame((await params).game);
  return {
    title: game === "PUBG" ? "Discord 연동 가이드 (배그) — Nexus" : "Discord 연동 가이드 — Nexus",
    description: "Nexus Discord 봇 추가, 서버 승인, 음성 채널 이동과 주요 명령어를 안내합니다.",
    alternates: { canonical: guideUrl("/guide/discord", game) },
  };
}

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

function LolDiscordGuidePage() {
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
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <InfoCard
            icon={ShieldCheck}
            title="/nexus rules"
            description="서버의 내전 운영 규칙을 관리합니다."
          />
          <InfoCard
            icon={Link2}
            title="/nexus verify"
            description="인증된 멤버에게 서버 기본 역할을 지급합니다."
          />
          <InfoCard
            icon={MessageSquareText}
            title="/nexus setuproles"
            description="역할과 인증 패널 설정을 준비합니다. 인증 패널은 /nexus setupverifypanel로 설정합니다."
          />
          <InfoCard
            icon={Megaphone}
            title="/nexus setannounce"
            description="내전 모집 공지를 받을 텍스트 채널을 지정합니다. 채널을 생략하면 현재 채널로 설정됩니다."
          />
        </div>
      </GuideSection>

      <GuideSection
        title="서버 관리자 최초 설정"
        description="서버 관리 또는 관리자 권한이 있는 계정으로 아래 순서대로 실행합니다."
      >
        <ol className="grid gap-3 lg:grid-cols-3">
          <GuideStep number={1} title="역할 준비">
            <code>/nexus setuproles</code>로 인증·티어·라인 역할을 생성합니다.
            봇 역할은 지급할 역할보다 위에 있어야 합니다.
          </GuideStep>
          <GuideStep number={2} title="인증 패널 게시">
            패널을 둘 채널에서 <code>/nexus setupverifypanel</code>을
            실행합니다.
          </GuideStep>
          <GuideStep number={3} title="모집 공지 채널 지정">
            공지를 받을 채널에서 <code>/nexus setannounce</code>를 실행하거나,
            <code> channel</code> 옵션으로 다른 텍스트 채널을 고릅니다.
          </GuideStep>
        </ol>
        <div className="mt-4 rounded-2xl bg-bg-primary/35 p-4 text-sm leading-7 text-text-secondary">
          <p>
            <code className="font-bold text-accent-primary">channel</code>은
            공지 채널,{" "}
            <code className="font-bold text-accent-primary">role</code>은 공지에
            멘션할 역할,{" "}
            <code className="font-bold text-accent-primary">crossguild</code>는
            다른 서버에서 열린 내전 공지 수신 여부입니다.
          </p>
          <p className="mt-2">
            명령어가 갱신되지 않으면 Discord를 새로고침한 뒤 다시 입력하세요.
            봇은 지정한 채널에서 채널 보기와 메시지 보내기 권한이 필요합니다.
          </p>
        </div>
      </GuideSection>
    </GuidePageLayout>
  );
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const game = guideGame((await params).game);
  return game === "PUBG" ? <PubgDiscordGuide /> : <LolDiscordGuidePage />;
}
