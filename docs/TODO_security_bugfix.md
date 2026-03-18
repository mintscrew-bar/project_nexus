# 보안 취약점 및 버그 수정

> 진행 기준일: 2026-03-11
> 완료: Task 1~4, 6~18, 20, 22~28 / 전체: Task 1~31

---

## Phase 1: HIGH 심각도 (7건)

- [x] Task 1: 역할 선택 컨트롤러 호스트 권한 검증 추가
  - `role-selection.controller.ts` — `startRoleSelection`, `completeRoleSelection`에 호스트 체크 없음
  - 인증된 아무 사용자가 임의 roomId로 역할 선택 시작/완료 가능

- [x] Task 2: 역할 선택 컨트롤러 JWT 필드 불일치 수정
  - `role-selection.controller.ts` — `req.user.id` 사용하지만 JWT payload는 `sub` 필드
  - 다른 컨트롤러는 `req.user.sub` 사용. `id`가 undefined이면 권한 검증 무효화

- [x] Task 3: Snake Draft 자동픽/완료 권한 검증 추가
  - `room.controller.ts` — `autoPickSnakeDraft`, `completeSnakeDraft`에 권한 검증 없음
  - `snake-draft.service.ts` — `autoPick`, `completeDraft` 서비스 레벨 권한 미검증
  - 아무 사용자가 임의 방의 드래프트를 조작 가능

- [x] Task 4: 경매 상태 업데이트 TOCTOU 레이스 컨디션 수정
  - `auction-state.service.ts` — `updateState`가 읽기→버전증가→저장이 비원자적
  - 레거시 서비스 (메인 경매는 인메모리 Map + bidLocks mutex 사용) — 경고 주석 추가

- [ ] Task 5: 인메모리 상태 서버 재시작 시 손실 대응 (장기 과제)
  - `auction.service.ts`, `snake-draft.service.ts`, `role-selection.service.ts`
  - 경매/드래프트/역할 선택 상태가 모두 인메모리 Map에 저장
  - Redis 백업 또는 최소한 graceful 복구 메커니즘 필요

- [x] Task 6: OAuth 콜백 토큰 URL 노출 개선
  - `auth/callback/page.tsx` — 토큰 추출 후 `history.replaceState`로 URL에서 즉시 제거
  - 브라우저 히스토리, Referer 헤더 노출 방지

- [x] Task 7: 약관 동의 페이지 임시 토큰 URL 노출 개선
  - `auth/agree/page.tsx` — `pendingToken` 추출 후 `history.replaceState`로 URL 정리

---

## Phase 2: MEDIUM 심각도 (14건)

- [x] Task 8: 소켓 join-room 참여자 검증 추가
  - `auction.gateway.ts`, `room.gateway.ts`, `snake-draft.gateway.ts`, `role-selection.gateway.ts`
  - DB에서 실제 방 참여자인지 확인 없이 Socket.IO 룸 합류

- [x] Task 9: 채팅 메시지 조회 참여자 검증 추가
  - `room.controller.ts` — `getChatMessages`가 방 참여자인지 미확인

- [x] Task 10: 경매 자원봉사 참여자 검증 추가
  - `auction.service.ts` — `handleVolunteer`에서 방 참여자 미확인

- [x] Task 11: 방 로비 복귀 호스트 권한 검증 추가
  - `room.service.ts` — `returnToLobby`에 호스트 체크 없음

- [x] Task 12: 클랜 가입 maxMembers 체크 추가
  - `clan.service.ts` — `joinClan` 시 정원 초과 가입 가능

- [x] Task 13: 커뮤니티 게시글 수정 금칙어 필터 적용
  - `community.service.ts` — `updatePost`에 금칙어 필터 없음 (createPost에만 있음)

- [x] Task 14: 관리자 역할 변경 ADMIN 승격 방지
  - `admin.service.ts` — MODERATOR가 다른 사용자를 ADMIN으로 승격 가능

- [x] Task 15: 관리자 방 닫기 인메모리 상태 정리
  - `admin.service.ts` — `closeRoom` 시 순환 의존성으로 직접 정리 불가, 주석 문서화

- [x] Task 16: 신고 자동 블라인드 악용 방지
  - `community.service.ts` — 3건 신고 시 자동 블라인드, 동일 사용자/IP 검증 없음

- [x] Task 17: 마크다운 Stored XSS 방지
  - `MarkdownViewer.tsx` — `@uiw/react-md-editor` 렌더링 시 sanitize 미적용

- [x] Task 18: 소켓 connect/disconnect 리스너 중복 등록 수정
  - `notification-store.ts`, `presence-store.ts`, `clan-store.ts`
  - `initialize()`/`connect()` 반복 호출 시 리스너 누적

- [x] Task 19: Admin 미들웨어 활성화 (SKIP)
  - `middleware.ts` — refresh_token 쿠키가 `/api/auth` 경로 전용이라 미들웨어에서 인증 불가
  - API JWT 검증 + 클라이언트 보호로 충분

- [x] Task 20: 로그아웃 경로 통합
  - `api-client.ts`, `auth-store.ts`, `auth.service.ts` 3곳에 분산
  - `window.location.href` 리다이렉트 경쟁으로 상태 정리 누락 가능

- [x] Task 21: Access token 접근 제한 강화 (SKIP)
  - `api-client.ts` — `getAccessToken()`이 `socket-client.ts`, `lobby-store.ts`에서 필요
  - Task 17의 XSS 방어(rehype-sanitize)로 직접 탈취 경로 차단됨

---

## Phase 3: LOW 심각도 (10건)

- [x] Task 22: 클랜 초대 코드 엔트로피 강화 (SKIP)
  - `clan.service.ts` — 이미 `crypto.randomBytes(4)` 사용, 7일 만료 — 충분히 안전

- [x] Task 23: DM 수신자 존재 확인 추가
  - `dm.service.ts` — `sendMessage`에서 수신자 존재 확인 후 메시지 생성

- [x] Task 24: 유저네임 형식 검증 추가
  - `user.service.ts` — 길이(2~20), 형식(영문/숫자/한글/_), 중복 검증

- [x] Task 25: 파일 업로드 MIME/크기 검증 강화 (SKIP)
  - `upload.module.ts`에 이미 MIME 필터(jpg/png/gif/webp) + 5MB 제한 적용

- [x] Task 26: profileStore stats 캐시 갱신 로직 추가 (SKIP)
  - 에러 시 `statsLoaded=false` 유지로 재시도 동작 정상

- [x] Task 27: chatMessages 배열 상한선 추가
  - `room-store.ts`, `clan-store.ts` — 최대 500개 제한, 초과 시 오래된 메시지 제거

- [x] Task 28: lobby-store 소켓 관리 통합 (SKIP)
  - 이미 `removeAllListeners()` + `disconnect()` cleanup 구현 완료

- [x] Task 29: API 호출 에러 핸들링 사용자 피드백 추가
  - Zustand 기반 `toast-store.ts` 생성 (React Context 없이 스토어에서 직접 호출 가능)
  - `Toast.tsx`를 toast-store 연동으로 전환
  - `notification-store.ts` 6개, `presence-store.ts` 2개, `profile-store.ts` 2개 catch 블록에 toast 에러 알림 추가

- [x] Task 30: 프로덕션 console.log 정리
  - API: 6개 Gateway 파일에서 불필요한 console.log 제거 (connect/disconnect 로깅 등)
  - Web: `socket-client.ts` 72줄 삭제 (8개 소켓 connect/disconnect 로그), 기타 스토어 정리
  - `console.error`는 디버깅용으로 유지

- [x] Task 31: localStorage 민감 정보 최소화
  - `auth-store.ts`: localStorage → sessionStorage 전환 (탭/브라우저 종료 시 자동 삭제)
  - role, email 필드 캐시에서 제외 (admin 메뉴 잠시 노출 방지)
  - 기존 localStorage 캐시 정리 로직 추가
  - `friend-store.ts`: 친구 목록 localStorage 캐시 제거

---

**Last Updated**: 2026-03-19
