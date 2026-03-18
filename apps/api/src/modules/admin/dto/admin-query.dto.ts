import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

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
