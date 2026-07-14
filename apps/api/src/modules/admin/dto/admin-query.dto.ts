import { UserRole } from "@nexus/database";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";

// 공통 관리자 목록 페이지네이션
export class AdminPageQueryDto {
  @IsOptional()
  @IsInt({ message: "page는 정수여야 합니다." })
  @Min(1, { message: "page는 1 이상이어야 합니다." })
  page: number = 1;

  @IsOptional()
  @IsInt({ message: "limit는 정수여야 합니다." })
  @Min(1, { message: "limit는 1 이상이어야 합니다." })
  @Max(100, { message: "limit는 100 이하여야 합니다." })
  limit: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(["users", "bots", "all"], {
    message: "kind는 users, bots, all 중 하나여야 합니다.",
  })
  kind?: "users" | "bots" | "all";

  @IsOptional()
  @IsEnum(UserRole, { message: "유효한 권한 값을 선택해주세요." })
  role?: UserRole;

  @IsOptional()
  @IsIn(["normal", "banned", "restricted", "reported", "streamer", "no-riot"], {
    message: "statusFilter가 유효하지 않습니다.",
  })
  statusFilter?:
    | "normal"
    | "banned"
    | "restricted"
    | "reported"
    | "streamer"
    | "no-riot";

  @IsOptional()
  @IsIn(["online", "offline", "away"], {
    message: "presence가 유효하지 않습니다.",
  })
  presence?: "online" | "offline" | "away";
}

// 신고 목록 조회
export class AdminReportsQueryDto extends AdminPageQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  category?: string;
}

// 채팅 로그 조회
export class AdminChatLogsQueryDto {
  @IsOptional()
  @IsInt({ message: "page는 정수여야 합니다." })
  @Min(1, { message: "page는 1 이상이어야 합니다." })
  page: number = 1;

  @IsOptional()
  @IsInt({ message: "limit는 정수여야 합니다." })
  @Min(1, { message: "limit는 1 이상이어야 합니다." })
  @Max(100, { message: "limit는 100 이하여야 합니다." })
  limit: number = 50;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  roomName?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

// 방 목록 조회
export class AdminRoomsQueryDto {
  @IsOptional()
  @IsInt({ message: "page는 정수여야 합니다." })
  @Min(1, { message: "page는 1 이상이어야 합니다." })
  page: number = 1;

  @IsOptional()
  @IsInt({ message: "limit는 정수여야 합니다." })
  @Min(1, { message: "limit는 1 이상이어야 합니다." })
  @Max(100, { message: "limit는 100 이하여야 합니다." })
  limit: number = 20;

  @IsOptional()
  @IsString()
  status?: string;
}

// 이의 제기 목록 조회
export class AdminAppealsQueryDto extends AdminRoomsQueryDto {}

export class AdminMatchQueueQueryDto {
  @IsOptional()
  @IsIn(["ranked", "normal", "aram", "custom"], {
    message: "queueGroup은 ranked, normal, aram, custom 중 하나여야 합니다.",
  })
  queueGroup?: "ranked" | "normal" | "aram" | "custom";
}

// 특정 유저(단일/다중) 개인 메시지·공지 발송
export class SendUserMessageDto {
  @IsArray({ message: "userIds는 배열이어야 합니다." })
  @ArrayNotEmpty({ message: "대상 유저를 1명 이상 선택해주세요." })
  @ArrayMaxSize(200, { message: "한 번에 최대 200명까지 발송할 수 있습니다." })
  @IsString({ each: true })
  userIds!: string[];

  @IsIn(["dm", "notification"], {
    message: "mode는 dm 또는 notification이어야 합니다.",
  })
  mode!: "dm" | "notification";

  // 공지(알림) 모드에서만 제목이 필요하다.
  @ValidateIf((o) => o.mode === "notification")
  @IsString()
  @MinLength(1, { message: "공지 제목을 입력해주세요." })
  @MaxLength(100, { message: "제목은 100자 이하여야 합니다." })
  title?: string;

  @IsString()
  @MinLength(1, { message: "내용을 입력해주세요." })
  @MaxLength(2000, { message: "내용은 2000자 이하여야 합니다." })
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  link?: string;
}

export class AdminRecomputeStatsQueryDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  puuid?: string;
}
