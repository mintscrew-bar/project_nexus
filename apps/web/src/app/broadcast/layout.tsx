import type { ReactNode } from "react";

/**
 * 방송 오버레이 전용 레이아웃.
 *
 * globals.css 가 `body { @apply bg-bg-primary }` 로 불투명 배경을 깔기 때문에,
 * 오버레이 컨테이너(BroadcastShell)만 transparent 로 둬도 캡처 프로그램에는
 * 페이지 전체가 불투명하게 잡힌다. 그래서 이 라우트에서만 배경을 걷어낸다.
 *
 * 클라이언트 스크립트로 body 스타일을 만지지 않고 CSS 로 처리하는 이유:
 * 스크립트 방식은 첫 페인트에 불투명 배경이 한 번 번쩍이고(FOUC), OBS 처럼
 * 소스를 껐다 켜는 환경에서 그 깜빡임이 송출에 그대로 노출된다.
 *
 * 불투명이 필요하면 오버레이 URL 에 `?bg=opaque` 를 붙인다. 그 경우
 * BroadcastShell 이 fixed inset-0 에 직접 배경을 칠하므로 여기 설정과 무관하다.
 */
export default function BroadcastLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `html,body{background:transparent !important;}`,
        }}
      />
      {children}
    </>
  );
}
