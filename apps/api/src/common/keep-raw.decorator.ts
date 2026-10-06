import { Transform } from "class-transformer";

/**
 * 암묵 형변환을 건너뛰고 **받은 값 그대로** 검증하게 한다.
 *
 * 전역 ValidationPipe 가 `enableImplicitConversion: true` 라서, 필드 타입 힌트대로 값이
 * 먼저 변환된 **뒤에** `@IsString`·`@IsBoolean` 이 돈다. 그러면 검증이 무력해진다:
 * - `{ rooms: "false" }` → `Boolean("false")` = **true** 로 바뀌어 통과
 * - `{ title: 1 }`, `{ reason: { a: 1 } }` → `"1"`, `"[object Object]"` 로 바뀌어 통과
 *
 * 쿼리스트링(GET)은 원래 문자열이라 변환이 필요하지만, **JSON 본문**의 문자열·불리언
 * 필드는 이 데코레이터로 원본을 지킨다. 특히 파괴적 조치의 불리언에는 반드시 쓴다.
 */
export const KeepRaw = () =>
  Transform(({ obj, key }) => obj[key], { toClassOnly: true });
