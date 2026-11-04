import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from "class-validator";
import {
  COMMENDATION_TAGS,
  MAX_COMMENDATIONS_PER_MATCH,
} from "../commendation.constants";

export class CommendationItemDto {
  @IsString()
  @IsNotEmpty()
  targetUserId: string;

  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(COMMENDATION_TAGS.length)
  @IsIn(COMMENDATION_TAGS, {
    each: true,
    message: "알 수 없는 칭찬 태그입니다.",
  })
  tags: string[];
}

/**
 * 경기 뒤 칭찬 제출. commendations 가 비어 있으면 "건너뛰기"로 기록한다.
 */
export class SubmitCommendationsDto {
  @IsString()
  @IsNotEmpty()
  matchId: string;

  @IsArray()
  @ArrayMaxSize(MAX_COMMENDATIONS_PER_MATCH, {
    message: `한 경기에서 최대 ${MAX_COMMENDATIONS_PER_MATCH}명까지 칭찬할 수 있습니다.`,
  })
  @ValidateNested({ each: true })
  @Type(() => CommendationItemDto)
  commendations: CommendationItemDto[];
}
