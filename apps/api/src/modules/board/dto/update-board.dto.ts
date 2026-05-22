import {
  IsString,
  IsOptional,
  MaxLength,
  IsInt,
  IsBoolean,
  IsEnum,
  Matches,
} from "class-validator";
import { Transform } from "class-transformer";
import { UserRole } from "@nexus/database";
import { stripAllHtml } from "@/common/utils/sanitize";

/**
 * 게시판 수정 DTO (관리자 전용) — 모든 필드 선택적.
 * (프로젝트에 @nestjs/mapped-types가 없어 수동 정의)
 */
export class UpdateBoardDto {
  @IsOptional()
  @Transform(({ value }) => (value == null ? value : stripAllHtml(value)))
  @IsString()
  @MaxLength(30, { message: "게시판 이름은 30자를 초과할 수 없습니다." })
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: "슬러그는 영소문자/숫자/하이픈만 사용할 수 있습니다.",
  })
  @MaxLength(40)
  slug?: string;

  @IsOptional()
  @Transform(({ value }) => (value == null ? value : stripAllHtml(value)))
  @IsString()
  @MaxLength(50)
  fullName?: string;

  @IsOptional()
  @Transform(({ value }) => (value == null ? value : stripAllHtml(value)))
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  iconName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  color?: string;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsEnum(UserRole, { message: "유효한 권한 값을 선택해주세요." })
  writeRole?: UserRole | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isHidden?: boolean;
}
