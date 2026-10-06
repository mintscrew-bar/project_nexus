import { UserRole } from "@nexus/database";
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { KeepRaw } from "../../../common/keep-raw.decorator";

/**
 * 관리자 조치 요청 본문.
 *
 * 컨트롤러가 인라인 타입(`@Body() body: { ... }`)을 쓸 때는 전역 ValidationPipe 가
 * 검증도 허용 필드 걸러내기도 하지 않았다. 아래 한도는 **기존 서비스·화면이 이미 받던
 * 범위보다 넉넉하게** 잡았다 — 목적은 터무니없는 입력(수십 MB 문자열)을 막는 것이지
 * 정상 입력을 거부하는 게 아니다. 서비스 안의 검사는 방어용으로 그대로 둔다.
 */

/** 유저 정지 */
export class BanUserDto {
  // 빈 문자열을 막지 않는다 — 기존에도 받았고, 화면의 "기타" 직접 입력이 비어 올 수 있다.
  @KeepRaw()
  @IsString({ message: "정지 사유는 문자열이어야 합니다." })
  @MaxLength(500, { message: "정지 사유는 500자 이하여야 합니다." })
  reason!: string;

  /** 정지 만료 시각. 날짜 해석·미래 여부는 서비스가 검사한다. */
  @IsOptional()
  @KeepRaw()
  @IsString({ message: "banUntil은 문자열이어야 합니다." })
  @MaxLength(40, { message: "banUntil 형식이 올바르지 않습니다." })
  banUntil?: string;
}

/** 신고 처리. 유저 신고와 게시글 신고가 같은 엔드포인트를 쓴다. */
export class ReviewReportDto {
  @IsIn(["APPROVED", "REJECTED"], {
    message: "status는 APPROVED 또는 REJECTED여야 합니다.",
  })
  status!: "APPROVED" | "REJECTED";

  // 처리 메모는 비어 있어도 된다 — 화면이 빈 값을 그대로 보낸다.
  @KeepRaw()
  @IsString({ message: "처리 메모는 문자열이어야 합니다." })
  @MaxLength(1000, { message: "처리 메모는 1000자 이하여야 합니다." })
  reviewerNote!: string;

  @IsOptional()
  @IsIn(["user", "post"], { message: "category는 user 또는 post여야 합니다." })
  category?: "user" | "post";
}

/** 전체 공지 발송. 제목·내용 한도는 개인 공지(SendUserMessageDto)와 같다. */
export class SendAnnouncementDto {
  @KeepRaw()
  @IsString()
  @MinLength(1, { message: "공지 제목을 입력해주세요." })
  @MaxLength(100, { message: "제목은 100자 이하여야 합니다." })
  title!: string;

  @KeepRaw()
  @IsString()
  @MinLength(1, { message: "공지 내용을 입력해주세요." })
  @MaxLength(2000, { message: "내용은 2000자 이하여야 합니다." })
  message!: string;

  @IsOptional()
  @KeepRaw()
  @IsString()
  @MaxLength(500, { message: "링크는 500자 이하여야 합니다." })
  link?: string;
}

/** 봇 데이터 정리. 둘 다 생략하면 컨트롤러가 거부한다. */
export class BotCleanupDto {
  @IsOptional()
  @KeepRaw()
  @IsBoolean({ message: "rooms는 true 또는 false여야 합니다." })
  rooms?: boolean;

  @IsOptional()
  @KeepRaw()
  @IsBoolean({ message: "matches는 true 또는 false여야 합니다." })
  matches?: boolean;
}

/** 이의신청 처리 */
export class ReviewAppealDto {
  @IsIn(["APPROVED", "REJECTED"], {
    message: "status는 APPROVED 또는 REJECTED여야 합니다.",
  })
  status!: "APPROVED" | "REJECTED";

  @KeepRaw()
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: "처리 메모는 1000자 이하여야 합니다." })
  adminNote?: string;
}

/** 유저 권한 변경 (ADMIN). 자기 자신·ADMIN 승격 제한은 서비스가 검사한다. */
export class UpdateUserRoleDto {
  @IsEnum(UserRole, { message: "유효한 권한 값을 선택해주세요." })
  role!: UserRole;
}

/** 유저 이용 제한. 날짜 해석·미래 여부는 서비스가 검사한다. */
export class RestrictUserDto {
  @KeepRaw()
  @IsString({ message: "restrictedUntil은 문자열이어야 합니다." })
  @MaxLength(40, { message: "restrictedUntil 형식이 올바르지 않습니다." })
  restrictedUntil!: string;
}

/** 글 고정/해제. 불리언이 문자열 "false" 로 와서 고정으로 처리되는 것을 막는다. */
export class PinPostDto {
  @KeepRaw()
  @IsBoolean({ message: "isPinned는 true 또는 false여야 합니다." })
  isPinned!: boolean;
}

/** 방에 테스트 봇 추가 (ADMIN). 생략하면 1명 — 정원 초과는 서비스가 막는다. */
export class AddBotsDto {
  @KeepRaw()
  @IsOptional()
  @IsInt({ message: "count는 정수여야 합니다." })
  @Min(1)
  @Max(50)
  count?: number;
}
