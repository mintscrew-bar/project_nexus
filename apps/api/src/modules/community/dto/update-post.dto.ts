import {
  IsString,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsArray,
  ArrayMaxSize,
  IsIn,
  IsObject,
} from "class-validator";
import { Transform } from "class-transformer";
import { sanitizeHtml, stripAllHtml } from "@/common/utils/sanitize";

const CONTENT_FORMATS = ["MARKDOWN", "RICHTEXT"] as const;

/**
 * 게시글 수정 DTO
 */
export class UpdatePostDto {
  /** 제목은 플레인 텍스트만 허용 (모든 HTML 태그 제거) */
  @IsOptional()
  @Transform(({ value }) => stripAllHtml(value))
  @IsString()
  @IsNotEmpty({ message: "제목은 공백일 수 없습니다." })
  @MaxLength(200, { message: "제목은 200자를 초과할 수 없습니다." })
  title?: string;

  /** 본문은 마크다운 허용, 위험한 태그/속성만 선택적 제거 */
  @IsOptional()
  @Transform(({ value }) => sanitizeHtml(value))
  @IsString()
  @IsNotEmpty({ message: "내용은 공백일 수 없습니다." })
  @MaxLength(10000, { message: "내용은 10,000자를 초과할 수 없습니다." })
  content?: string;

  /** 본문 저장 방식. 미지정 시 기존 값을 유지 */
  @IsOptional()
  @IsIn(CONTENT_FORMATS)
  contentFormat?: (typeof CONTENT_FORMATS)[number];

  /** RICHTEXT 게시글의 Tiptap JSON 문서 */
  @IsOptional()
  @IsObject({ message: "본문 JSON 형식이 올바르지 않습니다." })
  contentJson?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10, { message: "태그는 최대 10개까지 가능합니다." })
  tags?: string[];
}
