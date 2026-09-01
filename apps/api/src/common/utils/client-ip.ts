/**
 * 신뢰 가능한 클라이언트 IP를 구하는 단일 출처.
 *
 * X-Forwarded-For 헤더를 직접 파싱하지 않는다. 이 헤더는 클라이언트가 임의로
 * 채워서 보낼 수 있고, 앞쪽(leftmost) 값을 그대로 쓰면 rate limit·로그인 실패
 * 잠금·조회수 중복 방지 같은 IP 기반 방어를 헤더 한 줄로 우회할 수 있다.
 *
 * 대신 Express가 `trust proxy` 설정에 따라 계산해 둔 req.ip를 사용한다.
 * proxy-addr는 X-Forwarded-For를 오른쪽에서 왼쪽으로 훑으며 "신뢰 프록시가 아닌
 * 첫 주소"를 반환하므로, 신뢰 목록이 사설 대역으로 좁혀져 있으면 위조된 앞쪽 값은
 * 채택되지 않는다.
 *
 * 아래 세 가지가 함께 성립해야 안전하다:
 *  1. nginx가 X-Forwarded-For를 클라이언트 입력이 아닌 CF-Connecting-IP로 덮어쓴다
 *  2. main.ts의 trust proxy가 `true`가 아니라 사설 대역 목록이다
 *  3. IP가 필요한 모든 코드가 이 함수를 쓴다
 */
export type ClientIpRequest = {
  ip?: string;
  socket?: { remoteAddress?: string | null } | null;
};

export const UNKNOWN_CLIENT_IP = "unknown";

export function getClientIp(req: ClientIpRequest | null | undefined): string {
  if (!req) return UNKNOWN_CLIENT_IP;
  return req.ip || req.socket?.remoteAddress || UNKNOWN_CLIENT_IP;
}
