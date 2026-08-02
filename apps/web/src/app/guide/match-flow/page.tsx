import type { Metadata } from "next";
import { Brackets, Flag, Gamepad2, Trophy } from "lucide-react";
import { absoluteUrl } from "@/lib/seo";
import { GuidePageLayout, GuideSection, GuideStep, InfoCard } from "../_components/GuidePageLayout";

export const metadata: Metadata = {
  title: "경기 진행 가이드 — Nexus",
  description: "역할 선택, 대진표 생성, 경기 시작과 결과 기록 순서를 안내합니다.",
  alternates: { canonical: absoluteUrl("/guide/match-flow") },
};

export default function MatchFlowGuidePage() {
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
          역할은 팀마다 하나씩 선택합니다. 같은 역할을 다시 누르면 취소할 수 있고, 제한 시간이 끝나면 선호 포지션을 참고해 자동 배정됩니다.
        </p>
      </GuideSection>

      <GuideSection title="대진부터 결과까지">
        <ol className="grid gap-3 lg:grid-cols-3">
          <GuideStep number={1} title="대진표 생성">4팀·8팀은 첫 라운드를 무작위로 구성하고 단일 또는 더블 엘리미네이션을 진행합니다. 그 외 팀 수는 리그 방식으로 진행합니다.</GuideStep>
          <GuideStep number={2} title="경기 시작">방장이 현재 대진을 확인하고 경기를 시작합니다. 방송을 사용한다면 송출할 경기도 함께 맞춥니다.</GuideStep>
          <GuideStep number={3} title="결과 입력">승리 팀과 경기 결과를 확정하면 다음 대진과 전적에 반영됩니다.</GuideStep>
        </ol>
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
