import type { Metadata } from "next";
import { Brackets, Flag, Gamepad2, Trophy } from "lucide-react";
import { guideGame, guideUrl } from "@/lib/guide-links";
import { GuideFigure, GuidePageLayout, GuideSection, GuideStep, InfoCard } from "../_components/GuidePageLayout";
import { PubgMatchFlowGuide } from "../_content/pubg";

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
    title: game === "PUBG" ? "경기 진행 가이드 (배그) — Nexus" : "경기 진행 가이드 — Nexus",
    description: "역할 선택, 대진표 생성, 경기 시작과 결과 기록 순서를 안내합니다.",
    alternates: { canonical: guideUrl("/guide/match-flow", game) },
  };
}

function LolMatchFlowGuidePage() {
  return (
    <GuidePageLayout
      icon={Trophy}
      title="경기 진행"
      description="팀이 정해진 뒤 역할을 확정하고 대진을 진행해 결과를 남기는 전체 흐름입니다."
    >
      <GuideSection title="역할 선택">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["TOP", "탑"],
            ["JGL", "정글"],
            ["MID", "미드"],
            ["BOT", "바텀"],
            ["SUP", "서포터"],
          ].map(([code, label]) => (
            <div key={code} className="rounded-2xl bg-bg-primary/35 p-5">
              <p className="text-xs font-black tracking-[0.14em] text-accent-primary">{code}</p>
              <p className="mt-2 font-bold text-text-primary">{label}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm leading-7 text-text-secondary">
          역할은 팀마다 하나씩 선택합니다. 같은 역할을 다시 누르면 취소할 수 있습니다. 제한 시간은 5분이며, 팀장이 「팀 역할 확정」을 누르고 모든 팀이 확정하면 바로 대진표로 넘어갑니다. 시간이 끝나거나 확정 시점에 비어 있는 역할은 주/부 선호 포지션을 참고해 자동 배정됩니다.
        </p>
      </GuideSection>

      <GuideSection title="대진부터 결과까지">
        <ol className="grid gap-3 lg:grid-cols-3">
          <GuideStep number={1} title="대진표 생성">4팀·8팀은 첫 라운드를 무작위로 구성하고 단일 또는 더블 엘리미네이션을 진행합니다. 그 외 팀 수는 리그 방식으로 진행합니다.</GuideStep>
          <GuideStep number={2} title="진영 정하기와 경기 시작">경기마다 양 팀장이 가위바위보 단판으로 진영을 정합니다. 이긴 팀장이 블루·레드 중 하나를 고르고, 다전제의 다음 세트는 직전 세트에서 진 팀이 고릅니다. 진영이 정해지면 방장이 경기를 시작합니다.</GuideStep>
          <GuideStep number={3} title="결과 입력">승리 팀과 경기 결과를 확정하면 다음 대진과 전적에 반영됩니다.</GuideStep>
        </ol>
        <div className="mt-5">
          <GuideFigure
            src="/images/guide/bracket.webp"
            alt="4팀 단일 엘리미네이션 대진표. 준결승 두 경기와 결승이 이어져 있고, 끝난 경기는 이긴 팀에 트로피, 진행 중인 경기는 세트 번호와 블루·레드 진영이 표시된다"
            width={1120}
            height={542}
            caption="대진표 — 경기 카드마다 다전제 길이(BO3)와 상태(대기·진행 중·완료)가 붙고, 진영이 정해지면 팀 옆에 블루·레드가 표시됩니다. 경기 카드를 누르면 진영 정하기·시작·결과 입력 창이 열립니다."
          />
        </div>
      </GuideSection>

      <GuideSection title="단계별 핵심">
        <div className="grid gap-3 md:grid-cols-3">
          <InfoCard icon={Gamepad2} title="역할" description="팀마다 역할이 겹치지 않는지 확인합니다." />
          <InfoCard icon={Brackets} title="대진" description="팀 수에 맞는 경기 방식을 선택하고 첫 대진을 확정합니다." />
          <InfoCard icon={Flag} title="결과" description="경기 직후 사실 정보부터 기록해 다음 경기가 지연되지 않게 합니다." />
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
  return game === "PUBG" ? <PubgMatchFlowGuide /> : <LolMatchFlowGuidePage />;
}
