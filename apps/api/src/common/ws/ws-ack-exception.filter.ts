import { ArgumentsHost, Catch } from "@nestjs/common";
import { BaseWsExceptionFilter, WsException } from "@nestjs/websockets";

/**
 * 페이로드 검증 실패(WsException)를 클라이언트의 ack 콜백으로 돌려준다.
 *
 * 기본 필터는 `exception` 이벤트만 보내서, ack 를 기다리는 클라이언트(`socket.emit(…, resolve)`)
 * 는 응답을 영영 못 받는다 — 일부 호출부는 타임아웃도 없다. ack 가 있으면 거기로
 * `{ success: false, error }` 를 보내고, 없으면 기본 동작(exception 이벤트)을 유지한다.
 */
@Catch(WsException)
export class WsAckExceptionFilter extends BaseWsExceptionFilter {
  catch(exception: WsException, host: ArgumentsHost) {
    // 인자는 [client, data, ack, pattern] 순서다 — 마지막은 이벤트 이름(문자열)이라
    // 끝에서 찾으면 안 된다. 함수인 인자가 ack 다(없으면 클라이언트가 ack 를 안 달았다).
    const ack = host.getArgs().find((arg) => typeof arg === "function");
    if (typeof ack === "function") {
      const err = exception.getError();
      const message =
        typeof err === "string"
          ? err
          : ((err as { message?: string })?.message ?? "잘못된 요청입니다.");
      ack({ success: false, error: message });
      return;
    }
    super.catch(exception, host);
  }
}
