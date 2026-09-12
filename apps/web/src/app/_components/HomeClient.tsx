"use client";

/**
 * 종합 홈(`/`).
 *
 * 로그인 여부와 관계없이 랜딩을 그린다. 랜딩은 `page.tsx` 에서 서버
 * 컴포넌트로 렌더해 prop 으로 받으므로, SSR·검색봇에 본문이 그대로 나간다.
 *
 * 전에는 로그인 상태에서 대시보드를 그리는 분기가 있었는데 `&& false` 로
 * 죽여 둔 상태였다. 대시보드는 게임별 홈(`[game]/page.tsx`)이 따로 들고
 * 있으므로 그 분기와 딸린 dynamic import 를 걷어냈다 — 조건이 죽은 코드는
 * 다음 사람이 왜 있는지 알 수 없다.
 *
 * 로그인 상태는 랜딩 헤더(`LandingAuthAction`)가 보여준다. 이 경로에서는
 * AppShell 이 앱 헤더를 감싸지 않기 때문이다.
 */
export default function HomeClient({ landing }: { landing: React.ReactNode }) {
  return <>{landing}</>;
}
