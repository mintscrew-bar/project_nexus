import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

/** 한 팀의 라운드 성적 */
export class RoundTeamResultDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100000)
  damage?: number;
  @IsString()
  teamId: string;

  /** 순위 (1이 우승) */
  @IsInt()
  @Min(1)
  @Max(100)
  placement: number;

  @IsInt()
  @Min(0)
  @Max(200)
  kills: number;

  /** 이 라운드에서 죽은 팀원 수. 킬내기는 감점이라 점수에 들어간다. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  deaths?: number;
}

/**
 * 라운드 결과 입력.
 *
 * 자동 매칭이 붙기 전에는 이게 유일한 경로이고, 붙은 뒤에도 실패했을 때의
 * 보험으로 남는다. 커스텀 매치 기록은 2주만 보존되므로 놓치면 영영 못 받는다.
 */
export class SubmitRoundResultDto {
  /** 인게임 매치 ID. 알면 같이 넣어두면 나중에 대조할 수 있다. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  pubgMatchId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => RoundTeamResultDto)
  results: RoundTeamResultDto[];
}
