import { IsString, MaxLength, IsOptional, IsBoolean } from "class-validator";

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
  @IsString()
  @MaxLength(200)
  discord?: string;
}
