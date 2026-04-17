import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsEnum,
} from "class-validator";
import { ReportReason } from "@nexus/database";

/**
 * 유저 신고 DTO
 */
export class SubmitReportDto {
  @IsString()
  @IsNotEmpty()
  targetUserId: string;

  @IsOptional()
  @IsString()
  matchId?: string;

  @IsOptional()
  @IsString()
  clanChatMessageId?: string;

  @IsEnum(ReportReason, { message: "유효한 신고 사유를 선택해주세요." })
  reason: ReportReason;

  @IsString()
  @IsNotEmpty({ message: "신고 상세 내용을 입력해주세요." })
  @MaxLength(1000, { message: "신고 내용은 1,000자를 초과할 수 없습니다." })
  description: string;
}
