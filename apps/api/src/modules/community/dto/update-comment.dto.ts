import { IsString, IsNotEmpty, MaxLength } from "class-validator";
import { Transform } from "class-transformer";
import { sanitizeHtml } from "@/common/utils/sanitize";

/**
 * 댓글 수정 DTO
 */
export class UpdateCommentDto {
  /** 댓글 본문 — 마크다운 허용, 위험한 태그/속성만 제거 */
  @Transform(({ value }) => sanitizeHtml(value))
  @IsString()
  @IsNotEmpty({ message: "댓글 내용을 입력해주세요." })
  @MaxLength(2000, { message: "댓글은 2,000자를 초과할 수 없습니다." })
  content: string;
}
