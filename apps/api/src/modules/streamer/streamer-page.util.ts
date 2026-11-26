/**
 * 스트리머 페이지(/streamers/:id) 집계 — DB 없이 경기 행만 받아 계산하는 순수 함수.
 *
 * "방송 내전" = 스트리머가 방장(Match.roomHostId)으로 연 내전. 다른 사람이 연 방에
 * 참가만 한 판은 여기 들어가지 않는다(그건 본인 전적·랭킹 점수에 들어간다).
 */
import {
  computeRatings,
  displayRating,
  type RatingMatch,
  type TeamSlot,
} from "../ranking/ranking-rating";

/** 방송 회차를 가르는 기준 — KST 새벽 6시. 자정을 넘겨 이어진 방송을 하루로 묶는다 */
const SESSION_DAY_START_HOUR = 6;
/** 시청자 리그에 보이는 인원 */
const LEAGUE_SIZE = 5;

export interface HostedMatchRow {
  id: string;
  completedAt: Date;
  roomName: string | null;
  roomTeamMode: string | null;
  gameDuration: number | null;
  winnerSlot: TeamSlot | null;
  teamAName: string | null;
  teamBName: string | null;
  roster: {
    userId: string | null;
    username: string;
    teamSlot: TeamSlot;
    assignedRole: string | null;
  }[];
  /** Riot 기록 — 코드 없는 사설방은 비어 있다 */
  participants: {
    userId: string | null;
    championName: string | null;
    riotTeamId: number | null;
    kills: number | null;
    deaths: number | null;
    assists: number | null;
    pentaKills: number | null;
  }[];
  mvpUserId: string | null;
  aceUserId: string | null;
  commendations: { giverId: string; targetUserId: string; tags: string[] }[];
}

export interface StreamerPageMatch {
  id: string;
  completedAt: string;
  roomName: string | null;
  teamMode: string | null;
  /** 경기 시간(초). Riot 기록이 없으면 null */
  durationSec: number | null;
  teamA: { name: string; champions: string[]; won: boolean };
  teamB: { name: string; champions: string[]; won: boolean };
  /** 스트리머가 뛴 팀. 관전만 했으면 null */
  streamerSlot: TeamSlot | null;
  /** 스트리머가 뛴 챔피언과 K/D/A — Riot 기록이 있을 때만 */
  streamerLine: {
    championName: string | null;
    kills: number;
    deaths: number;
    assists: number;
  } | null;
  mvp: { userId: string; username: string } | null;
  /** 이 판의 볼거리 한 줄 — 지금은 펜타킬 */
  highlight: string | null;
}

export interface StreamerPageSession {
  /** 방송 날짜 (KST, 새벽 6시 기준) YYYY-MM-DD */
  date: string;
  matchCount: number;
  /** 이 방송 내전에 참가한 사람 수(스트리머 제외) */
  viewerCount: number;
  matches: StreamerPageMatch[];
}

export interface StreamerPageSummary {
  hostedMatches: number;
  sessions: number;
  /** 함께한 시청자 — 방송 내전에 한 번이라도 뛴 사람(스트리머 제외) */
  viewers: number;
  /** 스트리머가 직접 뛴 판의 승패 */
  streamerWins: number;
  streamerLosses: number;
  /** 한 판 평균 참가 인원(스트리머 포함 계정 있는 사람) */
  avgPlayers: number;
  /** 이 방송 내전에서 오간 칭찬 수 */
  commendations: number;
}

export interface StreamerLeagueEntry {
  userId: string;
  username: string;
  games: number;
  wins: number;
  mvp: number;
  /** 이 방송 내전만으로 다시 계산한 점수(랭킹 점수와 같은 식, 시작 50) */
  score: number;
}

/** 방송 회차 키 — KST 새벽 6시 전은 전날 방송으로 본다 */
export function sessionDateKey(at: Date): string {
  const shifted = at.getTime() + (9 - SESSION_DAY_START_HOUR) * 60 * 60 * 1000;
  return new Date(shifted).toISOString().slice(0, 10);
}

/** 계정 있는 참가자 id (중복 없이) */
function playerIds(row: HostedMatchRow): string[] {
  return [
    ...new Set(
      row.roster.map((r) => r.userId).filter((id): id is string => !!id),
    ),
  ];
}

/** 팀 슬롯 → Riot 팀 번호. 로스터와 Riot 기록이 같은 사람으로 이어지는 쪽을 쓴다 */
function riotTeamOfSlot(row: HostedMatchRow, slot: TeamSlot): number | null {
  for (const r of row.roster) {
    if (r.teamSlot !== slot || !r.userId) continue;
    const p = row.participants.find((x) => x.userId === r.userId);
    if (p?.riotTeamId) return p.riotTeamId;
  }
  return null;
}

function toPageMatch(
  row: HostedMatchRow,
  streamerId: string,
): StreamerPageMatch {
  const streamerSlot =
    row.roster.find((r) => r.userId === streamerId)?.teamSlot ?? null;
  const champs = (slot: TeamSlot) => {
    const team = riotTeamOfSlot(row, slot);
    if (team === null) return [];
    return row.participants
      .filter((p) => p.riotTeamId === team)
      .map((p) => p.championName)
      .filter((c): c is string => !!c);
  };
  const me = row.participants.find((p) => p.userId === streamerId);
  const nameOf = (userId: string | null) =>
    row.roster.find((r) => r.userId === userId)?.username ?? null;
  const mvpName = nameOf(row.mvpUserId);
  const penta = row.participants.find((p) => (p.pentaKills ?? 0) > 0);
  const pentaName = penta ? nameOf(penta.userId) : null;

  return {
    id: row.id,
    completedAt: row.completedAt.toISOString(),
    roomName: row.roomName,
    teamMode: row.roomTeamMode,
    durationSec: row.gameDuration,
    teamA: {
      name: row.teamAName ?? "A팀",
      champions: champs("A"),
      won: row.winnerSlot === "A",
    },
    teamB: {
      name: row.teamBName ?? "B팀",
      champions: champs("B"),
      won: row.winnerSlot === "B",
    },
    streamerSlot,
    streamerLine: me
      ? {
          championName: me.championName,
          kills: me.kills ?? 0,
          deaths: me.deaths ?? 0,
          assists: me.assists ?? 0,
        }
      : null,
    mvp:
      row.mvpUserId && mvpName
        ? { userId: row.mvpUserId, username: mvpName }
        : null,
    highlight: pentaName ? `펜타킬 ${pentaName}` : null,
  };
}

/** 방송 회차별로 묶는다 — 최신 방송이 위, 회차 안에서도 최신 판이 위 */
export function buildSessions(
  rows: HostedMatchRow[],
  streamerId: string,
): StreamerPageSession[] {
  const sorted = [...rows].sort(
    (a, b) => b.completedAt.getTime() - a.completedAt.getTime(),
  );
  const byDate = new Map<string, HostedMatchRow[]>();
  for (const row of sorted) {
    const key = sessionDateKey(row.completedAt);
    const list = byDate.get(key) ?? [];
    list.push(row);
    byDate.set(key, list);
  }
  return [...byDate.entries()].map(([date, list]) => {
    const viewers = new Set<string>();
    for (const row of list) {
      for (const id of playerIds(row)) if (id !== streamerId) viewers.add(id);
    }
    return {
      date,
      matchCount: list.length,
      viewerCount: viewers.size,
      matches: list.map((row) => toPageMatch(row, streamerId)),
    };
  });
}

export function buildSummary(
  rows: HostedMatchRow[],
  streamerId: string,
): StreamerPageSummary {
  const viewers = new Set<string>();
  let wins = 0;
  let losses = 0;
  let players = 0;
  let commendations = 0;
  for (const row of rows) {
    const ids = playerIds(row);
    players += ids.length;
    for (const id of ids) if (id !== streamerId) viewers.add(id);
    const slot = row.roster.find((r) => r.userId === streamerId)?.teamSlot;
    if (slot && row.winnerSlot) {
      if (slot === row.winnerSlot) wins++;
      else losses++;
    }
    commendations += row.commendations.length;
  }
  return {
    hostedMatches: rows.length,
    sessions: new Set(rows.map((r) => sessionDateKey(r.completedAt))).size,
    viewers: viewers.size,
    streamerWins: wins,
    streamerLosses: losses,
    avgPlayers:
      rows.length > 0 ? Math.round((players / rows.length) * 10) / 10 : 0,
    commendations,
  };
}

/** 칭찬 태그 모음 — 많은 순. 태그 없이 누른 칭찬은 개수에만 들어간다 */
export function buildCommendationTags(
  rows: HostedMatchRow[],
): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const c of row.commendations) {
      for (const tag of c.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** 내전 참가자 통계표 한 줄 — 이 스트리머의 방송 내전에 뛴 시청자 한 명 */
export interface StreamerParticipantRow {
  userId: string;
  username: string;
  /** 결과가 난 판 */
  games: number;
  wins: number;
  losses: number;
  /** 이 방송 내전만으로 다시 계산한 점수(랭킹 점수와 같은 식, 시작 50) */
  score: number;
  /** Riot 기록이 있는 판 — K/D/A 는 이 판들의 평균 */
  statGames: number;
  avgKills: number | null;
  avgDeaths: number | null;
  avgAssists: number | null;
  /** (K+A)/D — 데스가 0 이면 K+A */
  kda: number | null;
  mvp: number;
  ace: number;
  /** 이 방송 내전에서 받은 칭찬 */
  commendations: number;
  firstAt: string;
  lastAt: string;
  /** 참가한 방송 회차 수 */
  sessions: number;
  /** 배정 라인 — 많이 맡은 순 */
  roles: { role: string; games: number }[];
  /** Riot 기록의 챔피언 — 많이 한 순 최대 3개 */
  champions: { name: string; games: number }[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** 방송 내전을 랭킹 점수 계산 입력으로 바꾼다 */
function toRatingMatches(rows: HostedMatchRow[]): RatingMatch[] {
  const out: RatingMatch[] = [];
  for (const row of rows) {
    if (!row.winnerSlot) continue;
    out.push({
      id: row.id,
      completedAt: row.completedAt,
      winnerSlot: row.winnerSlot,
      members: row.roster.map((r) => ({
        userId: r.userId,
        slot: r.teamSlot,
        role: null,
      })),
      stats: row.participants.map((p) => ({
        userId: p.userId,
        riotTeamId: p.riotTeamId ?? 0,
        kills: p.kills ?? 0,
        deaths: p.deaths ?? 0,
        assists: p.assists ?? 0,
      })),
      mvpUserId: row.mvpUserId,
      aceUserId: row.aceUserId,
      commendations: row.commendations.map((c) => ({
        giverId: c.giverId,
        targetUserId: c.targetUserId,
      })),
    });
  }
  return out;
}

/**
 * 내전 참가자 통계표 — 이 스트리머의 방송 내전에 뛴 시청자 전원(스트리머 본인 제외).
 * 기본 순서는 판수 → 점수. 화면에서 칸마다 다시 정렬한다.
 */
export function buildParticipantTable(
  rows: HostedMatchRow[],
  streamerId: string,
): StreamerParticipantRow[] {
  const { overall } = computeRatings(toRatingMatches(rows));

  interface Acc {
    username: string;
    games: number;
    wins: number;
    statGames: number;
    kills: number;
    deaths: number;
    assists: number;
    mvp: number;
    ace: number;
    commendations: number;
    first: number;
    last: number;
    sessions: Set<string>;
    roles: Map<string, number>;
    champions: Map<string, number>;
  }
  const accs = new Map<string, Acc>();
  const bump = (m: Map<string, number>, k: string) =>
    m.set(k, (m.get(k) ?? 0) + 1);

  for (const row of rows) {
    const at = row.completedAt.getTime();
    const seen = new Set<string>();
    for (const r of row.roster) {
      if (!r.userId || r.userId === streamerId || seen.has(r.userId)) continue;
      seen.add(r.userId);
      const acc: Acc = accs.get(r.userId) ?? {
        username: r.username,
        games: 0,
        wins: 0,
        statGames: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        mvp: 0,
        ace: 0,
        commendations: 0,
        first: at,
        last: at,
        sessions: new Set(),
        roles: new Map(),
        champions: new Map(),
      };
      // 가장 최근 판의 닉네임을 쓴다(닉네임을 바꾼 사람)
      if (at >= acc.last) acc.username = r.username;
      acc.first = Math.min(acc.first, at);
      acc.last = Math.max(acc.last, at);
      acc.sessions.add(sessionDateKey(row.completedAt));
      if (row.winnerSlot) {
        acc.games++;
        if (r.teamSlot === row.winnerSlot) acc.wins++;
      }
      if (r.assignedRole) bump(acc.roles, r.assignedRole);
      if (row.mvpUserId === r.userId) acc.mvp++;
      if (row.aceUserId === r.userId) acc.ace++;
      const stat = row.participants.find((p) => p.userId === r.userId);
      if (stat) {
        acc.statGames++;
        acc.kills += stat.kills ?? 0;
        acc.deaths += stat.deaths ?? 0;
        acc.assists += stat.assists ?? 0;
        if (stat.championName) bump(acc.champions, stat.championName);
      }
      acc.commendations += row.commendations.filter(
        (c) => c.targetUserId === r.userId,
      ).length;
      accs.set(r.userId, acc);
    }
  }

  const topOf = (m: Map<string, number>, limit: number) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit);

  return [...accs.entries()]
    .map(([userId, a]) => ({
      userId,
      username: a.username,
      games: a.games,
      wins: a.wins,
      losses: a.games - a.wins,
      score: displayRating(overall.get(userId)),
      statGames: a.statGames,
      avgKills: a.statGames ? round1(a.kills / a.statGames) : null,
      avgDeaths: a.statGames ? round1(a.deaths / a.statGames) : null,
      avgAssists: a.statGames ? round1(a.assists / a.statGames) : null,
      kda: a.statGames
        ? Math.round(((a.kills + a.assists) / Math.max(a.deaths, 1)) * 100) /
          100
        : null,
      mvp: a.mvp,
      ace: a.ace,
      commendations: a.commendations,
      firstAt: new Date(a.first).toISOString(),
      lastAt: new Date(a.last).toISOString(),
      sessions: a.sessions.size,
      roles: topOf(a.roles, 5).map(([role, games]) => ({ role, games })),
      champions: topOf(a.champions, 3).map(([name, games]) => ({
        name,
        games,
      })),
    }))
    .sort((a, b) => b.games - a.games || b.score - a.score);
}

/**
 * 시청자 리그 — 참가자 통계표에서 점수 높은 순 상위 몇 명.
 * 판이 없는(결과가 안 난 판만 뛴) 사람은 뺀다.
 */
export function buildViewerLeague(
  table: StreamerParticipantRow[],
): StreamerLeagueEntry[] {
  return table
    .filter((r) => r.games > 0)
    .map((r) => ({
      userId: r.userId,
      username: r.username,
      games: r.games,
      wins: r.wins,
      mvp: r.mvp,
      score: r.score,
    }))
    .sort((a, b) => b.score - a.score || b.games - a.games)
    .slice(0, LEAGUE_SIZE);
}

/** "HH:mm" 인지 — 방송 일정 시각 검증 */
export function isScheduleTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
