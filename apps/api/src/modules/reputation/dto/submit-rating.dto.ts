import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  IsOptional,
  MaxLength,
} from "class-validator";

/**
 * 매치 후 평가 제출 DTO
 */
export class SubmitRatingDto {
  @IsString()
  @IsNotEmpty()
  targetUserId: string;

  @IsString()
  @IsNotEmpty()
  matchId: string;

  @IsInt()
  @Min(1, { message: "실력 평가는 1~5 사이여야 합니다." })
  @Max(5, { message: "실력 평가는 1~5 사이여야 합니다." })
  skillRating: number;

  @IsInt()
  @Min(1, { message: "태도 평가는 1~5 사이여야 합니다." })
  @Max(5, { message: "태도 평가는 1~5 사이여야 합니다." })
  attitudeRating: number;

  @IsInt()
  @Min(1, { message: "소통 평가는 1~5 사이여야 합니다." })
  @Max(5, { message: "소통 평가는 1~5 사이여야 합니다." })
  communicationRating: number;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "평가 코멘트는 500자를 초과할 수 없습니다." })
  comment?: string;
}
