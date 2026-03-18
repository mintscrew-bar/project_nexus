import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { PostCategory } from "@nexus/database";

/**
 * 게시글 목록 조회 쿼리 파라미터 DTO
 * category는 Prisma PostCategory enum으로 검증
 */
export class ListPostsQueryDto {
  @IsOptional()
  @IsEnum(PostCategory, {
    message: `category는 ${Object.values(PostCategory).join(", ")} 중 하나여야 합니다.`,
  })
  category?: PostCategory;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  authorId?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsInt({ message: "limit는 정수여야 합니다." })
  @Min(1, { message: "limit는 1 이상이어야 합니다." })
  @Max(100, { message: "limit는 100 이하여야 합니다." })
  limit?: number = 20;

  @IsOptional()
  @IsInt({ message: "offset은 정수여야 합니다." })
  @Min(0, { message: "offset은 0 이상이어야 합니다." })
  offset?: number = 0;

  @IsOptional()
  @IsString()
  sortBy?: string;
}

/**
 * limit만 필요한 쿼리 파라미터 DTO (인기 태그 등)
 */
export class LimitQueryDto {
  @IsOptional()
  @IsInt({ message: "limit는 정수여야 합니다." })
  @Min(1, { message: "limit는 1 이상이어야 합니다." })
  @Max(100, { message: "limit는 100 이하여야 합니다." })
  limit?: number = 20;
}
