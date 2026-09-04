import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export class PlayerKillsDto {
  @IsString()
  userId: string;

  @IsInt()
  @Min(0)
  @Max(200)
  kills: number;
}

export class TeamKillsDto {
  @IsString()
  teamId: string;

  @IsInt()
  @Min(0)
  @Max(400)
  kills: number;
}

/**
 * 킬내기 결과 보고.
 *
 * 승패는 기존 2팀 흐름(Match.winnerId)을 그대로 쓰고 킬 수만 얹는다.
 * 승자를 안 넣으면 킬이 많은 팀이 이긴 것으로 본다 — 킬내기의 기본 규칙이다.
 */
export class ReportKillMatchDto {
  @IsOptional()
  @IsString()
  winnerId?: string;

  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => TeamKillsDto)
  teams: TeamKillsDto[];

  /** 개인 킬. 안 넣어도 되고, 넣으면 전적·프로필 요약에 쓰인다. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PlayerKillsDto)
  players?: PlayerKillsDto[];
}
