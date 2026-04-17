import { IsString, IsOptional, MinLength, MaxLength } from "class-validator";

/**
 * 프로필 수정 DTO
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: "닉네임은 최소 2자 이상이어야 합니다." })
  @MaxLength(20, { message: "닉네임은 20자를 초과할 수 없습니다." })
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: "자기소개는 200자를 초과할 수 없습니다." })
  bio?: string;
}
