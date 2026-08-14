/**
 * 매치 참가자·승리 팀을 "방이 삭제된 뒤에도" 판별하기 위한 공용 헬퍼.
 *
 * 내전이 끝나고 방이 정리되면 Team/TeamMember 행이 사라지고, Match의
 * teamAId·teamBId·winnerId는 onDelete: SetNull로 전부 NULL이 된다.
 * (운영 실측: teams 0행, team_members 0행, 완료된 내전 8건 전부 winnerId NULL)
 *
 * 그래서 match.teamA.members 만 보고 참가자를 판정하면 항상 빈 배열이 되어
 * "해당 경기 참가자만 투표할 수 있습니다" 같은 오류가 전원에게 발생한다.
 * 살아남는 건 MatchRosterSnapshot과 *IdSnapshot 컬럼들이므로 그쪽으로 폴백한다.
 */

export type TeamSlot = "A" | "B";

export interface ResolvedMember {
  userId: string;
  slot: TeamSlot;
}

interface RosterSnapshotLike {
  userId: string | null;
  teamSlot: string;
}

interface TeamLike {
  members?: { userId: string }[] | null;
}

export interface MatchRosterSource {
  teamAId?: string | null;
  teamBId?: string | null;
  teamAIdSnapshot?: string | null;
  teamBIdSnapshot?: string | null;
  winnerId?: string | null;
  winnerIdSnapshot?: string | null;
  teamA?: TeamLike | null;
  teamB?: TeamLike | null;
  rosterSnapshots?: RosterSnapshotLike[] | null;
}

/**
 * 매치 참가자 목록. 라이브 팀 관계를 우선하고, 비어 있으면 로스터 스냅샷을 쓴다.
 * 같은 유저가 양쪽에 있으면 라이브 쪽이 이긴다.
 */
export function resolveMatchMembers(
  match: MatchRosterSource,
): ResolvedMember[] {
  const members: ResolvedMember[] = [];
  const seen = new Set<string>();

  const addLive = (team: TeamLike | null | undefined, slot: TeamSlot) => {
    for (const member of team?.members ?? []) {
      if (!member.userId || seen.has(member.userId)) continue;
      seen.add(member.userId);
      members.push({ userId: member.userId, slot });
    }
  };

  addLive(match.teamA, "A");
  addLive(match.teamB, "B");

  for (const snapshot of match.rosterSnapshots ?? []) {
    if (!snapshot.userId || seen.has(snapshot.userId)) continue;
    const slot = snapshot.teamSlot === "B" ? "B" : "A";
    seen.add(snapshot.userId);
    members.push({ userId: snapshot.userId, slot });
  }

  return members;
}

/**
 * 승리 팀이 A인지 B인지. winnerId가 NULL이 된 뒤에는 스냅샷으로 판별한다.
 * 결과가 아직 없으면 null.
 */
export function resolveWinnerSlot(match: MatchRosterSource): TeamSlot | null {
  if (match.winnerId) {
    if (match.winnerId === match.teamAId) return "A";
    if (match.winnerId === match.teamBId) return "B";
  }

  if (match.winnerIdSnapshot) {
    if (match.winnerIdSnapshot === match.teamAIdSnapshot) return "A";
    if (match.winnerIdSnapshot === match.teamBIdSnapshot) return "B";
  }

  return null;
}

/** 해당 유저가 이 매치에 참가했는지 */
export function isMatchParticipant(
  match: MatchRosterSource,
  userId: string,
): boolean {
  return resolveMatchMembers(match).some((member) => member.userId === userId);
}
