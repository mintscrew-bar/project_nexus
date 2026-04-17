import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsObject,
  MaxLength,
} from "class-validator";
import { Role } from "@nexus/database";

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

  @IsOptional()
  @IsString()
  peakTier?: string;

  @IsOptional()
  @IsString()
  peakRank?: string;

  @IsEnum(Role, { message: "유효한 주 포지션을 선택해주세요." })
  mainRole: Role;

  @IsEnum(Role, { message: "유효한 부 포지션을 선택해주세요." })
  subRole: Role;

  @IsObject()
  championsByRole: {
    [key in Role]?: string[];
  };
}
