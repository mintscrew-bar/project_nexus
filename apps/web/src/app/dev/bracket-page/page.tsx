"use client";

// 개발용 프리뷰 — 대진표 페이지 (머리글 + 판 배경 + 판 안 경기 바)
// 접속: http://localhost:3010/dev/bracket-page?as=player|spectator|host&live=1|2
//
// 실제 페이지(/tournaments/[id]/bracket)는 로그인 + 진행 중인 방이 있어야 보여서
// 같은 컴포넌트(BracketHeader·BracketStage·BracketLiveBar·BracketView)에 가짜 대진을 넣는다.
// - as: 보는 사람 입장 (선수 = 운영의신 팀 팀장 / 관전자 / 방장)
// - live: 동시에 진행 중인 경기 수 (1 = 준결승 2만, 2 = 준결승 둘 다)

import { useEffect, useState } from "react";
import {
  BracketHeader,
  BracketLiveBar,
  BracketStage,
  BracketView,
  getStageInfo,
  type Match,
} from "@/components/domain";
import { MATCHES, TEAMS } from "../bracket/mock";

type Viewer = "player" | "spectator" | "host";

// 준결승 두 경기가 동시에 진행 중인 대진
const TWO_LIVE: Match[] = MATCHES.map((m) =>
  m.id === "m1"
    ? {
        ...m,
        status: "IN_PROGRESS",
        winner: undefined,
        team1: { ...TEAMS[0], score: 1 },
        team2: { ...TEAMS[1], score: 1 },
        currentGameNumber: 3,
        currentGameStatus: "IN_PROGRESS",
      }
    : m.id === "m3"
      ? { ...m, team1: undefined }
      : m,
);

/** 방장이 시작해야 하는 상황 — 준결승 2 의 3세트가 아직 시작 전 */
function withReady(matches: Match[]): Match[] {
  return matches.map((m) =>
    m.id === "m2"
      ? { ...m, currentGameNumber: 3, currentGameStatus: "PENDING" }
      : m,
  );
}

export default function BracketPagePreview() {
  // 주소 쿼리는 마운트 뒤에 읽는다 (서버 렌더와 어긋나지 않게)
  const [viewer, setViewer] = useState<Viewer>("player");
  const [live, setLive] = useState(2);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const as = q.get("as");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (as === "spectator" || as === "host") setViewer(as);
    if (q.get("live") === "1") setLive(1);
  }, []);

  const base = live === 2 ? TWO_LIVE : MATCHES;
  const matches = viewer === "host" ? withReady(base) : base;
  const done = matches.filter((m) => m.status === "COMPLETED").length;
  const inProgress = matches.filter((m) => m.status === "IN_PROGRESS").length;
  // 선수 = 운영의신 팀 팀장
  const userId = viewer === "player" ? TEAMS[3].captain.id : "spectator";

  return (
    <div className="p-4 md:p-8">
      <BracketHeader
        backHref="#"
        title="금요일 밤 5:5 내전"
        completed={done}
        inProgress={inProgress}
        total={matches.length}
        isLoading={false}
        onRefresh={() => {}}
        isHost={viewer === "host"}
        isAborting={false}
        // 길게 누르기가 끝나면 한 번 불린다 — 확인용 로그
        onAbort={() => console.log("bracket-abort")}
      />
      <BracketStage
        stage={getStageInfo(matches, 2)}
        infoLine="4 Teams · Bo3 · 2026.11.09"
      >
        <BracketView matches={matches} rounds={2} onMatchClick={() => {}} />
        <div className="pointer-events-none sticky bottom-3 mt-3 [&>*]:pointer-events-auto">
          <BracketLiveBar
            matches={matches}
            userId={userId}
            isHost={viewer === "host"}
            getLabel={(m) =>
              m.round === 2 ? "결승" : `준결승 ${m.matchNumber}`
            }
            onOpen={() => {}}
          />
        </div>
      </BracketStage>
    </div>
  );
}
