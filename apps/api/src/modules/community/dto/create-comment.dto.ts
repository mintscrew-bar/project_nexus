import { IsString, IsNotEmpty, MaxLength, IsOptional } from "class-validator";

/**
 * 댓글 작성 DTO
 */
export class CreateCommentDto {
  @IsString()
  @IsNotEmpty({ message: "댓글 내용을 입력해주세요." })
  @MaxLength(2000, { message: "댓글은 2,000자를 초과할 수 없습니다." })
  content: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}
