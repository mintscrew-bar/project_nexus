import { IsOptional, IsInt, Min, Max } from "class-validator";

export class RankingQueryDto {
  @IsOptional()
  @IsInt({ message: "page는 정수여야 합니다." })
  @Min(1, { message: "page는 1 이상이어야 합니다." })
  page?: number = 1;

  @IsOptional()
  @IsInt({ message: "limit는 정수여야 합니다." })
  @Min(1, { message: "limit는 1 이상이어야 합니다." })
  @Max(100, { message: "limit는 100 이하여야 합니다." })
  limit?: number = 50;
}
