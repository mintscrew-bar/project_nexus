import { IsString, IsNotEmpty, MaxLength, IsEnum, IsOptional, IsArray, ArrayMaxSize } from "class-validator";
import { Transform } from "class-transformer";
import { PostCategory } from "@nexus/database";
import { sanitizeHtml, stripAllHtml } from "@/common/utils/sanitize";

/**
 * 게시글 작성 DTO
 */
export class CreatePostDto {
  /** 제목은 플레인 텍스트만 허용 (모든 HTML 태그 제거) */
  @Transform(({ value }) => stripAllHtml(value))
  @IsString()
  @IsNotEmpty({ message: "제목을 입력해주세요." })
  @MaxLength(200, { message: "제목은 200자를 초과할 수 없습니다." })
  title: string;

  /** 본문은 마크다운 허용, 위험한 태그/속성만 선택적 제거 */
  @Transform(({ value }) => sanitizeHtml(value))
  @IsString()
  @IsNotEmpty({ message: "내용을 입력해주세요." })
  @MaxLength(10000, { message: "내용은 10,000자를 초과할 수 없습니다." })
  content: string;

  @IsEnum(PostCategory, { message: "유효한 카테고리를 선택해주세요." })
  category: PostCategory;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10, { message: "태그는 최대 10개까지 가능합니다." })
  tags?: string[];
}
