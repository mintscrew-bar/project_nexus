import { IsString, Matches, MaxLength } from "class-validator";
import { KeepRaw } from "../../../common/keep-raw.decorator";

/**
 * POST exchange — OAuth 로그인 뒤 단회용 코드를 토큰으로 바꾼다.
 * 코드는 서버가 UUID 로 만든다. 값이 그대로 Redis 키(`oauth_code:${code}`)에 들어가므로
 * 형식과 길이를 제한한다 — 객체가 와서 `[object Object]` 키가 만들어지는 것도 막는다.
 */
export class ExchangeCodeDto {
  @KeepRaw()
  @IsString({ message: "코드가 필요합니다." })
  @MaxLength(64, { message: "코드 형식이 올바르지 않습니다." })
  @Matches(/^[A-Za-z0-9-]+$/, { message: "코드 형식이 올바르지 않습니다." })
  code!: string;
}
