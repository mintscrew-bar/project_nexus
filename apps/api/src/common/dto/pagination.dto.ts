import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

/**
 * 페이지 기반 페이지네이션 (page + limit)
 * 주로 admin, ranking 등에서 사용
 */
export class PagePaginationDto {
  @IsOptional()
  @IsInt({ message: "page는 정수여야 합니다." })
  @Min(1, { message: "page는 1 이상이어야 합니다." })
  page?: number = 1;

  @IsOptional()
  @IsInt({ message: "limit는 정수여야 합니다." })
  @Min(1, { message: "limit는 1 이상이어야 합니다." })
  @Max(100, { message: "limit는 100 이하여야 합니다." })
  limit?: number = 20;
}

/**
 * 검색 + 페이지 기반 페이지네이션
 * admin 목록 조회에서 주로 사용
 */
export class SearchPagePaginationDto extends PagePaginationDto {
  @IsOptional()
  @IsString()
  search?: string;
}

/**
 * 오프셋 기반 페이지네이션 (offset + limit)
 * community, match, notification 등에서 사용
 */
export class OffsetPaginationDto {
  @IsOptional()
  @IsInt({ message: "limit는 정수여야 합니다." })
  @Min(1, { message: "limit는 1 이상이어야 합니다." })
  @Max(100, { message: "limit는 100 이하여야 합니다." })
  limit?: number = 20;

  @IsOptional()
  @IsInt({ message: "offset은 정수여야 합니다." })
  @Min(0, { message: "offset은 0 이상이어야 합니다." })
  offset?: number = 0;
}

/**
 * 커서 기반 페이지네이션 (cursor + limit)
 * clan 채팅, dm 등 실시간 데이터에서 사용
 */
export class CursorPaginationDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsInt({ message: "limit는 정수여야 합니다." })
  @Min(1, { message: "limit는 1 이상이어야 합니다." })
  @Max(100, { message: "limit는 100 이하여야 합니다." })
  limit?: number = 50;
}
