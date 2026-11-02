/**
 * 팀 음성채널 인원 제한 계산.
 *
 * 채널 하나에는 스쿼드 하나가 들어간다. 7대7처럼 스쿼드가 4+3으로 갈리면
 * 큰 쪽(4)에 맞춘다.
 *
 * 여기에 여유 자리를 더한다. 선수 정원만큼만 막으면 관전자나 운영자가
 * 팀 채널에 들어가 인터뷰를 할 수 없었다. 대기실처럼 제한을 아예 없애면
 * 아무나 상대 팀 채널에 들어갈 수 있으므로 몇 자리만 연다.
 */

/** 선수 외에 팀 채널에 더 들어갈 수 있는 인원 (관전자·운영자 인터뷰용) */
export const TEAM_VOICE_EXTRA_SLOTS = 2;

/** 디스코드 음성채널 userLimit 상한 */
const DISCORD_USER_LIMIT_MAX = 99;

export function teamVoiceChannelLimit(
  teamSize: number,
  squadsPerTeam = 1,
): number {
  const squads = Math.max(1, squadsPerTeam);
  // 정원이 0이어도 최소 1명. userLimit 0 은 "제한 없음"이라 팀 채널에 쓰면 안 된다.
  const squadSize = Math.max(1, Math.ceil(teamSize / squads));
  return Math.min(DISCORD_USER_LIMIT_MAX, squadSize + TEAM_VOICE_EXTRA_SLOTS);
}
