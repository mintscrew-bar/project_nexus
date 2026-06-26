import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class ListClansQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBoolean({ message: "isRecruiting은 boolean이어야 합니다." })
  isRecruiting?: boolean;

  @IsOptional()
  @IsString()
  minTier?: string;

  /** 모집 포지션 필터 (CSV, 예: "TOP,JUNGLE") */
  @IsOptional()
  @IsString()
  recruitRoles?: string;

  @IsOptional()
  @IsString()
  sort?: string;
}

export class ClanCursorQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsInt({ message: "limit는 정수여야 합니다." })
  @Min(1, { message: "limit는 1 이상이어야 합니다." })
  @Max(100, { message: "limit는 100 이하여야 합니다." })
  limit?: number = 50;
}

export class ClanActivityQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsInt({ message: "limit는 정수여야 합니다." })
  @Min(1, { message: "limit는 1 이상이어야 합니다." })
  @Max(100, { message: "limit는 100 이하여야 합니다." })
  limit?: number = 20;
}
