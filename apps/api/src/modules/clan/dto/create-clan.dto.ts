import { IsString, IsNotEmpty, MaxLength, MinLength, IsOptional, IsBoolean, Matches } from "class-validator";

/**
 * 클랜 생성 DTO
 */
export class CreateClanDto {
  @IsString()
  @IsNotEmpty({ message: "클랜 이름을 입력해주세요." })
  @MaxLength(50, { message: "클랜 이름은 50자를 초과할 수 없습니다." })
  name: string;

  @IsString()
  @MinLength(2, { message: "클랜 태그는 최소 2자 이상이어야 합니다." })
  @MaxLength(5, { message: "클랜 태그는 5자를 초과할 수 없습니다." })
  @Matches(/^[A-Za-z0-9]+$/, { message: "클랜 태그는 영문과 숫자만 사용할 수 있습니다." })
  tag: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "클랜 설명은 500자를 초과할 수 없습니다." })
  description?: string;

  @IsBoolean()
  isRecruiting: boolean;

  @IsOptional()
  @IsString()
  minTier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  discord?: string;
}
