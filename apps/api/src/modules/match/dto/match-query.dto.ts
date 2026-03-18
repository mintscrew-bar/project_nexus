import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class UserMatchesQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt({ message: "limit는 정수여야 합니다." })
  @Min(1, { message: "limit는 1 이상이어야 합니다." })
  @Max(100, { message: "limit는 100 이하여야 합니다." })
  limit?: number;

  @IsOptional()
  @IsInt({ message: "offset은 정수여야 합니다." })
  @Min(0, { message: "offset은 0 이상이어야 합니다." })
  offset?: number;
}

export class MatchHistoryQueryDto {
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
