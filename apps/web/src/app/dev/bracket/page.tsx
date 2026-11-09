"use client";

// 개발용 프리뷰 — 4팀 싱글 엘리미네이션 대진표
// 접속: http://localhost:3010/dev/bracket
//
// 실제 대진표는 로그인 + 팀 구성이 끝난 방이 있어야 보여서, 같은 BracketView 에
// 가짜 대진을 넣어 그린다. 가이드(경기 진행) 캡처에도 쓴다.

import { useState } from "react";
import { BracketView, type Match } from "@/components/domain/BracketView";
import { MATCHES, TEAMS } from "./mock";


/** 준결승 2 를 한타요정 팀 2:0 승리로 끝낸 대진 — 승리 효과 확인용 */
function finishSemi2(matches: Match[]): Match[] {
  return matches.map((m) => {
    if (m.id === "m2")
      return {
        ...m,
        status: "COMPLETED",
        team1: { ...TEAMS[2], score: 2 },
        winner: TEAMS[2],
      };
    if (m.id === "m3") return { ...m, team2: TEAMS[2] };
    return m;
  });
}

export default function BracketPreviewPage() {
  // "준결승 2 끝내기" 를 누르면 보는 중에 승자가 정해지는 상황이 된다
  const [finished, setFinished] = useState(false);
  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          className="rounded-lg bg-accent-primary px-4 py-2 text-sm font-bold text-accent-on"
          onClick={() => setFinished(true)}
        >
          준결승 2 끝내기
        </button>
        <button
          type="button"
          className="rounded-lg bg-bg-tertiary px-4 py-2 text-sm font-bold text-text-primary"
          onClick={() => setFinished(false)}
        >
          되돌리기
        </button>
      </div>
      <div className="rounded-xl border border-bg-tertiary bg-bg-secondary p-4">
        <BracketView
          matches={finished ? finishSemi2(MATCHES) : MATCHES}
          rounds={2}
          onMatchClick={() => {}}
        />
      </div>
    </div>
  );
}
