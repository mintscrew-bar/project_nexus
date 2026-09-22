/**
 * 내전 시작 거절 사유.
 *
 * 준비 미완료·음성 미입장 같은 거절은 "오류"가 아니라 로비에서 해결해야 하는
 * 조건이다. 화면이 문구를 단어로 짐작하지 않고(예전: /준비|음성|팀/ 정규식)
 * 어떤 조건이 막혔는지 알 수 있게 코드를 붙인다.
 *
 * - READY  : 준비하지 않은 선수가 있다
 * - ROSTER : 인원이 모자라다(정원 미달, 모드별 최소 인원)
 * - TEAMS  : 자유 팀 선택에서 팀을 안 고른 선수가 있다
 * - VOICE  : 준비한 선수 중 Discord 대기실에 없는 사람이 있다
 */
export type StartBlockedReason = "READY" | "ROSTER" | "TEAMS" | "VOICE";

export interface StartBlockedBody {
  message: string;
  reason: StartBlockedReason;
  /** 막고 있는 사람 이름. 인원 부족처럼 특정 사람이 없는 사유면 빈 배열이다. */
  missingUsers: string[];
}

/** BadRequestException 에 그대로 넘기는 응답 본문 */
export function startBlocked(
  reason: StartBlockedReason,
  message: string,
  missingUsers: string[] = [],
): StartBlockedBody {
  return {
    message,
    reason,
    missingUsers: missingUsers.filter(Boolean),
  };
}
