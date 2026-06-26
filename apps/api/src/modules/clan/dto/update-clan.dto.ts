import {
  IsString,
  MaxLength,
  IsOptional,
  IsBoolean,
  IsInt,
  IsArray,
  IsIn,
  Matches,
  Min,
  Max,
} from "class-validator";
import { CLAN_RECRUIT_ROLES, CLAN_ACCENT_COLOR_REGEX } from "./create-clan.dto";

/**
 * 클랜 정보 수정 DTO
 */
export class UpdateClanDto {
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: "클랜 이름은 50자를 초과할 수 없습니다." })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "클랜 설명은 500자를 초과할 수 없습니다." })
  description?: string;

  @IsOptional()
  @IsBoolean()
  isRecruiting?: boolean;

  @IsOptional()
  @IsString()
  minTier?: string;

  @IsOptional()
  @IsBoolean()
  officerCanManageSettings?: boolean;

  @IsOptional()
  @IsBoolean()
  officerCanManageMembers?: boolean;

  @IsOptional()
  @IsBoolean()
  officerCanManageAnnouncements?: boolean;

  @IsOptional()
  @IsBoolean()
  officerCanManageInvitations?: boolean;

  @IsOptional()
  @IsInt({ message: "클랜 정원은 정수여야 합니다." })
  @Min(2, { message: "클랜 정원은 최소 2명이어야 합니다." })
  @Max(100, { message: "클랜 정원은 최대 100명까지 가능합니다." })
  maxMembers?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  discord?: string;

  /** 클랜 로고 이미지 URL */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logo?: string;

  /** 상세 페이지 히어로 배너 이미지 URL */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  banner?: string;

  /** 클랜 대표색 (#RRGGBB) */
  @IsOptional()
  @IsString()
  @Matches(CLAN_ACCENT_COLOR_REGEX, {
    message: "대표색은 #RRGGBB 형식이어야 합니다.",
  })
  accentColor?: string;

  /** 모집 중인 포지션 목록 */
  @IsOptional()
  @IsArray()
  @IsIn(CLAN_RECRUIT_ROLES, {
    each: true,
    message: "모집 포지션 값이 올바르지 않습니다.",
  })
  recruitRoles?: string[];
}
