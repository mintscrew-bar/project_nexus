/**
 * 디스코드 봇 명령(leaderboard·stats·attendance·medal·rooms) 의 문구 조립.
 *
 * 봇 서비스는 디스코드 클라이언트·DB 와 엮여 있어 테스트가 무겁다. 숫자를 글로 바꾸는
 * 부분만 여기로 빼서 순수 함수로 둔다 — 웹 화면과 같은 표현을 쓰는지 여기서 확인한다.
 */
import type { CommendationTag } from "../reputation/commendation.constants";

/** 칭찬 태그 화면 문구 — 웹(apps/web/src/lib/commendation.ts) 과 같게 */
export const COMMENDATION_TAG_LABEL: Record<CommendationTag, string> = {
  MANNER: "매너 좋음",
  SHOTCALL: "콜 잘함",
  CARRY: "캐리",
  TEAMWORK: "팀워크",
  MENTAL: "멘탈 강함",
};

/** 1~3위는 메달, 그 뒤는 숫자 */
export function rankMark(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `${rank}.`;
}

/** 점수는 소수 첫째 자리까지 — 웹 랭킹과 같다 */
export function formatScore(score: number): string {
  return score.toFixed(1);
}

/** 승률(0~100) — 판이 없으면 "-" */
export function formatWinRate(wins: number, games: number): string {
  if (games <= 0) return "-";
  return `${Math.round((wins / games) * 100)}%`;
}

export interface LolLeaderboardRow {
  globalRank: number;
  score: number;
  totalGames: number;
  wins: number;
  losses: number;
  username: string;
}

/** 롤 내전 랭킹 한 줄: `🥇 **닉** — 62.3점 · 12판 7승 5패 (58%)` */
export function formatLolLeaderboardLine(row: LolLeaderboardRow): string {
  return (
    `${rankMark(row.globalRank)} **${row.username}** — ${formatScore(row.score)}점` +
    ` · ${row.totalGames}판 ${row.wins}승 ${row.losses}패 (${formatWinRate(row.wins, row.totalGames)})`
  );
}

export interface PubgLeaderboardRow {
  rank: number;
  username: string;
  scrims: number;
  averagePlacement: number;
  wins: number;
  averageKills: number;
}

/** 배그 랭킹 한 줄: `🥇 **닉** — 평균 2.3위 · 1위 2회 · 판당 3.1킬 · 5판` */
export function formatPubgLeaderboardLine(row: PubgLeaderboardRow): string {
  return (
    `${rankMark(row.rank)} **${row.username}** — 평균 ${row.averagePlacement.toFixed(1)}위` +
    ` · 1위 ${row.wins}회 · 판당 ${row.averageKills.toFixed(1)}킬 · ${row.scrims}판`
  );
}

/** 받은 칭찬: `12개 · 매너 좋음 5 · 캐리 4` — 없으면 "아직 없음" */
export function formatCommendations(summary: {
  total: number;
  topTags: { tag: CommendationTag; count: number }[];
}): string {
  if (summary.total <= 0) return "아직 없음";
  const tags = summary.topTags
    .map((t) => `${COMMENDATION_TAG_LABEL[t.tag] ?? t.tag} ${t.count}`)
    .join(" · ");
  return tags ? `${summary.total}개 · ${tags}` : `${summary.total}개`;
}

export interface AttendanceResult {
  /** 이번에 받은 출석 메달. 이미 출석했으면 0 */
  granted: number;
  /** 연속 출석 보너스 */
  bonus: number;
  checkedToday: boolean;
  streak: number;
  monthDays: string[];
  streakEvery: number;
  streakBonus: number;
  /** 다음 보너스까지 남은 날. 0 이면 오늘이 보너스 날이었다 */
  daysToBonus: number;
}

/** 출석 결과 첫 줄 — 받았는지, 이미 했는지 */
export function formatAttendanceHeadline(result: AttendanceResult): string {
  if (result.granted <= 0) return "오늘은 이미 출석했어요.";
  const bonus =
    result.bonus > 0
      ? ` + 연속 ${result.streak}일 보너스 ${result.bonus}메달`
      : "";
  return `출석 완료! ${result.granted}메달${bonus}을 받았어요.`;
}

/** 다음 연속 보너스 안내 */
export function formatNextBonus(result: AttendanceResult): string {
  // daysToBonus 는 "오늘 출석했다고 치고" 남은 날이다(attendance.service getStatus).
  // 사람에게는 "앞으로 몇 번 더 출석하면" 으로 바꿔 말한다.
  //   - 오늘 출석함: 그대로. 0 이면 방금 보너스를 받아 한 바퀴(7번) 남았다
  //   - 아직 안 함: 오늘 출석 한 번이 더 필요하다
  const remaining = result.checkedToday
    ? result.daysToBonus || result.streakEvery
    : result.daysToBonus + 1;
  if (!result.checkedToday && remaining === 1) {
    return `오늘 출석하면 연속 보너스 ${result.streakBonus}메달!`;
  }
  return `${remaining}번 더 출석하면 연속 보너스 ${result.streakBonus}메달이에요.`;
}

/** 버튼 글자는 디스코드 제한(80자)이 있다. 방 이름이 길면 줄인다 */
export function joinButtonLabel(roomName: string, max = 30): string {
  const name = roomName.trim();
  const short = name.length > max ? `${name.slice(0, max - 1)}…` : name;
  return `참가 · ${short}`;
}
