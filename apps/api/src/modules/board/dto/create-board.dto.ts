import {
  IsString,
  IsNotEmpty,
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
 * 게시판 생성 DTO (관리자 전용)
 */
export class CreateBoardDto {
  /** 표시 이름 (필수, 플레인 텍스트) */
  @Transform(({ value }) => stripAllHtml(value))
  @IsString()
  @IsNotEmpty({ message: "게시판 이름을 입력해주세요." })
  @MaxLength(30, { message: "게시판 이름은 30자를 초과할 수 없습니다." })
  name: string;

  /** URL 슬러그 (소문자/숫자/하이픈). 생략 시 서버에서 자동 생성 */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: "슬러그는 영소문자/숫자/하이픈만 사용할 수 있습니다.",
  })
  @MaxLength(40)
  slug?: string;

  /** 전체 이름 (목록/헤더용). 생략 시 name 사용 */
  @IsOptional()
  @Transform(({ value }) => (value == null ? value : stripAllHtml(value)))
  @IsString()
  @MaxLength(50)
  fullName?: string;

  /** 게시판 설명 */
  @IsOptional()
  @Transform(({ value }) => (value == null ? value : stripAllHtml(value)))
  @IsString()
  @MaxLength(200)
  description?: string;

  /** lucide 아이콘 이름 (예: MessageCircle) */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  iconName?: string;

  /** Tailwind 색상 클래스 (예: text-accent-primary) */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  color?: string;

  /** 정렬 순서 (작을수록 앞). 생략 시 맨 뒤 */
  @IsOptional()
  @IsInt()
  order?: number;

  /** 글쓰기 최소 권한. null/생략이면 모든 유저 작성 가능 */
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
