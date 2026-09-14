"use client";

import { useCallback, useEffect, useState } from "react";
import { buildLadderDraw, type LadderDraw } from "@nexus/types";
import { LadderDrawBoard } from "@/components/domain/LadderDrawBoard";
import { Button } from "@/components/ui";

/**
 * 개발용 프리뷰 — 픽 순서 추첨 사다리를 팀 수별로 본다.
 * 접속: http://localhost:3000/dev/ladder
 *
 * 실제 사다리는 스네이크 드래프트가 시작돼야 나와서(로그인 + 방 + 팀 2개
 * 이상) 눈으로 확인할 방법이 없었다. 서버와 **같은 함수**(`buildLadderDraw`)를
 * 같은 방식(암호학적 난수 대신 `Math.random`)으로 불러 그리므로 모양과
 * 밀도가 실제와 같다.
 *
 * 폭은 드래프트 화면과 같은 `max-w-6xl` 로 맞춘다 — 전폭으로 두고 보면
 * 사다리가 실제보다 작아 보여 판단을 그르친다.
 */
const CASES: Array<[number, string]> = [
  [2, "롤 10명 · 2팀"],
  [4, "배그 킬내기 16명 · 4팀"],
  [8, "롤 40명 · 8팀"],
  [25, "배그 배틀로얄 100명 · 25팀"],
];

const COLORS = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767",
];

function makeCase(count: number) {
  const ids = Array.from({ length: count }, (_, i) => `T${i + 1}`);
  // 추첨 결과도 매번 섞는다 — 서버가 셔플한 순서를 받는 상황과 같다.
  const order = [...ids].sort(() => Math.random() - 0.5);
  return {
    draw: buildLadderDraw(ids, order, (max) => Math.floor(Math.random() * max)),
    teams: ids.map((id, i) => ({
      id,
      name: `팀 ${i + 1}`,
      color: COLORS[i % COLORS.length],
    })),
  };
}

type Case = { label: string; count: number } & ReturnType<typeof makeCase>;

export default function DevLadder() {
  const [seed, setSeed] = useState(0);
  // **마운트 뒤에 뽑는다.** `useState` 초기값에서 `Math.random()` 을 부르면
  // 서버 렌더와 클라이언트 렌더가 다른 사다리를 그려 하이드레이션이 깨진다.
  // 실제 화면은 서버가 만든 사다리를 prop 으로 받으므로 이 문제가 없다.
  const [draws, setDraws] = useState<Case[] | null>(null);
  const redraw = useCallback(() => {
    setDraws(
      CASES.map(([count, label]) => ({ label, count, ...makeCase(count) })),
    );
    setSeed((n) => n + 1);
  }, []);
  useEffect(() => {
    redraw();
  }, [redraw]);

  return (
    <div className="container mx-auto max-w-6xl space-y-10 p-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-tertiary">
          세로줄을 눌러 타고 내려간다. 안 누르면 2.6초마다 한 줄씩 알아서
          공개된다.
        </p>
        <Button size="sm" onClick={redraw}>
          다시 뽑기
        </Button>
      </div>
      {(draws ?? []).map(({ label, count, draw, teams }) => (
        <section key={label}>
          <p className="mb-3 text-xs font-bold text-text-tertiary">
            {label} · 가로줄 {draw.rungs.length}개 · {draw.rowCount}행
          </p>
          <div className="rounded-2xl border border-bg-tertiary bg-bg-secondary p-4">
            <LadderDrawBoard
              key={`${label}-${seed}`}
              draw={draw as LadderDraw}
              teams={teams}
            />
          </div>
        </section>
      ))}
    </div>
  );
}
