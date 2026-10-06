import { IsBoolean, IsOptional } from "class-validator";
import { KeepRaw } from "../../../common/keep-raw.decorator";

/**
 * POST agree — 신규 OAuth 가입자의 약관 동의 (개인정보보호법 제21조: 명시적 동의).
 *
 * **동의 여부는 진짜 불리언이어야 한다.** 전역 암묵 형변환이 있으면 `"false"` 문자열이
 * `true` 로 바뀌어 통과하므로 `@KeepRaw()` 로 원본을 검증한다. 세 필수 항목이 true 인지는
 * 서비스(`agreeToTerms`)가 검사하고, 여기서는 타입만 지킨다.
 */
export class AgreeToTermsDto {
  @KeepRaw()
  @IsBoolean({ message: "termsOfService는 true 또는 false여야 합니다." })
  termsOfService!: boolean;

  @KeepRaw()
  @IsBoolean({ message: "privacyPolicy는 true 또는 false여야 합니다." })
  privacyPolicy!: boolean;

  @KeepRaw()
  @IsBoolean({ message: "ageVerification은 true 또는 false여야 합니다." })
  ageVerification!: boolean;

  @KeepRaw()
  @IsOptional()
  @IsBoolean({ message: "marketingConsent는 true 또는 false여야 합니다." })
  marketingConsent?: boolean;
}
