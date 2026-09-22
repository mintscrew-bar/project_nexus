import type { Metadata } from "next";
import {
  CheckCircle2,
  DoorOpen,
  Eye,
  Headphones,
  LockKeyhole,
  Play,
  Settings2,
  Users,
} from "lucide-react";
import { guideGame, guideUrl } from "@/lib/guide-links";
import {
  Bullet,
  BulletList,
  GuidePageLayout,
  GuideSection,
  GuideStep,
  InfoCard,
} from "../_components/GuidePageLayout";
import { PubgStartGuide } from "../_content/pubg";

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
        ? "빠른 시작 가이드 (배그) — Nexus"
        : "빠른 시작 가이드 — Nexus",
    description:
      "내전 방 생성부터 참가 확인, 준비 완료, 시작까지 필요한 순서를 안내합니다.",
    alternates: { canonical: guideUrl("/guide/start", game) },
  };
}

function LolStartGuidePage() {
  return (
    <GuidePageLayout
      icon={Users}
      title="빠른 시작"
      description="처음 방을 만드는 순간부터 모든 참가자가 준비를 마치고 팀 구성으로 넘어갈 때까지, 방장이 확인할 핵심 흐름입니다."
    >
      <GuideSection
        title="방 만들기와 로비 준비"
        description="설정을 먼저 확정하면 참가자가 모인 뒤 다시 준비를 받을 일을 줄일 수 있습니다."
      >
        <ol className="grid gap-3 lg:grid-cols-3">
          <GuideStep number={1} title="방 설정">
            참가 인원, 팀 구성 모드, 방장의 선수·운영자 참여 방식, 관전 허용
            여부와 연동할 Discord 서버를 선택합니다.
          </GuideStep>
          <GuideStep number={2} title="참가와 준비">
            실제 플레이어가 모두 입장했는지 확인하고 준비를 받습니다. 관전자는
            팀 구성 인원에서 제외되며, 관전 허용 방이 만석이면 새 입장자는
            자동으로 관전자가 됩니다.
          </GuideStep>
          <GuideStep number={3} title="내전 시작">
            참가자 전원이 준비하고 Discord 음성 대기실에 들어오면 방장이 다음
            단계로 진행합니다. 로비의 시작 조건 카드에서 미완료 인원과 이유를
            확인할 수 있습니다.
          </GuideStep>
        </ol>
      </GuideSection>

      <GuideSection
        title="방 생성 항목 자세히 보기"
        description="방을 만든 뒤에도 대부분 바꿀 수 있지만, 참가자가 들어온 뒤 바꾸면 준비 상태와 팀 배정을 다시 확인해야 합니다. Discord 서버는 생성 뒤 변경할 수 없습니다."
      >
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <InfoCard
            icon={Settings2}
            title="방 제목과 Discord 서버"
            description="방 제목은 내전 목록과 Discord 카테고리 이름에 함께 사용됩니다. 서버를 선택하면 그곳에 『방 제목』 카테고리, 대기실과 팀 음성 채널이 생성됩니다."
          />
          <InfoCard
            icon={Users}
            title="방장 참여와 참가 인원"
            description="선수 방장은 정원과 팀 편성에 포함됩니다. 운영자 방장은 선수 자리를 차지하지 않고 시작·편성·결과 입력만 담당합니다. 관전자는 참가 정원에서 제외됩니다."
          />
          <InfoCard
            icon={Play}
            title="경기 방식"
            description="단판·다전제와 참가 인원을 함께 정합니다. 15·30명은 리그전, 20·40명은 토너먼트이며 더블 일리미네이션은 경기 수가 크게 늘어납니다."
          />
          <InfoCard
            icon={DoorOpen}
            title="팀 구성 방식"
            description="경매·스네이크는 팀장이 선수를 고르고, 자동 밸런스는 시스템이 팀과 역할을 편성합니다. 자유 팀 선택은 참가자가 로비에서 직접 팀을 골라야 준비할 수 있습니다."
          />
          <InfoCard
            icon={LockKeyhole}
            title="비공개 방"
            description="비밀번호를 켜면 비밀번호를 아는 사람만 입장할 수 있습니다. 비밀번호는 4자 이상이며 방 링크를 공유할 때 따로 전달해야 합니다."
          />
          <InfoCard
            icon={Eye}
            title="관전 허용"
            description="관전자는 선수 정원·팀 구성·준비 인원에서 제외됩니다. 관전 허용 방은 선수 자리가 가득 찬 뒤 들어오는 사용자를 관전자로 받습니다."
          />
        </div>
      </GuideSection>

      <GuideSection
        title="로비에서 시작 조건 확인하기"
        description="시작 버튼을 눌러 오류를 확인하는 방식이 아니라, 로비 상단의 시작 조건 카드가 현재 막힌 단계를 계속 보여줍니다."
      >
        <ol className="grid gap-3 lg:grid-cols-3">
          <GuideStep number={1} title="Discord 대기실 입장">
            방 생성 때 선택한 서버에서 「『방 제목』 → ── 대기실 ──」 음성
            채널에 들어갑니다. 카드의 스피커 표시와 시작 조건에서 미입장자를
            확인할 수 있습니다.
          </GuideStep>
          <GuideStep number={2} title="준비 완료">
            게임·포지션·진행 준비가 끝난 참가자는 준비 완료를 누릅니다. 준비하지
            않은 사람은 시작 조건 카드에 이름이 남고, 다시 누르면 준비를 취소할
            수 있습니다.
          </GuideStep>
          <GuideStep number={3} title="방장이 시작">
            참가 인원, 팀 선택, Discord 대기실, 준비 완료 카드가 모두 초록색이
            되면 시작 버튼이 활성화됩니다. 팀 확정 후 봇이 각 팀 음성 채널로
            자동 이동시킵니다.
          </GuideStep>
        </ol>
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-accent-primary/[0.07] p-4 text-sm leading-6 text-text-secondary">
          <Headphones className="mt-0.5 h-5 w-5 flex-none text-accent-primary" />
          Discord 계정만 연동하는 것으로는 부족합니다. 실제로 생성된 음성
          대기실에 접속해 있어야 시작 조건을 통과합니다.
        </div>
      </GuideSection>

      <GuideSection title="시작 전에 확인할 것">
        <div className="grid gap-3 md:grid-cols-3">
          <InfoCard
            icon={DoorOpen}
            title="참가 조건"
            description="정원과 준비 상태를 기준으로 참가자를 확정하고, 늦는 인원은 대기자 교체 여부를 먼저 정합니다."
          />
          <InfoCard
            icon={Users}
            title="팀 구성 방식"
            description="경매·스네이크·자동 밸런스·자유 팀 선택 중 이번 내전의 목적에 맞는 방식을 미리 공지합니다."
          />
          <InfoCard
            icon={Play}
            title="다음 단계 안내"
            description="팀 구성 뒤 역할 선택과 대진표가 이어진다는 점을 시작 전에 짧게 공유합니다."
          />
        </div>
      </GuideSection>

      <GuideSection title="15분 전 체크리스트">
        <BulletList>
          <Bullet>플레이할 인원과 관전자를 구분했습니다.</Bullet>
          <Bullet>
            모든 참가자가 준비 상태이며 팀 구성 방식을 알고 있습니다.
          </Bullet>
          <Bullet>
            모든 참가자가 생성된 Discord 음성 대기실에 들어왔습니다.
          </Bullet>
          <Bullet>
            지연 시 대기자 교체 시각과 다음 행동을 한 문장으로 안내합니다.
          </Bullet>
        </BulletList>
        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-accent-primary/[0.07] p-4 text-sm leading-6 text-text-secondary">
          <CheckCircle2 className="h-5 w-5 flex-none text-accent-primary" />
          준비 상태는 단순 출석이 아니라 지금 바로 팀 구성으로 넘어갈 수 있다는
          신호로 사용하세요.
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
  return game === "PUBG" ? <PubgStartGuide /> : <LolStartGuidePage />;
}
