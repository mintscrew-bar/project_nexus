import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsIn,
} from "class-validator";

// 게시글/댓글 신고 사유 — Prisma enum이 아닌 커뮤니티 전용 사유
const POST_REPORT_REASONS = [
  "SPAM",
  "HARASSMENT",
  "INAPPROPRIATE",
  "MISINFORMATION",
  "OTHER",
] as const;

/**
 * 게시글/댓글 신고 DTO
 */
export class CreatePostReportDto {
  @IsIn(POST_REPORT_REASONS, { message: "유효한 신고 사유를 선택해주세요." })
  reason: (typeof POST_REPORT_REASONS)[number];

  @IsString()
  @IsNotEmpty({ message: "신고 상세 내용을 입력해주세요." })
  @MaxLength(1000, { message: "신고 내용은 1,000자를 초과할 수 없습니다." })
  description: string;

  @IsOptional()
  @IsString()
  postId?: string;

  @IsOptional()
  @IsString()
  commentId?: string;
}
