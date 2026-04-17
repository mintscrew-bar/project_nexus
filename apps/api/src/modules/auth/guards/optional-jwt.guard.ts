import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/**
 * JWT가 있으면 user를 추출하고, 없어도 에러를 던지지 않는 가드.
 * 로그인 여부에 따라 다르게 처리해야 하는 엔드포인트(조회수 중복 방지 등)에 사용.
 */
@Injectable()
export class OptionalJwtGuard extends AuthGuard("jwt") {
  handleRequest(_err: any, user: any) {
    // 토큰이 없거나 유효하지 않으면 null 반환 (401 미발생)
    return user || null;
  }
}
