import {
  IsString,
  IsNotEmpty,
  MaxLength,
  MinLength,
  IsOptional,
  IsBoolean,
  IsArray,
  IsIn,
  Matches,
} from "class-validator";
import { Transform } from "class-transformer";
import { stripAllHtml } from "@/common/utils/sanitize";

/** 모집 포지션 허용 값 (mainRole/subRole과 동일 체계) */
export const CLAN_RECRUIT_ROLES = [
  "TOP",
  "JUNGLE",
  "MID",
  "ADC",
  "SUPPORT",
] as const;

/** 클랜 대표색 hex 형식 (#RRGGBB) */
export const CLAN_ACCENT_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * 클랜 생성 DTO
 */
export class CreateClanDto {
  /** 클랜 이름은 플레인 텍스트만 허용 (모든 HTML 태그 제거) */
  @Transform(({ value }) => stripAllHtml(value))
  @IsString()
  @IsNotEmpty({ message: "클랜 이름을 입력해주세요." })
  @MinLength(2, { message: "클랜 이름은 최소 2자 이상이어야 합니다." })
  @MaxLength(50, { message: "클랜 이름은 50자를 초과할 수 없습니다." })
  name: string;

  @IsString()
  @MinLength(2, { message: "클랜 태그는 최소 2자 이상이어야 합니다." })
  @MaxLength(5, { message: "클랜 태그는 5자를 초과할 수 없습니다." })
  @Matches(/^[A-Za-z0-9]+$/, {
    message: "클랜 태그는 영문과 숫자만 사용할 수 있습니다.",
  })
  tag: string;

  /** 클랜 설명은 플레인 텍스트만 허용 (모든 HTML 태그 제거) */
  @IsOptional()
  @Transform(({ value }) => stripAllHtml(value))
  @IsString()
  @MaxLength(500, { message: "클랜 설명은 500자를 초과할 수 없습니다." })
  description?: string;

  @IsBoolean()
  isRecruiting: boolean;

  @IsOptional()
  @IsString()
  minTier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  discord?: string;

  /** 클랜 로고 이미지 URL (업로드 엔드포인트로 설정, 직접 입력도 허용) */
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
