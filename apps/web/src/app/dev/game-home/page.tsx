"use client";

import { DashboardHero } from "@/components/home/DashboardContent";

/**
 * 개발용 프리뷰 — 롤·배그 홈 히어로를 나란히 본다.
 * 접속: http://localhost:3000/dev/game-home
 *
 * 홈 대시보드는 로그인 뒤에만 그려져서, 두 게임의 형태 차이(모서리·서체·
 * 광원)를 확인하려면 이렇게 가짜 데이터로 띄워야 한다. 한쪽만 고치고
 * 나머지가 어긋나는 걸 못 보는 일이 실제로 있었다.
 */
const ROOMS = [{ id: "1" }, { id: "2" }, { id: "3" }] as never[];
const STATS = { gamesPlayed: 42, winRate: 57.3 } as never;
const CLAN = { tag: "NXS", name: "넥서스", _count: { members: 12 } } as never;

export default function DevGameHome() {
  return (
    <div className="space-y-10 p-6">
      <section>
        <p className="mb-3 text-xs font-bold text-text-tertiary">LOL</p>
        <DashboardHero
          gameTitle="LOL"
          username="해리"
          rooms={ROOMS}
          stats={STATS}
          primaryAccount={null}
          clan={CLAN}
        />
      </section>
      <section className="game-pubg">
        <p className="mb-3 text-xs font-bold text-text-tertiary">PUBG</p>
        <DashboardHero
          gameTitle="PUBG"
          username="해리"
          rooms={ROOMS}
          stats={STATS}
          primaryAccount={null}
          clan={CLAN}
        />
      </section>
    </div>
  );
}
