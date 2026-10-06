import "reflect-metadata";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../common/validation-pipe.options";
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
const run = (metatype: new () => object, body: unknown) =>
  pipe.transform(body, { type: "body", metatype });
const rejects = (metatype: new () => object, body: unknown) =>
  expect(run(metatype, body)).rejects.toBeInstanceOf(BadRequestException);
import { AgreeToTermsDto } from "./agree-terms.dto";

/** 클라이언트: authApi.agreeToTerms(token, dto) — 네 필드 모두 불리언 */
describe("AgreeToTermsDto", () => {
  it("클라이언트 payload", () =>
    expect(
      run(AgreeToTermsDto, {
        termsOfService: true,
        privacyPolicy: true,
        ageVerification: true,
        marketingConsent: false,
      }),
    ).resolves.toMatchObject({
      termsOfService: true,
      marketingConsent: false,
    }));

  it("marketingConsent 는 생략할 수 있다", () =>
    expect(
      run(AgreeToTermsDto, {
        termsOfService: true,
        privacyPolicy: true,
        ageVerification: true,
      }),
    ).resolves.toBeDefined());

  it("미동의(false)는 DTO 를 통과한다 — 필수 동의 검사는 서비스가 한다", () =>
    expect(
      run(AgreeToTermsDto, {
        termsOfService: false,
        privacyPolicy: true,
        ageVerification: true,
      }),
    ).resolves.toBeDefined());

  it.each([
    [
      "문자열 'false' — 암묵 변환으로 true 가 되어 동의로 처리되는 것을 막는다",
      { termsOfService: "false", privacyPolicy: true, ageVerification: true },
    ],
    [
      "문자열 'true'",
      { termsOfService: "true", privacyPolicy: true, ageVerification: true },
    ],
    [
      "숫자 1",
      { termsOfService: true, privacyPolicy: 1, ageVerification: true },
    ],
    ["필수 항목 누락", { termsOfService: true, privacyPolicy: true }],
    [
      "모르는 키",
      {
        termsOfService: true,
        privacyPolicy: true,
        ageVerification: true,
        isAdmin: true,
      },
    ],
  ])("거부한다: %s", (_n, body) => rejects(AgreeToTermsDto, body));
});
