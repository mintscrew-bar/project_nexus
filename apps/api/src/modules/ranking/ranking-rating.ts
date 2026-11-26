import type { Role } from "@nexus/database";

/**
 * 랭킹 점수 — 내전 실력 평가 (2026-11-26 개편).
 *
 * 예전 점수는 "5판 분량의 50%를 깐 보정 승률"이었다. 승률은 판을 더 뛸수록 질
 * 위험만 늘어서, 3승 0패가 더 안 뛰는 게 순위를 지키는 길이었다. 상대가 누구였는지,
 * 그 판에서 얼마나 했는지도 보지 않았다.
 *
 * 그래서 롤 숨은 MMR 과 같은 계열(Weng-Lin / OpenSkill 의 Bradley-Terry 모델)로
 * 바꿨다. 모든 내전을 끝난 순서대로 다시 돌리며 사람마다 두 값을 고쳐 간다.
 *   - μ(실력 추정): 기대보다 잘하면 오르고 못하면 내려간다
 *   - σ(불확실성): 판이 쌓일수록 줄어든다
 *
 * **판수에 중립이다.** 실력만큼 하면 기대값이 0 이라 판을 아무리 많이 뛰어도
 * 점수가 제자리다. 많이 뛴다고 유리하지도 불리하지도 않다.
 *
 * 한 판의 결과(s, 0~1)는 승패 70% + 개인 기여 30% 다.
 *   - 개인 기여: 같은 판 10명 안에서 KDA·킬관여 백분위, MVP·ACE 가산, 받은 칭찬.
 *     같은 판 안에서 비교하므로 판이 늘어도 쌓이기만 하지 않는다.
 *   - 라이엇 기록이 없는 판(코드 없는 사설방)은 개인 기여를 중립(0.5)으로 둔다.
 *
 * 표시 점수는 50 에서 시작한다: 50 + (μ − 2σ − 시작값) × 3.
 * μ − 2σ 는 "아직 잘 모름" 몫을 뺀 보수적 추정이라, 1~2판짜리가 위로 튀지 않는다.
 * 빼는 σ 는 10판 쯤의 값에서 멈춘다(RATING_DISPLAY_SIGMA_FLOOR) — 그 뒤로는 판수가
 * 점수를 움직이지 않는다.
 */

/** 처음 실력 추정과 불확실성 — OpenSkill 기본값 */
export const RATING_MU0 = 25;
export const RATING_SIGMA0 = 25 / 3;
/** 한 판 결과의 우연 폭 */
const BETA = RATING_SIGMA0 / 2;
/** σ² 가 0 으로 무너지지 않게 하는 하한 비율 */
const KAPPA = 1e-4;

/** 승패와 개인 기여의 비중 (합 1) */
export const RATING_WIN_WEIGHT = 0.7;
export const RATING_PERF_WEIGHT = 0.3;

/** MVP·ACE 에 개인 기여 백분위로 더하는 값 */
const MVP_ACE_BONUS = 0.15;
/** 칭찬 1개(상대 팀이 준 것, 처음 받는 사람에게서) 가 개인 기여에 더하는 값 */
const COMMENDATION_STEP = 0.1;
/** 칭찬으로 움직이는 개인 기여의 상·하한 */
const COMMENDATION_CAP = 0.3;
/** 같은 팀이 준 칭찬의 무게 — 친구끼리 주고받기를 줄인다 */
const TEAMMATE_COMMENDATION_WEIGHT = 0.5;
/** 라이엇 기록으로 개인 기여를 매기려면 이만큼의 참가자 기록이 있어야 한다 */
const MIN_STAT_LINES = 8;

/** 표시 점수 — 시작 50, 한 단위 변화의 배율, 표시 범위 */
export const RATING_DISPLAY_START = 50;
const DISPLAY_SIGMA_K = 2;
/**
 * 표시 점수에서 빼는 σ 의 하한 (≈ 10판 쯤의 σ).
 * σ 는 판마다 계속 줄어서, 하한이 없으면 "−2σ" 몫이 작아지는 것만으로 점수가 오른다
 * — 반반 이기는 사람도 100판이면 76점이 됐다(판수 쏠림). 그래서 빼는 몫은
 * 이 값 아래로 내리지 않는다. 10판 뒤로는 μ(실력 추정)만 점수를 움직인다.
 * μ 갱신에는 실제 σ 를 그대로 써서, 오래 뛴 사람 점수가 한 판에 크게 출렁이지 않게 둔다.
 */
export const RATING_DISPLAY_SIGMA_FLOOR = RATING_SIGMA0 * 0.92;
const DISPLAY_SCALE = 3;
const DISPLAY_MIN = 0;
const DISPLAY_MAX = 100;

export type TeamSlot = "A" | "B";

export interface RatingMatchMember {
  /** 넥서스 계정이 없는 참가자는 null — 팀 전력에는 기본값으로 들어간다 */
  userId: string | null;
  slot: TeamSlot;
  /** 역할 선택에서 배정된 라인. 없으면 라인 점수에 안 들어간다 */
  role: Role | null;
}

/** 라이엇이 준 참가자 기록 한 줄 */
export interface RatingStatLine {
  userId: string | null;
  /** 라이엇 팀 번호(100/200) — 팀 킬 합계를 낸다 */
  riotTeamId: number;
  kills: number;
  deaths: number;
  assists: number;
}

export interface RatingMatch {
  id: string;
  completedAt: Date;
  winnerSlot: TeamSlot;
  members: RatingMatchMember[];
  /** 라이엇 기록이 없는 판은 빈 배열 */
  stats: RatingStatLine[];
  mvpUserId: string | null;
  aceUserId: string | null;
  commendations: { giverId: string; targetUserId: string }[];
}

export interface RatingState {
  mu: number;
  sigma2: number;
  games: number;
}

export interface RatingResult {
  /** 사람별 종합 점수 */
  overall: Map<string, RatingState>;
  /** 사람·라인별 점수 — 키는 `${userId}:${role}` */
  byRole: Map<string, RatingState>;
}

function freshState(): RatingState {
  return { mu: RATING_MU0, sigma2: RATING_SIGMA0 ** 2, games: 0 };
}

/** 값 목록 → 0~1 백분위. 같은 값은 평균 순위를 준다 */
export function percentileRanks(values: number[]): number[] {
  const n = values.length;
  if (n <= 1) return values.map(() => 0.5);
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  const ranks = new Array<number>(n).fill(0);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && values[order[j + 1]] === values[order[i]]) j++;
    const avg = (i + j) / 2 / (n - 1);
    for (let k = i; k <= j; k++) ranks[order[k]] = avg;
    i = j + 1;
  }
  return ranks;
}

/**
 * 한 판의 개인 기여(0~1) — 사람마다.
 * 라이엇 기록이 있으면 KDA·킬관여 백분위 평균에 MVP·ACE 를 더하고, 없으면 0.5.
 * 그 위에 칭찬을 더하는데, 같은 판 평균과의 차이만 더해서 판마다 합이 0 이 되게 한다
 * (칭찬이 많이 오가는 방에 있었다고 모두 오르지 않는다).
 *
 * @param pairCounts 지금까지 같은 사람에게서 받은 칭찬 수 — 반복될수록 1/n 로 줄인다
 */
export function matchPerformance(
  match: RatingMatch,
  pairCounts: Map<string, number>,
): Map<string, number> {
  const perf = new Map<string, number>();
  const userIds = match.members
    .map((m) => m.userId)
    .filter((id): id is string => Boolean(id));
  for (const id of userIds) perf.set(id, 0.5);

  // ── 라이엇 기록 ──
  if (match.stats.length >= MIN_STAT_LINES) {
    const teamKills = new Map<number, number>();
    for (const line of match.stats) {
      teamKills.set(
        line.riotTeamId,
        (teamKills.get(line.riotTeamId) ?? 0) + line.kills,
      );
    }
    // KDA 는 데스가 0 이면 K+A. 킬관여는 팀 킬이 0 이면 0.
    const kda = match.stats.map(
      (l) => (l.kills + l.assists) / Math.max(l.deaths, 1),
    );
    const kp = match.stats.map(
      (l) =>
        (l.kills + l.assists) / Math.max(teamKills.get(l.riotTeamId) ?? 0, 1),
    );
    const kdaRank = percentileRanks(kda);
    const kpRank = percentileRanks(kp);
    match.stats.forEach((line, i) => {
      if (!line.userId || !perf.has(line.userId)) return;
      let value = (kdaRank[i] + kpRank[i]) / 2;
      if (line.userId === match.mvpUserId || line.userId === match.aceUserId) {
        value += MVP_ACE_BONUS;
      }
      perf.set(line.userId, Math.min(value, 1));
    });
  }

  // ── 칭찬 ──
  const slotOf = new Map<string, TeamSlot>();
  for (const m of match.members) if (m.userId) slotOf.set(m.userId, m.slot);
  const received = new Map<string, number>();
  for (const c of match.commendations) {
    const giverSlot = slotOf.get(c.giverId);
    const targetSlot = slotOf.get(c.targetUserId);
    // 그 판에 없던 사람이 준 칭찬이나 자기 자신은 세지 않는다
    if (!giverSlot || !targetSlot || c.giverId === c.targetUserId) continue;
    const pairKey = `${c.giverId}>${c.targetUserId}`;
    const nth = (pairCounts.get(pairKey) ?? 0) + 1;
    pairCounts.set(pairKey, nth);
    const sideWeight =
      giverSlot === targetSlot ? TEAMMATE_COMMENDATION_WEIGHT : 1;
    received.set(
      c.targetUserId,
      (received.get(c.targetUserId) ?? 0) + sideWeight / nth,
    );
  }
  if (received.size > 0 && userIds.length > 0) {
    const mean =
      userIds.reduce((sum, id) => sum + (received.get(id) ?? 0), 0) /
      userIds.length;
    for (const id of userIds) {
      const delta = (received.get(id) ?? 0) - mean;
      const bonus = Math.max(
        -COMMENDATION_CAP,
        Math.min(COMMENDATION_CAP, delta * COMMENDATION_STEP),
      );
      perf.set(id, Math.max(0, Math.min(1, perf.get(id)! + bonus)));
    }
  }

  return perf;
}

/**
 * 모든 내전을 끝난 순서대로 돌려 점수를 만든다.
 * 같은 입력이면 늘 같은 결과다 — 저장값 없이 언제든 처음부터 다시 계산한다.
 */
export function computeRatings(matches: RatingMatch[]): RatingResult {
  const overall = new Map<string, RatingState>();
  const byRole = new Map<string, RatingState>();
  const pairCounts = new Map<string, number>();

  const sorted = [...matches].sort(
    (a, b) =>
      a.completedAt.getTime() - b.completedAt.getTime() ||
      a.id.localeCompare(b.id),
  );

  for (const match of sorted) {
    const teams: Record<TeamSlot, RatingMatchMember[]> = { A: [], B: [] };
    for (const m of match.members) teams[m.slot].push(m);
    // 한쪽이라도 비면 상대가 없는 판이라 넘긴다
    if (teams.A.length === 0 || teams.B.length === 0) continue;

    // 경기 전 상태로 팀 전력을 잰다. 계정 없는 사람은 기본값.
    const stateOf = (m: RatingMatchMember) =>
      (m.userId && overall.get(m.userId)) || freshState();
    const sum = (slot: TeamSlot) => {
      let mu = 0;
      let sigma2 = 0;
      for (const m of teams[slot]) {
        const s = stateOf(m);
        mu += s.mu;
        sigma2 += s.sigma2;
      }
      return { mu, sigma2 };
    };
    const team = { A: sum("A"), B: sum("B") };
    const c = Math.sqrt(team.A.sigma2 + team.B.sigma2 + 2 * BETA ** 2);
    const eA = Math.exp(team.A.mu / c);
    const eB = Math.exp(team.B.mu / c);
    const expected: Record<TeamSlot, number> = {
      A: eA / (eA + eB),
      B: eB / (eA + eB),
    };

    const perf = matchPerformance(match, pairCounts);

    for (const slot of ["A", "B"] as const) {
      const teamSigma2 = team[slot].sigma2;
      const p = expected[slot];
      const gamma = Math.sqrt(teamSigma2) / c;
      const delta = ((gamma * teamSigma2) / c ** 2) * p * (1 - p);
      const win = match.winnerSlot === slot ? 1 : 0;

      for (const m of teams[slot]) {
        if (!m.userId) continue;
        const s =
          RATING_WIN_WEIGHT * win +
          RATING_PERF_WEIGHT * (perf.get(m.userId) ?? 0.5);

        const update = (state: RatingState) => {
          state.mu += (state.sigma2 / c) * (s - p);
          state.sigma2 *= Math.max(
            1 - (state.sigma2 / teamSigma2) * delta,
            KAPPA,
          );
          state.games += 1;
        };

        const own = overall.get(m.userId) ?? freshState();
        update(own);
        overall.set(m.userId, own);

        // 라인 점수: 팀 전력은 종합 점수로 재고, 이 사람의 그 라인 값만 고친다
        if (m.role) {
          const key = `${m.userId}:${m.role}`;
          const roleState = byRole.get(key) ?? freshState();
          update(roleState);
          byRole.set(key, roleState);
        }
      }
    }
  }

  return { overall, byRole };
}

/** 표시 점수 — 시작 50, 0~100 */
export function displayRating(state: RatingState | undefined): number {
  if (!state) return RATING_DISPLAY_START;
  const start = RATING_MU0 - DISPLAY_SIGMA_K * RATING_SIGMA0;
  // 빼는 불확실성 몫은 하한 아래로 내리지 않는다 — 판수만으로 점수가 오르지 않게
  const sigma = Math.max(Math.sqrt(state.sigma2), RATING_DISPLAY_SIGMA_FLOOR);
  const conservative = state.mu - DISPLAY_SIGMA_K * sigma;
  const raw = RATING_DISPLAY_START + (conservative - start) * DISPLAY_SCALE;
  const clamped = Math.min(DISPLAY_MAX, Math.max(DISPLAY_MIN, raw));
  return Math.round(clamped * 10) / 10;
}
