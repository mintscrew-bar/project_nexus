import type { Metadata } from "next";
import {
  ArrowLeftRight,
  Coins,
  Gavel,
  ListOrdered,
  Scale,
  Timer,
  UserRoundCheck,
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
import { PubgTeamModesGuide } from "../_content/pubg";

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
        ? "팀 구성 모드 가이드 (배그) — Nexus"
        : "팀 구성 모드 가이드 — Nexus",
    description:
      "경매, 스네이크, 자동 밸런스, 자유 팀 선택의 차이와 진행 방법을 비교합니다.",
    alternates: { canonical: guideUrl("/guide/team-modes", game) },
  };
}

function LolTeamModesGuidePage() {
  return (
    <GuidePageLayout
      icon={Scale}
      title="팀 구성"
      description="가장 공정한 방식 하나를 찾기보다, 이번 내전에서 빠른 시작과 선택의 재미 중 무엇이 중요한지 먼저 정하세요."
    >
      <GuideSection title="모드 한눈에 비교">
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoCard
            icon={Gavel}
            title="경매"
            description="팀장이 제한된 포인트로 선수를 영입합니다. 선택 과정의 전략과 보는 재미가 큽니다."
          />
          <InfoCard
            icon={ListOrdered}
            title="스네이크"
            description="팀장이 정해진 순서로 번갈아 선수를 선택합니다. 규칙이 단순하고 진행을 따라가기 쉽습니다."
          />
          <InfoCard
            icon={Scale}
            title="자동 밸런스"
            description="라인별 티어와 랭크·내전 기록을 반영해 팀과 역할을 함께 나눕니다. 친선전과 빠른 시작에 적합합니다."
          />
          <InfoCard
            icon={ArrowLeftRight}
            title="자유 팀 선택"
            description="참가자가 직접 팀을 고릅니다. 이미 구성이 합의된 연습 경기나 클랜전에 적합합니다."
          />
        </div>
      </GuideSection>

      <GuideSection title="경매와 스네이크 진행">
        <ol className="grid gap-3 lg:grid-cols-3">
          <GuideStep number={1} title="팀장과 규칙 확정">
            팀장, 선택 제한 시간, 경매 포인트와 최소 입찰 단위를 시작 전에
            공지합니다.
          </GuideStep>
          <GuideStep number={2} title="순서대로 선택">
            경매는 최고 입찰 팀이 영입하고, 스네이크는 화면에 표시된 순서로
            선수를 선택합니다.
          </GuideStep>
          <GuideStep number={3} title="역할 선택으로 이동">
            모든 선수가 배정되면 팀 구성을 확인한 뒤 역할 선택 단계로
            넘어갑니다.
          </GuideStep>
        </ol>
      </GuideSection>

      <GuideSection
        title="드래프트 세부 설정"
        description="방 생성 모달에서 고르는 값이 실제 진행에 어떻게 적용되는지 확인하세요."
      >
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <InfoCard
            icon={Coins}
            title="시작 포인트"
            description="경매 팀장마다 처음 지급되는 예산입니다. 남은 팀 자리를 최소 입찰가로 채울 수 있는 포인트는 자동으로 보호됩니다."
          />
          <InfoCard
            icon={Gavel}
            title="최소 입찰 단위"
            description="현재 최고가보다 한 번에 올려야 하는 최소 금액입니다. 단위가 크면 경매가 빨라지고, 작으면 세밀한 경쟁이 가능합니다."
          />
          <InfoCard
            icon={Timer}
            title="입찰·픽 제한 시간"
            description="입찰 제한 시간은 새 선수의 최초 마감 시간입니다. 새 입찰마다 10초 연장되며 현재 시점 기준 최대 30초까지 늘어납니다. 스네이크는 팀장이 한 명을 고를 시간입니다."
          />
          <InfoCard
            icon={UserRoundCheck}
            title="팀장 선정"
            description="점수 상위 자동, 방장 직접 지명, 자원 모집 중 선택합니다. 자원 모집은 30초 뒤 부족한 자리를 점수 기준으로 자동 보충합니다."
          />
        </div>
      </GuideSection>

      <GuideSection title="자동 밸런스와 자유 팀 선택">
        <BulletList>
          <Bullet>
            자동 밸런스는 전원 입장과 준비 완료 뒤 실행하며, 라인별 티어와
            랭크·내전 기록이 최신인지 확인합니다.
          </Bullet>
          <Bullet>
            결과가 어색하면 포지션 충돌처럼 분명한 이유가 있을 때만 소수 인원을
            조정합니다.
          </Bullet>
          <Bullet>
            자유 팀 선택은 참가자가 직접 이동하며, 팀 이동 시 준비 상태가 해제될
            수 있습니다.
          </Bullet>
          <Bullet>
            각 팀 정원이 맞고 모든 참가자가 다시 준비한 뒤 다음 단계로
            진행합니다.
          </Bullet>
        </BulletList>
      </GuideSection>

      <GuideSection title="방식별 시작 조건">
        <BulletList>
          <Bullet>
            모든 방식에서 선수 전원의 준비 완료와 Discord 음성 대기실 입장이
            필요합니다.
          </Bullet>
          <Bullet>
            경매는 최소 4명부터, 스네이크는 최소 10명부터 시작할 수 있어 설정
            정원이 덜 차도 진행할 수 있습니다.
          </Bullet>
          <Bullet>
            자동 밸런스는 설정 정원이 모두 차야 하며, 편성 결과를 방장이 검토해
            재편성하거나 확정합니다.
          </Bullet>
          <Bullet>
            자유 팀 선택은 설정 정원이 모두 차고 각 팀이 5명씩 맞아야 합니다.
            팀을 옮기면 준비 상태가 해제됩니다.
          </Bullet>
        </BulletList>
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
  return game === "PUBG" ? <PubgTeamModesGuide /> : <LolTeamModesGuidePage />;
}
