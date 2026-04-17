import { IsEmail, IsString } from "class-validator";

/**
 * 로그인 요청 DTO
 */
export class LoginDto {
  @IsEmail({}, { message: "유효한 이메일 주소를 입력해주세요." })
  email: string;

  @IsString({ message: "비밀번호를 입력해주세요." })
  password: string;
}
