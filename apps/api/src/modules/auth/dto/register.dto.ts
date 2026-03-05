import { IsEmail, IsString, MinLength, MaxLength, IsBoolean, IsOptional } from "class-validator";

/**
 * 회원가입 요청 DTO
 * 필수 약관 동의 + 이메일/비밀번호/닉네임
 */
export class RegisterDto {
  @IsEmail({}, { message: "유효한 이메일 주소를 입력해주세요." })
  email: string;

  @IsString()
  @MinLength(8, { message: "비밀번호는 최소 8자 이상이어야 합니다." })
  @MaxLength(100, { message: "비밀번호는 100자를 초과할 수 없습니다." })
  password: string;

  @IsString()
  @MinLength(2, { message: "닉네임은 최소 2자 이상이어야 합니다." })
  @MaxLength(20, { message: "닉네임은 20자를 초과할 수 없습니다." })
  username: string;

  @IsBoolean()
  termsOfService: boolean;

  @IsBoolean()
  privacyPolicy: boolean;

  @IsBoolean()
  ageVerification: boolean;

  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;
}
