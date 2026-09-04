/**
 * 라운드에 해당하는 커스텀 매치를 골라내는 규칙.
 *
 * 순수 함수로 떼어 둔 이유는 이 판단이 **아직 실측되지 않았기 때문이다**
 * (Phase 0 Task 3). 커스텀 매치를 한 판 치르고 나면 여기 임계값만 손보면 된다.
 */

export interface MatchCandidate {
  matchId: string;
  /** 매치 시작 시각 (ISO) */
  createdAt: string;
  isCustomMatch: boolean;
  /** 이 매치에 실제로 들어온 참가자 닉네임 */
  playerNames: string[];
}

export interface IdentifyOptions {
  /** 라운드를 시작한 시각 */
  roundStartedAt: Date;
  /** 방에 등록된 참가자 닉네임 (대소문자 무시하고 비교한다) */
  rosterNames: string[];
  /**
   * 라운드 시작보다 이만큼 앞선 매치까지 인정한다.
   *
   * 호스트가 "라운드 시작"을 누르기 전에 인게임 로비를 먼저 열어두는 일이 흔하다.
   * 여유를 안 두면 그런 판을 통째로 놓친다.
   */
  graceBeforeMs?: number;
  /** 라운드 시작 뒤 이 시간이 지난 매치는 다음 라운드로 본다. */
  windowAfterMs?: number;
  /**
   * 방 명단과 이만큼 겹쳐야 우리 경기로 인정한다.
   *
   * 전원이 등록 닉네임과 일치하지는 않는다 — 계정을 안 넣은 참가자,
   * 인게임에서 닉네임을 바꾼 사람이 있다. 그렇다고 낮추면 남의 판을 주워 온다.
   */
  minRosterOverlap?: number;
}

const DEFAULT_GRACE_BEFORE_MS = 15 * 60 * 1000;
const DEFAULT_WINDOW_AFTER_MS = 90 * 60 * 1000;
const DEFAULT_MIN_OVERLAP = 0.5;

export interface IdentifyResult {
  match: MatchCandidate | null;
  /** 왜 못 골랐는지. 화면에서 사람에게 그대로 설명한다. */
  reason:
    | "MATCHED"
    | "NO_CUSTOM_MATCH"
    | "OUT_OF_TIME_WINDOW"
    | "ROSTER_MISMATCH"
    | "NO_CANDIDATES";
  /** 가장 잘 맞은 후보의 명단 일치율. 사람이 판단할 때 쓴다. */
  bestOverlap: number;
}

function normalize(name: string) {
  return name.trim().toLowerCase();
}

/** 명단 일치율 — 방 명단 중 몇 %가 이 매치에 들어와 있는가 */
export function rosterOverlap(
  rosterNames: string[],
  playerNames: string[],
): number {
  const roster = new Set(rosterNames.map(normalize));
  if (roster.size === 0) return 0;
  const players = new Set(playerNames.map(normalize));
  let hit = 0;
  for (const name of roster) if (players.has(name)) hit += 1;
  return hit / roster.size;
}

/**
 * 후보 매치 중 이 라운드의 경기를 고른다.
 *
 * 세 조건을 모두 만족해야 한다 — 커스텀 매치, 시간대, 명단 일치.
 * 하나라도 애매하면 고르지 않고 이유를 돌려준다. 잘못 주워 온 결과를
 * 리더보드에 올리면 사람이 그걸 찾아내 고치는 게 더 오래 걸린다.
 */
export function identifyRoundMatch(
  candidates: MatchCandidate[],
  options: IdentifyOptions,
): IdentifyResult {
  if (candidates.length === 0) {
    return { match: null, reason: "NO_CANDIDATES", bestOverlap: 0 };
  }

  const graceBefore = options.graceBeforeMs ?? DEFAULT_GRACE_BEFORE_MS;
  const windowAfter = options.windowAfterMs ?? DEFAULT_WINDOW_AFTER_MS;
  const minOverlap = options.minRosterOverlap ?? DEFAULT_MIN_OVERLAP;
  const startedAt = options.roundStartedAt.getTime();

  const customs = candidates.filter((c) => c.isCustomMatch);
  if (customs.length === 0) {
    return { match: null, reason: "NO_CUSTOM_MATCH", bestOverlap: 0 };
  }

  const inWindow = customs.filter((c) => {
    const at = new Date(c.createdAt).getTime();
    if (Number.isNaN(at)) return false;
    return at >= startedAt - graceBefore && at <= startedAt + windowAfter;
  });
  if (inWindow.length === 0) {
    return { match: null, reason: "OUT_OF_TIME_WINDOW", bestOverlap: 0 };
  }

  const scored = inWindow
    .map((match) => ({
      match,
      overlap: rosterOverlap(options.rosterNames, match.playerNames),
    }))
    .sort((a, b) => b.overlap - a.overlap);

  const best = scored[0];
  if (best.overlap < minOverlap) {
    return { match: null, reason: "ROSTER_MISMATCH", bestOverlap: best.overlap };
  }

  return { match: best.match, reason: "MATCHED", bestOverlap: best.overlap };
}
