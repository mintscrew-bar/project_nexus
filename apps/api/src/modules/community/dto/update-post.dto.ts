import { IsString, IsOptional, MaxLength, IsArray, ArrayMaxSize } from "class-validator";

/**
 * 게시글 수정 DTO
 */
export class UpdatePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: "제목은 200자를 초과할 수 없습니다." })
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000, { message: "내용은 10,000자를 초과할 수 없습니다." })
  content?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10, { message: "태그는 최대 10개까지 가능합니다." })
  tags?: string[];
}
