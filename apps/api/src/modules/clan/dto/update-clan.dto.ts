import {
  IsString,
  MaxLength,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from "class-validator";

/**
 * 클랜 정보 수정 DTO
 */
export class UpdateClanDto {
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: "클랜 이름은 50자를 초과할 수 없습니다." })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "클랜 설명은 500자를 초과할 수 없습니다." })
  description?: string;

  @IsOptional()
  @IsBoolean()
  isRecruiting?: boolean;

  @IsOptional()
  @IsString()
  minTier?: string;

  @IsOptional()
  @IsBoolean()
  officerCanManageSettings?: boolean;

  @IsOptional()
  @IsBoolean()
  officerCanManageMembers?: boolean;

  @IsOptional()
  @IsBoolean()
  officerCanManageAnnouncements?: boolean;

  @IsOptional()
  @IsBoolean()
  officerCanManageInvitations?: boolean;

  @IsOptional()
  @IsInt({ message: "클랜 정원은 정수여야 합니다." })
  @Min(2, { message: "클랜 정원은 최소 2명이어야 합니다." })
  @Max(100, { message: "클랜 정원은 최대 100명까지 가능합니다." })
  maxMembers?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  discord?: string;
}
