import { VoteType } from "@nexus/database";
import { IsEnum, IsNotEmpty, IsString, MaxLength } from "class-validator";
import { KeepRaw } from "../../../common/keep-raw.decorator";

/**
 * 매치 컨트롤러의 인라인 `@Body()` 타입을 DTO 로 옮긴 것.
 * 식별자 상한 64 는 소켓 페이로드 검증(`isWsId`)과 맞췄다.
 */

/** POST :id/result — 클라이언트(`matchApi.reportResult`)는 winnerId 만 보낸다 */
export class ReportMatchResultDto {
  @KeepRaw()
  @IsString()
  @IsNotEmpty({ message: "승리 팀을 지정해주세요." })
  @MaxLength(64, { message: "winnerId 형식이 올바르지 않습니다." })
  winnerId!: string;
}

/** POST :id/vote — MVP/ACE 투표 */
export class SubmitVoteDto {
  @KeepRaw()
  @IsString()
  @IsNotEmpty({ message: "투표할 대상을 지정해주세요." })
  @MaxLength(64, { message: "votedForId 형식이 올바르지 않습니다." })
  votedForId!: string;

  @IsEnum(VoteType, { message: "voteType은 MVP 또는 ACE여야 합니다." })
  voteType!: VoteType;
}
