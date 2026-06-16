import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  IsObject,
  IsIn,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { Transform } from "class-transformer";
import { Role } from "@nexus/database";
import { RANKED_DIVISIONS, RANKED_TIERS } from "../riot-rank.util";

function optionalUppercase({ value }: { value: unknown }): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toUpperCase();
  return normalized || undefined;
}

/**
 * 라이엇 계정 등록 DTO
 */
export class RegisterRiotAccountDto {
  @IsString()
  @IsNotEmpty({ message: "게임 닉네임을 입력해주세요." })
  @MaxLength(50)
  gameName: string;

  @IsString()
  @IsNotEmpty({ message: "태그라인을 입력해주세요." })
  @MaxLength(10)
  tagLine: string;

  @Transform(optionalUppercase)
  @IsOptional()
  @IsIn([...RANKED_TIERS], { message: "유효한 최고 티어를 선택해주세요." })
  peakTier?: string;

  @Transform(optionalUppercase)
  @IsOptional()
  @IsIn([...RANKED_DIVISIONS], {
    message: "유효한 최고 티어 디비전을 선택해주세요.",
  })
  peakRank?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  peakLp?: number;

  @IsEnum(Role, { message: "유효한 주 포지션을 선택해주세요." })
  mainRole: Role;

  @IsEnum(Role, { message: "유효한 부 포지션을 선택해주세요." })
  subRole: Role;

  @IsObject()
  championsByRole: {
    [key in Role]?: string[];
  };
}
