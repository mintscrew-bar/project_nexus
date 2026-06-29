# Quick Wins & 개선 TODO

우선순위: P0 → P1 → P2 → Security 순.

---

## Tasks

- [ ] Task 1: [P0] 비로그인 시 `/api/auth/refresh` 401 제거
  - 비로그인 방문마다 POST `/api/auth/refresh` 401 발생 → 콘솔 노이즈 + 불필요한 API 부하
  - 로그인 힌트 쿠키/스토리지 없을 때 refresh 호출 자체를 생략
  - 파일: `apps/web/src/stores/auth-store.ts`, `apps/web/src/app/providers.tsx`, `apps/web/src/lib/api-client.ts`

- [ ] Task 2: [P1] 모바일 랜딩 첫 화면 재배치
  - 모바일 홈 첫 화면에 프로모션 배너가 먼저 나와 H1/CTA가 밀림
  - 핵심 가치 설명 + Discord CTA를 첫 화면에 올리고 배너는 아래로
  - 파일: `apps/web/src/app/_components/LandingContent.tsx`, `apps/web/src/components/home/LandingBannerCarousel.tsx`

- [ ] Task 3: [P1] H1 / SEO 메타 보강
  - 홈·커뮤니티·클랜 페이지에 H1 없음, 정적 텍스트 얇음
  - 각 페이지에 H1 추가 + OG/메타 description 보강
  - 파일: `apps/web/src/app/community/page.tsx`, `apps/web/src/app/clans/page.tsx`, 각 페이지 metadata

- [ ] Task 4: [P1] 로그인 약관/정책 링크 수정
  - 로그인 화면 이용약관·개인정보처리방침 링크가 `#`로 막혀 있음
  - `/terms`, `/privacy` 실제 경로로 연결
  - 파일: `apps/web/src/app/auth/login/page.tsx`

- [ ] Task 5: [P2] 쿠키 배너 모바일 UX 개선
  - 하단 고정 쿠키 배너가 모바일에서 카드 하단 정보·CTA를 가림
  - 배너 높이 축소 또는 페이지별 `pb-safe` padding 적용
  - 파일: `apps/web/src/components/analytics/ConsentBanner.tsx`

- [ ] Task 6: [P2] 커뮤니티/클랜 빈 상태 개선
  - 커뮤니티 카테고리 빈 섹션, 클랜 설명 없는 카드 → 서비스가 비어 보임
  - 빈 상태 CTA, 운영 공지 샘플, 작성 유도 UI 추가
  - 파일: `apps/web/src/app/community/page.tsx`, `apps/web/src/app/clans/page.tsx`

- [ ] Task 7: [Security] `X-Powered-By` 헤더 제거 + CSP 추가
  - `X-Powered-By: Next.js` 노출 중, CSP 헤더 없음
  - `next.config.mjs`에 `poweredByHeader: false` + 단계적 CSP 설정
  - AdSense `data-cfasync` 경고도 제거 (`AdSenseScript.tsx`)
  - 파일: `apps/web/next.config.mjs`, `apps/web/src/components/ads/AdSenseScript.tsx`
