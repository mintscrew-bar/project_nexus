import {
  AlarmClock,
  Crosshair,
  Gamepad2,
  Headphones,
  HelpCircle,
  ListOrdered,
  Radio,
  ScrollText,
  Shield,
  Target,
  Timer,
  Trophy,
  Users,
} from "lucide-react";
import {
  Bullet,
  BulletList,
  GuidePageLayout,
  GuideSection,
  GuideStep,
  InfoCard,
} from "../_components/GuidePageLayout";

/**
 * 배그 가이드 본문.
 *
 * 롤 가이드와 문안을 공유하지 않는다. 배그는 라인 선택이 없고, 대진표 대신
 * 라운드 누적 점수로 굴러가며, 계정 연동 방식부터 다르다. 같은 글에 분기를
 * 심으면 두 게임 다 읽기 어려워진다.
 *
 * 여기 적은 내용은 전부 지금 코드가 실제로 하는 동작이다. 아직 해보지 않은
 * 운영 요령(맵 선정, 낙하 지점 합의 같은 것)은 적지 않는다 —
 * 가이드가 사실이 아니면 안 쓰느니만 못하다.
 */

export function PubgStartGuide() {
  return (
    <GuidePageLayout
      icon={Gamepad2}
      title="빠른 시작"
      description="배그 내전은 계정 등록부터 시작합니다. 닉네임으로 계정을 찾아 연동하고, 경기 모드와 정원을 정해 방을 열기까지의 순서입니다."
    >
      <GuideSection
        title="1. PUBG 계정 연동"
        description="내전 참가와 결과 수집이 이 계정을 기준으로 이뤄집니다. 프로필에서 한 번만 해두면 됩니다."
      >
        <ol className="grid gap-3 lg:grid-cols-3">
          <GuideStep number={1} title="닉네임으로 조회">
            게임 내 닉네임을 대소문자까지 정확히 입력합니다. 스팀·카카오를 고를
            필요는 없습니다 — 매치 기록이 나오는 쪽을 서버가 확인합니다.
          </GuideStep>
          <GuideStep number={2} title="계정 확인">
            조회 결과가 본인 계정이 맞는지 확인하고 등록합니다. 확인 단계를 둔
            이유는 아래 &ldquo;소유권&rdquo; 항목에 적었습니다.
          </GuideStep>
          <GuideStep number={3} title="대표 계정 지정">
            계정이 여러 개면 하나를 대표로 둡니다. 로비와 결과 수집이 대표
            계정을 씁니다.
          </GuideStep>
        </ol>
      </GuideSection>

      <GuideSection title="소유권은 확인되지 않습니다">
        <div className="grid gap-3 md:grid-cols-2">
          <InfoCard
            icon={Shield}
            title="선착순이 유일한 기준"
            description="PUBG API에는 계정 소유권을 인증하는 절차가 없습니다. 롤의 Riot 인증 같은 것이 없어, 같은 계정은 먼저 등록한 사람이 가져갑니다."
          />
          <InfoCard
            icon={HelpCircle}
            title="사칭이 의심되면"
            description="등록 화면과 로비 배지에 미검증임이 표시됩니다. 사칭으로 보이는 등록이 있으면 운영자에게 알려주세요."
          />
        </div>
      </GuideSection>

      <GuideSection
        title="2. 방 열기"
        description="배그 방은 플랫폼과 경기 모드를 방 단위로 확정합니다. 스배 방에 카배 사람이 들어와도 같이 할 수 없기 때문입니다."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <InfoCard
            icon={Radio}
            title="플랫폼"
            description="스팀(스배)과 카카오(카배) 중 하나를 고릅니다. 방 제목 앞에 태그로 표시됩니다."
          />
          <InfoCard
            icon={Target}
            title="경기 모드"
            description="킬내기와 배틀로얄 중에 고릅니다. 모드에 따라 정원과 결과 처리 방식이 달라집니다."
          />
          <InfoCard
            icon={Users}
            title="정원"
            description="인게임 스쿼드가 4인이라 정원은 항상 4의 배수입니다. 킬내기 8·12·16명, 배틀로얄 32~100명."
          />
        </div>
      </GuideSection>

      <GuideSection title="시작 전 체크리스트">
        <BulletList>
          <Bullet>참가자 전원이 PUBG 계정을 등록했습니다. 등록하지 않은 인원이 많으면 결과 자동 수집이 어렵습니다.</Bullet>
          <Bullet>방 플랫폼(스배·카배)과 참가자들이 실제로 플레이하는 플랫폼이 같습니다.</Bullet>
          <Bullet>Discord 연동을 쓴다면 봇이 음성 채널을 만들 권한을 갖고 있습니다.</Bullet>
          <Bullet>정원이 다 찼습니다 — 자동 밸런스와 자유 팀 선택은 자리가 모두 채워져야 시작됩니다.</Bullet>
        </BulletList>
      </GuideSection>
    </GuidePageLayout>
  );
}

export function PubgTeamModesGuide() {
  return (
    <GuidePageLayout
      icon={Users}
      title="팀 구성"
      description="배그는 4인 스쿼드가 곧 한 팀입니다. 편을 몇 개로 나눌지는 방에서 정하고, 팀에 사람을 담는 방법은 네 가지 중에 고릅니다."
    >
      <GuideSection
        title="팀 = 4인 스쿼드"
        description="인게임 스쿼드 정원이 4명이라 팀 단위도 4명입니다. 16명 방이면 4스쿼드가 나오고, 그 넷을 2대2로 붙일지 1대1대1대1로 붙일지는 방에서 정합니다."
      >
        <BulletList>
          <Bullet>정원이 4의 배수인 이유입니다. 6명·14명 같은 정원은 인게임에서 3인·2인 스쿼드를 만들어 실제 판과 어긋납니다.</Bullet>
          <Bullet>롤과 달리 라인(포지션) 선택 단계가 없습니다. 팀이 정해지면 바로 경기로 넘어갑니다.</Bullet>
        </BulletList>
      </GuideSection>

      <GuideSection title="팀을 담는 네 가지 방법">
        <div className="grid gap-3 md:grid-cols-2">
          <InfoCard
            icon={Trophy}
            title="경매 드래프트"
            description="팀장이 포인트로 팀원을 낙찰받습니다. 가장 오래 걸리지만 참가자들이 가장 즐거워하는 방식입니다."
          />
          <InfoCard
            icon={ListOrdered}
            title="스네이크 드래프트"
            description="팀장이 순서대로 한 명씩 지명합니다. 픽 순서는 사다리타기로 뽑아 화면에 보여줍니다."
          />
          <InfoCard
            icon={Target}
            title="자동 밸런스"
            description="NEXUS 편성 점수를 기준으로 서버가 팀을 나눕니다. 방장이 결과를 확인하고 다시 돌리거나 확정합니다."
          />
          <InfoCard
            icon={Users}
            title="자유 팀 선택"
            description="참가자가 원하는 팀 자리에 직접 들어갑니다. 이미 팀이 정해져 있을 때 가장 빠릅니다."
          />
        </div>
      </GuideSection>

      <GuideSection
        title="NEXUS 편성 점수"
        description="공식 PUBG 랭크가 아니라 내전 팀을 맞추기 위한 별도 값입니다."
      >
        <BulletList>
          <Bullet>전투력·오더·팀 기여·안정성·경험 다섯 항목을 합산합니다. 프로필에서 직접 입력할 수 있습니다.</Bullet>
          <Bullet>내전 기록이 쌓이면 자동으로 산정됩니다. 사람이 입력한 값과 운영자 보정은 자동 산정이 덮지 않습니다.</Bullet>
          <Bullet>점수가 없는 참가자는 자동 밸런스에서 참가자 평균으로 놓입니다. 몇 명이 그랬는지 편성 결과에 표시됩니다.</Bullet>
        </BulletList>
      </GuideSection>
    </GuidePageLayout>
  );
}

export function PubgMatchFlowGuide() {
  return (
    <GuidePageLayout
      icon={Crosshair}
      title="경기 진행"
      description="배그는 대진표를 만들지 않습니다. 라운드를 반복하며 점수를 누적하고, 그 합계로 순위를 가립니다."
    >
      <GuideSection title="킬내기">
        <div className="grid gap-3 md:grid-cols-3">
          <InfoCard
            icon={Timer}
            title="시간제로 굴립니다"
            description="방을 열 때 진행 시간을 정합니다. 시간 안에 시작한 경기까지 점수에 넣습니다."
          />
          <InfoCard
            icon={Crosshair}
            title="킬 +1 · 사망 −3 · 치킨 +8"
            description="사망이 감점이라 합계가 음수가 될 수 있습니다. 많이 죽어도 손해가 없으면 규칙이 무의미해지기 때문입니다."
          />
          <InfoCard
            icon={Target}
            title="사녹은 치킨 +5"
            description="맵이 좁아 치킨이 자주 나오는 만큼 보너스를 낮춰 잡는 관례가 있습니다. 별도 프리셋으로 준비돼 있습니다."
          />
        </div>
      </GuideSection>

      <GuideSection title="배틀로얄 스크림">
        <ol className="grid gap-3 lg:grid-cols-3">
          <GuideStep number={1} title="라운드 시작">
            방장이 라운드를 시작하면 그 시각이 기록됩니다. 결과를 인게임 기록에서
            찾을 때 이 시각을 기준으로 씁니다.
          </GuideStep>
          <GuideStep number={2} title="경기">
            여러 팀이 같은 커스텀 매치에 들어가 한 판을 치릅니다.
          </GuideStep>
          <GuideStep number={3} title="결과 누적">
            순위 점수와 킬 점수를 합산해 리더보드에 쌓습니다. 라운드를 반복합니다.
          </GuideStep>
        </ol>
      </GuideSection>

      <GuideSection
        title="결과 넣기"
        description="자동으로 찾아오는 경로와 직접 넣는 경로가 둘 다 있습니다."
      >
        <BulletList>
          <Bullet>방장이 「결과 가져오기」를 누르면 최근 커스텀 매치에서 이 라운드의 경기를 찾아 채웁니다.</Bullet>
          <Bullet>애매하면 아무것도 쓰지 않고 이유를 알려줍니다. 잘못 주워 온 결과를 나중에 찾아 고치는 편이 더 오래 걸리기 때문입니다.</Bullet>
          <Bullet>자동이 실패해도 「결과 수정」으로 직접 넣을 수 있습니다. 자동 수집이 라운드를 잠그지 않습니다.</Bullet>
          <Bullet>PUBG는 커스텀 매치 기록을 2주만 보관합니다. 라운드를 끝냈으면 그 안에 결과를 넣어주세요.</Bullet>
        </BulletList>
      </GuideSection>
    </GuidePageLayout>
  );
}

export function PubgDiscordGuide() {
  return (
    <GuidePageLayout
      icon={Headphones}
      title="Discord 연동"
      description="방을 만들면 봇이 카테고리와 음성 채널을 만들고, 팀이 정해지면 사람을 각 스쿼드 채널로 옮깁니다."
    >
      <GuideSection title="방을 열면 생기는 것">
        <div className="grid gap-3 md:grid-cols-3">
          <InfoCard
            icon={Headphones}
            title="카테고리 + 대기실"
            description="방 이름으로 카테고리를 만들고 그 안에 대기실 음성 채널을 둡니다. 대기실 정원은 방 정원을 따라갑니다."
          />
          <InfoCard
            icon={Users}
            title="스쿼드 채널"
            description="스쿼드마다 4인 정원의 채널이 하나씩 생깁니다. 100명 배틀로얄이면 25개가 만들어집니다."
          />
          <InfoCard
            icon={AlarmClock}
            title="방이 끝나면 삭제"
            description="종료·완료·정리 작업 어느 경로로든 채널이 통째로 지워집니다. 서버에 쌓이지 않습니다."
          />
        </div>
      </GuideSection>

      <GuideSection title="봇으로 방 열기">
        <BulletList>
          <Bullet><code>/nexus schedule</code> 로 Discord에서 바로 배그 방을 예약할 수 있습니다.</Bullet>
          <Bullet>게임·경기 모드·플랫폼·정원을 명령 옵션으로 고릅니다.</Bullet>
          <Bullet>예약한 방은 시간이 되면 자동으로 열리고 공지가 나갑니다.</Bullet>
        </BulletList>
      </GuideSection>

      <GuideSection title="권한 확인">
        <BulletList>
          <Bullet>봇에게 채널 관리 권한이 없으면 방을 만들 때 실패합니다.</Bullet>
          <Bullet>음성 채널 이동을 쓰려면 멤버 이동 권한도 필요합니다.</Bullet>
          <Bullet>참가자는 로비 대기실에 들어와 있어야 시작 시 팀 채널로 옮겨집니다.</Bullet>
        </BulletList>
      </GuideSection>
    </GuidePageLayout>
  );
}

export function PubgRecordsGuide() {
  return (
    <GuidePageLayout
      icon={ScrollText}
      title="기록과 커뮤니티"
      description="라운드 결과가 들어가면 리더보드와 개인 전적에 함께 쌓입니다."
    >
      <GuideSection title="어디에 남는가">
        <div className="grid gap-3 md:grid-cols-3">
          <InfoCard
            icon={Trophy}
            title="스크림 리더보드"
            description="라운드별 점수와 누적 점수를 한 표에서 봅니다. 동점이면 킬 수와 최고 순위로 가릅니다."
          />
          <InfoCard
            icon={ScrollText}
            title="개인 전적"
            description="프로필에서 참가한 내전과 평균 순위·킬을 봅니다. 계정을 지운 뒤에도 지난 기록은 남습니다."
          />
          <InfoCard
            icon={Radio}
            title="Discord 결과 공지"
            description="경기가 끝나면 연동된 서버에 결과가 공지됩니다."
          />
        </div>
      </GuideSection>

      <GuideSection title="알아둘 것">
        <BulletList>
          <Bullet>팀이 지워져도 기록은 남습니다. 기록 시점의 팀 이름을 함께 저장하기 때문입니다.</Bullet>
          <Bullet>결과를 넣지 않은 라운드는 리더보드에서 빈 칸으로 남습니다. 0점과 구분됩니다.</Bullet>
          <Bullet>점수 규칙을 바꾸면 이미 넣은 결과가 새 규칙으로 다시 계산됩니다.</Bullet>
        </BulletList>
      </GuideSection>
    </GuidePageLayout>
  );
}

export function PubgFaqGuide() {
  const items = [
    {
      q: "스팀이랑 카카오, 등록할 때 골라야 하나요?",
      a: "아니요. 닉네임 조회는 두 플랫폼에서 같은 계정을 돌려줍니다. 갈리는 것은 매치 기록뿐이라, 기록이 나오는 쪽을 서버가 확인해 기억합니다. 다만 방은 플랫폼을 정해야 합니다 — 스배 방에 카배 사람이 들어와도 같이 플레이할 수 없기 때문입니다.",
    },
    {
      q: "다른 사람이 제 닉네임을 먼저 등록했습니다.",
      a: "PUBG API에는 소유권을 인증하는 절차가 없어, 같은 계정은 먼저 등록한 사람이 가져갑니다. 사칭으로 보이면 운영자에게 알려주세요. 등록 화면과 로비 배지에 미검증임이 표시됩니다.",
    },
    {
      q: "정원이 왜 4의 배수뿐인가요?",
      a: "인게임 스쿼드 정원이 4명이라 그렇습니다. 6명(3대3)이나 14명(7대7)으로 방을 열면 인게임에서 3인·2인 스쿼드가 생겨 실제 판과 어긋납니다.",
    },
    {
      q: "16명이면 8대8인가요, 4파전인가요?",
      a: "둘 다 됩니다. 16명이면 4인 스쿼드가 넷 나오고, 그 넷을 2대2로 붙일지 1대1대1대1로 붙일지는 방에서 정합니다. 사이트는 스쿼드 단위까지만 관리합니다.",
    },
    {
      q: "결과가 자동으로 안 들어옵니다.",
      a: "커스텀 매치가 아니거나, 라운드 시작 시각과 맞는 경기를 못 찾았거나, 참가자 명단이 충분히 겹치지 않은 경우입니다. 화면에 어느 쪽인지 표시됩니다. PUBG 계정을 등록하지 않은 참가자가 많으면 명단이 안 맞습니다. 그럴 때는 직접 입력하면 됩니다.",
    },
    {
      q: "조회하는데 «잠시 밀려 있습니다»가 뜹니다.",
      a: "PUBG API 호출량이 분당 한도에 걸린 것입니다. 잠시 뒤 다시 시도해주세요. 한 번 조회한 닉네임은 캐시에 남아 다시 조회해도 한도를 쓰지 않습니다.",
    },
    {
      q: "대진표는 어디 있나요?",
      a: "배그는 대진표를 쓰지 않습니다. 킬내기와 배틀로얄 모두 라운드를 반복하며 점수를 누적하고, 그 합계로 순위를 가립니다.",
    },
  ];

  return (
    <GuidePageLayout
      icon={HelpCircle}
      title="자주 묻는 질문"
      description="배그 내전을 열기 전에 가장 많이 나오는 질문들입니다."
    >
      <GuideSection title="계정과 방 설정">
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.q} className="rounded-2xl bg-bg-primary/35 p-5">
              <h3 className="text-base font-bold text-text-primary">{item.q}</h3>
              <p className="mt-2 text-sm leading-7 text-text-secondary">
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </GuideSection>
    </GuidePageLayout>
  );
}
