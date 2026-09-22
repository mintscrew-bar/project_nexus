import type { Metadata } from "next";
import {
  ArrowRightLeft,
  Bot,
  Headphones,
  Link2,
  Megaphone,
  MessageSquareText,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { guideGame, guideUrl } from "@/lib/guide-links";
import {
  GuidePageLayout,
  GuideSection,
  GuideStep,
  InfoCard,
} from "../_components/GuidePageLayout";
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
    title:
      game === "PUBG"
        ? "Discord 연동 가이드 (배그) — Nexus"
        : "Discord 연동 가이드 — Nexus",
    description:
      "Nexus Discord 봇 추가, 서버 승인, 음성 채널 이동과 주요 명령어를 안내합니다.",
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
          <GuideStep number={1} title="봇 추가">
            Nexus 설정에서 Discord 봇을 내 서버에 추가합니다.
          </GuideStep>
          <GuideStep number={2} title="서버 승인">
            관리자가 연동을 승인하고, 봇에 채널 보기·메시지·음성 이동 권한이
            있는지 확인합니다.
          </GuideStep>
          <GuideStep number={3} title="방에서 선택">
            내전 방을 만들 때 승인된 Discord 서버를 선택합니다.
          </GuideStep>
        </ol>
      </GuideSection>

      <GuideSection
        title="참가자가 음성 채널을 사용하는 순서"
        description="Discord 계정 연동과 음성 채널 입장은 서로 다른 단계입니다. 계정을 연동했더라도 실제 대기실에 들어오지 않으면 시작 조건을 충족하지 못합니다."
      >
        <ol className="grid gap-3 lg:grid-cols-3">
          <GuideStep number={1} title="대기실 찾기">
            방 생성 때 선택한 서버에서 「『방 제목』」 카테고리를 찾고, 그 안의
            「── 대기실 ──」 음성 채널에 들어갑니다.
          </GuideStep>
          <GuideStep number={2} title="로비에서 상태 확인">
            참가자 카드의 스피커 표시와 상단 시작 조건에서 입장 여부를
            확인합니다. 미입장 상태라면 방장에게는 해당 참가자의 이름이
            표시됩니다.
          </GuideStep>
          <GuideStep number={3} title="팀 채널 자동 이동">
            전원이 준비하고 대기실에 들어오면 방장이 시작합니다. 팀 편성이 끝난
            뒤 봇이 참가자를 각 팀 음성 채널로 자동 이동시킵니다.
          </GuideStep>
        </ol>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <InfoCard
            icon={Headphones}
            title="음성 미입장"
            description="준비를 완료했더라도 대기실에 없으면 시작할 수 없습니다. 로비의 Discord 대기실 카드에서 미입장자 이름을 확인하세요."
          />
          <InfoCard
            icon={UsersRound}
            title="관전자"
            description="관전자는 선수 준비 인원과 팀 편성에서 제외되므로 음성 대기실 시작 조건에도 포함되지 않습니다."
          />
          <InfoCard
            icon={ArrowRightLeft}
            title="이동이 안 될 때"
            description="참가자가 대기실에 있는지, Discord 계정이 Nexus 계정과 연결됐는지, 봇에 멤버 이동 권한이 있는지 순서대로 확인합니다."
          />
        </div>
      </GuideSection>

      <GuideSection
        title="봇이 기본으로 요청하는 권한"
        description="관리자 권한은 요청하지 않습니다. 내전 채널 생성·공지·자동 이동에 필요한 권한만 사용합니다."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["채널 보기", "생성한 대기실과 팀 채널 확인"],
            ["채널 관리", "카테고리·채널 생성 및 종료 후 삭제"],
            ["메시지 보내기", "모집과 진행 상태 공지"],
            ["연결", "음성 대기실과 팀 채널 접근"],
            ["멤버 이동", "팀 확정 후 참가자 자동 이동"],
          ].map(([title, description]) => (
            <div key={title} className="rounded-2xl bg-bg-primary/35 p-4">
              <p className="font-bold text-text-primary">{title}</p>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                {description}
              </p>
            </div>
          ))}
        </div>
      </GuideSection>

      <GuideSection title="주요 명령어">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {commands.map(([command, description]) => (
            <div key={command} className="rounded-2xl bg-bg-primary/35 p-4">
              <code className="text-sm font-bold text-accent-primary">
                {command}
              </code>
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
