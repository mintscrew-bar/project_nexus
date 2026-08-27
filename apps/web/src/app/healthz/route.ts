// 컨테이너·업타임 모니터 전용 경량 헬스체크 엔드포인트.
//
// 기존에는 헬스체크가 랜딩(`/`)을 때렸는데, 랜딩은 서버 컴포넌트라
// 20~30초마다 SSR 풀렌더가 헛돌았다(웹·nginx·Uptime-Kuma 합쳐 하루 1만 회 이상).
// 이 라우트는 빌드 타임에 프리렌더되어 프로세스 생존 여부만 싸게 확인한다.
export const dynamic = "force-static";

export function GET() {
  return new Response("ok", {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // 모니터가 항상 실제 응답을 받도록 중간 캐시는 막는다.
      "cache-control": "no-store",
    },
  });
}
