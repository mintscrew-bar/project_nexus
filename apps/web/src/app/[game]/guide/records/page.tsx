import type { Metadata } from "next";
import { BarChart3, Shield, Trophy } from "lucide-react";
import { guideGame, guideUrl } from "@/lib/guide-links";
import { Bullet, BulletList, GuideFigure, GuidePageLayout, GuideSection, InfoCard } from "../_components/GuidePageLayout";
import { PubgRecordsGuide } from "../_content/pubg";

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
    title: game === "PUBG" ? "기록과 커뮤니티 가이드 (배그) — Nexus" : "기록과 커뮤니티 가이드 — Nexus",
    description: "내전 전적, 랭킹, 클랜 기능을 다음 경기 준비에 활용하는 방법을 안내합니다.",
    alternates: { canonical: guideUrl("/guide/records", game) },
  };
}

function LolRecordsGuidePage() {
  return (
    <GuidePageLayout
      icon={BarChart3}
      title="기록과 커뮤니티"
      description="한 경기의 결과를 줄 세우기가 아닌, 다음 내전을 더 빠르고 납득 가능하게 준비하는 자료로 남겨보세요."
    >
      <GuideSection title="기록 살펴보기">
        <div className="grid gap-3 md:grid-cols-3">
          <InfoCard href="/lol/matches" icon={BarChart3} title="내전 전적" description="승패, KDA, 챔피언과 역할 기록을 경기별로 확인합니다." />
          <InfoCard href="/lol/ranking" icon={Trophy} title="랭킹" description="누적된 경기 기록을 기준으로 참가자 순위를 살펴봅니다." />
          <InfoCard href="/clans?game=lol" icon={Shield} title="클랜" description="함께 플레이할 커뮤니티를 찾고 구성원의 활동을 확인합니다." />
        </div>
      </GuideSection>

      <GuideSection
        title="내전 상세 화면 읽기"
        description="경기 데이터가 수집된 내전은 대회 중계처럼 흐름과 개인 기록을 한 화면에서 볼 수 있습니다. 전적 목록에서 내전 기록을 누르면 그 자리에서 펼쳐지고, 상세 페이지로 따로 열 수도 있습니다."
      >
        <div className="space-y-4">
          <GuideFigure
            src="/images/guide/match-gold.webp"
            alt="내전 상세의 팀 골드 차이 그래프. 선이 0 위면 블루 팀, 아래면 레드 팀이 앞선다"
            width={1600}
            height={528}
            caption="골드 차이 — 0을 기준으로 위는 블루 팀, 아래는 레드 팀 우세입니다. 위아래 아이콘은 드래곤·공허 유충·전령·내셔 남작·포탑·억제기를 가져간 시점입니다."
          />
          <GuideFigure
            src="/images/guide/match-stats.webp"
            alt="내전 상세의 선수별 기록 표. 전투·시야·경제 항목이 숫자 그대로 나온다"
            width={1600}
            height={678}
            caption="선수별 기록 — 전투·시야·경제 항목을 축약 없이 보여주고, 항목별 최고값은 굵게 표시합니다. 머리글을 누르면 팀 안에서 정렬됩니다."
          />
        </div>
        <div className="mt-5">
          <BulletList>
            <Bullet>선수 이름을 누르면 그 선수의 넥서스 전적으로 이동합니다. 넥서스 계정이 없는 선수는 Riot ID 전적 검색으로 연결됩니다.</Bullet>
            <Bullet>Riot 계정을 아직 연동하지 않은 참가자도 기록에 남습니다. 나중에 그 Riot 계정을 연동하면 지난 내전 기록이 자동으로 연결됩니다.</Bullet>
          </BulletList>
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

export default async function GuidePage({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const game = guideGame((await params).game);
  return game === "PUBG" ? <PubgRecordsGuide /> : <LolRecordsGuidePage />;
}
