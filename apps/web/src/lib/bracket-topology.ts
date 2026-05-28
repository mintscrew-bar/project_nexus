// 더블 엘리미네이션 진출/하강 토폴로지 (시각화 전용 단일 소스)
//
// ⚠️ 동기화 규칙: 이 파일은 백엔드의 실제 진행 로직
//   apps/api/src/modules/match/match-advancement.service.ts → advanceDoubleElimination
//   과 정확히 일치해야 한다. 해당 규칙은 match-advancement.service.spec.ts 로 잠겨 있으므로,
//   백엔드 토폴로지를 바꾸면 이 파일과 그 테스트도 함께 갱신할 것.
//
// 섹션별 규칙 요약 (4팀 / 8팀):
//   WB_R1  승자 → WB_R2(8팀)|WB_F(4팀) [floor(i/2), 짝=A·홀=B]
//          패자 → LB_R1  (4팀: 0번 매치 i==0?A:B / 8팀: i<2?[i]·A : [3-i]·B)
//   WB_R2  승자 → WB_F  [0, i==0?A:B]            패자 → LB_R2 [i, B]
//   WB_F   승자 → GF    [0, A]                    패자 → LB_F  [0, B]
//   LB_R1  승자 → LB_R2(8팀)|LB_F(4팀) [1:1, A]   패자 → 탈락
//   LB_R2  승자 → LB_SEMI [0, i==0?A:B]           패자 → 탈락
//   LB_SEMI승자 → LB_F   [0, A]                   패자 → 탈락
//   LB_F   승자 → GF    [0, B]                    패자 → 탈락
//   GF     종료

export type BracketSlot = "A" | "B";

export interface FeederTarget {
  /** 대상 매치의 bracketSection */
  section: string;
  /** 섹션 내 매치 인덱스 (matchNumber 오름차순, 0-base) */
  slotIndex: number;
  /** 대상 매치에서 채워질 팀 슬롯 */
  slot: BracketSlot;
}

export interface MatchFeeders {
  /** 승자 진출 대상 (null이면 챔피언/토너먼트 종료) */
  winner: FeederTarget | null;
  /** 패자 하강 대상 (null이면 탈락) */
  loser: FeederTarget | null;
}

/**
 * 한 더블 엘리미네이션 매치의 승자·패자 행선지를 반환한다.
 * @param section 매치의 bracketSection (예: "WB_R1")
 * @param index   섹션 내 매치 인덱스 (matchNumber 오름차순 0-base)
 * @param sectionCounts 브래킷에 존재하는 섹션별 매치 수 (4팀/8팀 및 라운드 유무 판별)
 */
export function getDoubleElimFeeders(
  section: string,
  index: number,
  sectionCounts: Record<string, number>,
): MatchFeeders {
  const has = (s: string) => (sectionCounts[s] ?? 0) > 0;

  switch (section) {
    case "WB_R1": {
      // 승자: WB_R2가 있으면(8팀) 그쪽, 없으면(4팀) WB_F. floor(i/2)에 짝=A·홀=B.
      const winner: FeederTarget = {
        section: has("WB_R2") ? "WB_R2" : "WB_F",
        slotIndex: Math.floor(index / 2),
        slot: index % 2 === 0 ? "A" : "B",
      };
      // 패자: LB_R1. 4팀은 단일 매치(i==0?A:B), 8팀은 교차 배치(0↔3, 1↔2).
      const lbCount = sectionCounts["LB_R1"] ?? 0;
      const loser: FeederTarget =
        lbCount <= 1
          ? { section: "LB_R1", slotIndex: 0, slot: index === 0 ? "A" : "B" }
          : {
              section: "LB_R1",
              slotIndex: index < 2 ? index : 3 - index,
              slot: index < 2 ? "A" : "B",
            };
      return { winner, loser };
    }

    case "WB_R2":
      return {
        winner: { section: "WB_F", slotIndex: 0, slot: index === 0 ? "A" : "B" },
        loser: { section: "LB_R2", slotIndex: index, slot: "B" },
      };

    case "WB_F":
      return {
        winner: { section: "GF", slotIndex: 0, slot: "A" },
        loser: { section: "LB_F", slotIndex: 0, slot: "B" },
      };

    case "LB_R1":
      // 다음 LB 라운드와 1:1 대응. 8팀: LB_R2[i], 4팀: LB_F[0]. 모두 teamA.
      return {
        winner: {
          section: has("LB_R2") ? "LB_R2" : "LB_F",
          slotIndex: has("LB_R2") ? index : 0,
          slot: "A",
        },
        loser: null,
      };

    case "LB_R2":
      return {
        winner: { section: "LB_SEMI", slotIndex: 0, slot: index === 0 ? "A" : "B" },
        loser: null,
      };

    case "LB_SEMI":
      return { winner: { section: "LB_F", slotIndex: 0, slot: "A" }, loser: null };

    case "LB_F":
      return { winner: { section: "GF", slotIndex: 0, slot: "B" }, loser: null };

    case "GF":
    default:
      return { winner: null, loser: null };
  }
}

/** 패자 하강 대상 슬롯에 붙일 한국어 라벨 (예: LB_R1 teamA ← "WB 1라운드 패자") */
export const FEEDER_SOURCE_LABEL: Record<string, string> = {
  WB_R1: "WB 1라운드 패자",
  WB_R2: "WB 준결승 패자",
  WB_F: "WB 결승 패자",
  LB_R1: "LB 1라운드 승자",
  LB_R2: "LB 2라운드 승자",
  LB_SEMI: "LB 준결승 승자",
  LB_F: "LB 결승 승자",
};
