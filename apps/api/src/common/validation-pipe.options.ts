import type { ValidationPipeOptions } from "@nestjs/common";

/**
 * 전역 ValidationPipe 설정.
 *
 * `main.ts` 와 DTO 테스트가 **같은 값**을 써야 테스트가 운영과 어긋나지 않는다.
 *
 * 주의할 점:
 * - `forbidNonWhitelisted`: DTO 에 없는 키가 오면 **400** 이다. 인라인 타입
 *   (`@Body() body: { ... }`)은 클래스가 아니라 이 검증을 아예 안 받는다. 인라인을
 *   DTO 로 바꿀 때 클라이언트가 보내던 여분 키가 갑자기 거부될 수 있으므로, 바꾸기 전에
 *   실제 호출부의 payload 를 확인한다.
 * - `enableImplicitConversion`: 타입 힌트대로 값을 변환한다. 불리언 칼럼에 문자열
 *   `"false"` 가 들어오면 `true` 가 될 수 있어, 불리언은 `@IsBoolean()` 으로 막는다.
 */
export const GLOBAL_VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: {
    enableImplicitConversion: true,
  },
};
