import { ReportStatus } from "@nexus/database";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { KeepRaw } from "../../../common/keep-raw.decorator";

/** PUT reports/:id/status (ADMIN·MODERATOR) */
export class UpdateReportStatusDto {
  @IsEnum(ReportStatus, { message: "유효한 신고 상태를 선택해주세요." })
  status!: ReportStatus;

  @KeepRaw()
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: "처리 메모는 1000자 이하여야 합니다." })
  reviewerNote?: string;
}

/** POST users/:userId/ban (ADMIN·MODERATOR). duration 이 없으면 영구 정지 */
export class BanUserDto {
  // 빈 사유를 막지 않는다 — 기존에도 받았다(관리자 화면 정지 DTO 와 같은 기준).
  @KeepRaw()
  @IsString()
  @MaxLength(500, { message: "정지 사유는 500자 이하여야 합니다." })
  reason!: string;

  /** 정지 일수 */
  @KeepRaw()
  @IsOptional()
  @IsInt({ message: "duration은 정수여야 합니다." })
  @Min(1)
  @Max(3650)
  duration?: number;
}
