/**
 * PUBG 편성 점수 자동 산정.
 *
 * 롤은 라인마다 점수를 따로 내지만 배그에는 포지션이 없어 전체 점수 하나다.
 * 근거는 세 가지 — 공식 랭크, 내전 평균 순위, 내전 평균 킬.
 * 셋 다 없으면 점수를 내지 않는다. "데이터 부족"과 "낮은 점수"는 다르다.
 */

/** 산식 버전. 바뀌면 저장된 점수를 다시 계산해야 한다. */
export const PUBG_BALANCE_VERSION = 1;

/** 이만큼 라운드를 치러야 내전 성적을 점수에 반영한다. */
export const MIN_ROUNDS_FOR_BALANCE = 6;

/** 공식 랭크 티어 → 0~100 환산. 서브티어는 무시한다(모드마다 편차가 크다). */
const TIER_SCORE: Record<string, number> = {
  Bronze: 20,
  Silver: 35,
  Gold: 50,
  Platinum: 62,
  Diamond: 74,
  Master: 88,
  Grandmaster: 96,
};

export interface PubgBalanceInput {
  /** 공식 랭크 티어 이름 (예: "Diamond"). 배치 미완이면 null. */
  officialTier?: string | null;
  /** 내전 스크림 평균 최종 순위 (1이 우승). 표본이 없으면 null. */
  averageScrimRank?: number | null;
  /** 평균 참가 팀 수. 평균 순위를 비율로 바꾸는 데 쓴다. */
  averageTeamCount?: number | null;
  /** 라운드당 평균 팀 킬. 표본이 없으면 null. */
  averageKillsPerRound?: number | null;
  /** 집계에 쓰인 라운드 수. 적으면 내전 성적을 반영하지 않는다. */
  roundsPlayed?: number;
}

export interface PubgBalanceResult {
  /** 0~100. 근거가 하나도 없으면 null. */
  score: number | null;
  /** 어떤 근거가 쓰였는지. 화면에서 "무엇 때문에 이 점수인지"를 설명한다. */
  basis: ("OFFICIAL_RANK" | "SCRIM_RANK" | "SCRIM_KILLS")[];
  version: number;
  /** 표본이 적어 내전 성적을 빼고 계산했는지 */
  lowSample: boolean;
}

/** 공식 랭크 티어 문자열에서 점수를 뽑는다. 모르는 티어는 무시. */
function officialRankScore(tier?: string | null): number | null {
  if (!tier) return null;
  // "Diamond 3" 처럼 서브티어가 붙어 저장된다.
  const base = tier.trim().split(/\s+/)[0];
  return TIER_SCORE[base] ?? null;
}

/**
 * 평균 순위 → 점수.
 *
 * 순위는 팀 수에 따라 의미가 달라진다(4팀 중 2위와 16팀 중 2위는 다르다).
 * 상위 비율로 환산해 100점 만점으로 편다.
 */
function scrimRankScore(
  averageRank?: number | null,
  teamCount?: number | null,
): number | null {
  if (!averageRank || !teamCount || teamCount < 2) return null;
  const ratio = (teamCount - averageRank) / (teamCount - 1);
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

/**
 * 라운드당 팀 킬 → 점수.
 *
 * 4인 스쿼드 기준 라운드당 8킬이면 상위권이다. 그 위는 완만하게 올린다 —
 * 킬은 한 판에 몰릴 수 있어 선형으로 두면 표본 적은 사람이 과대평가된다.
 */
function scrimKillScore(averageKills?: number | null): number | null {
  if (averageKills === null || averageKills === undefined) return null;
  const normalized = Math.min(1, averageKills / 8);
  return Math.round(normalized * 100);
}

/**
 * 편성 점수 산정.
 *
 * 가중치는 근거가 있는 항목끼리만 나눈다. 없는 항목을 0으로 치면
 * 공식 랭크만 있는 사람이 조용히 낮게 깔린다.
 */
export function calculateAutoBalanceScore(
  input: PubgBalanceInput,
): PubgBalanceResult {
  const enoughRounds = (input.roundsPlayed ?? 0) >= MIN_ROUNDS_FOR_BALANCE;

  const parts: { weight: number; value: number; basis: PubgBalanceResult["basis"][number] }[] = [];

  const official = officialRankScore(input.officialTier);
  if (official !== null) {
    parts.push({ weight: 0.4, value: official, basis: "OFFICIAL_RANK" });
  }

  if (enoughRounds) {
    const rank = scrimRankScore(input.averageScrimRank, input.averageTeamCount);
    if (rank !== null) {
      parts.push({ weight: 0.4, value: rank, basis: "SCRIM_RANK" });
    }
    const kills = scrimKillScore(input.averageKillsPerRound);
    if (kills !== null) {
      parts.push({ weight: 0.2, value: kills, basis: "SCRIM_KILLS" });
    }
  }

  if (parts.length === 0) {
    return {
      score: null,
      basis: [],
      version: PUBG_BALANCE_VERSION,
      lowSample: !enoughRounds,
    };
  }

  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  const score = Math.round(
    parts.reduce((sum, part) => sum + part.value * part.weight, 0) /
      totalWeight,
  );

  return {
    score: Math.max(0, Math.min(100, score)),
    basis: parts.map((part) => part.basis),
    version: PUBG_BALANCE_VERSION,
    lowSample: !enoughRounds,
  };
}
