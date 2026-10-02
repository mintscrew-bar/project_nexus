import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsEnum,
  IsIn,
  IsOptional,
  IsArray,
  ArrayMaxSize,
  IsObject,
} from "class-validator";
import { Transform } from "class-transformer";
import { GameTitle, PostCategory } from "@nexus/database";
import { sanitizeHtml, stripAllHtml } from "@/common/utils/sanitize";

const CONTENT_FORMATS = ["MARKDOWN", "RICHTEXT"] as const;

/**
 * 게시글 작성 DTO
 */
export class CreatePostDto {
  /** 제목은 플레인 텍스트만 허용 (모든 HTML 태그 제거) */
  @Transform(({ value }) => stripAllHtml(value))
  @IsString()
  @IsNotEmpty({ message: "제목을 입력해주세요." })
  @MinLength(2, { message: "제목은 최소 2자 이상이어야 합니다." })
  @MaxLength(200, { message: "제목은 200자를 초과할 수 없습니다." })
  title: string;

  /** 본문은 마크다운 허용, 위험한 태그/속성만 선택적 제거 */
  @Transform(({ value }) => sanitizeHtml(value))
  @IsString()
  @IsNotEmpty({ message: "내용을 입력해주세요." })
  @MinLength(5, { message: "내용은 최소 5자 이상이어야 합니다." })
  @MaxLength(10000, { message: "내용은 10,000자를 초과할 수 없습니다." })
  content: string;

  /** 본문 저장 방식. 미지정 시 기존 마크다운으로 처리 */
  @IsOptional()
  @IsIn(CONTENT_FORMATS)
  contentFormat?: (typeof CONTENT_FORMATS)[number];

  /** RICHTEXT 게시글의 Tiptap JSON 문서 */
  @IsOptional()
  @IsObject({ message: "본문 JSON 형식이 올바르지 않습니다." })
  contentJson?: Record<string, unknown>;

  /**
   * 작성 화면의 게임 범위(선택). 게시판이 그 게임의 것이 아니면 거부한다.
   * 게시판이 곧 게임을 결정하므로 필수는 아니다 — 게임을 바꾼 뒤에도 열려 있던 오래된
   * 화면이 이전 게임의 게시판 ID 로 글을 올리는 것을 막는 안전망이다.
   */
  @IsOptional()
  @IsEnum(GameTitle)
  gameTitle?: GameTitle;

  /** 소속 게시판 id (신규). boardId 또는 category 중 하나는 필수 */
  @IsOptional()
  @IsString()
  boardId?: string;

  /** 레거시 카테고리 (하위호환). boardId가 없을 때 게시판 매핑에 사용 */
  @IsOptional()
  @IsEnum(PostCategory, { message: "유효한 카테고리를 선택해주세요." })
  category?: PostCategory;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10, { message: "태그는 최대 10개까지 가능합니다." })
  tags?: string[];
}
