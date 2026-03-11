# 보안 취약점 및 버그 수정

> 진행 기준일: 2026-03-11
> 완료: Task 1~7 / 전체: Task 1~31

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

- [ ] Task 8: 소켓 join-room 참여자 검증 추가
  - `auction.gateway.ts`, `room.gateway.ts`, `snake-draft.gateway.ts`, `role-selection.gateway.ts`
  - DB에서 실제 방 참여자인지 확인 없이 Socket.IO 룸 합류

- [ ] Task 9: 채팅 메시지 조회 참여자 검증 추가
  - `room.controller.ts` — `getChatMessages`가 방 참여자인지 미확인

- [ ] Task 10: 경매 자원봉사 참여자 검증 추가
  - `auction.service.ts` — `handleVolunteer`에서 방 참여자 미확인

- [ ] Task 11: 방 로비 복귀 호스트 권한 검증 추가
  - `room.service.ts` — `returnToLobby`에 호스트 체크 없음

- [ ] Task 12: 클랜 가입 maxMembers 체크 추가
  - `clan.service.ts` — `joinClan` 시 정원 초과 가입 가능

- [ ] Task 13: 커뮤니티 게시글 수정 금칙어 필터 적용
  - `community.service.ts` — `updatePost`에 금칙어 필터 없음 (createPost에만 있음)

- [ ] Task 14: 관리자 역할 변경 ADMIN 승격 방지
  - `admin.service.ts` — MODERATOR가 다른 사용자를 ADMIN으로 승격 가능

- [ ] Task 15: 관리자 방 닫기 인메모리 상태 정리
  - `admin.service.ts` — `closeRoom` 시 경매/드래프트/역할선택 인메모리 상태 미정리

- [ ] Task 16: 신고 자동 블라인드 악용 방지
  - `community.service.ts` — 3건 신고 시 자동 블라인드, 동일 사용자/IP 검증 없음

- [ ] Task 17: 마크다운 Stored XSS 방지
  - `MarkdownViewer.tsx` — `@uiw/react-md-editor` 렌더링 시 sanitize 미적용

- [ ] Task 18: 소켓 connect/disconnect 리스너 중복 등록 수정
  - `notification-store.ts`, `presence-store.ts`, `clan-store.ts`
  - `initialize()`/`connect()` 반복 호출 시 리스너 누적

- [ ] Task 19: Admin 미들웨어 활성화
  - `middleware.ts` — `NextResponse.next()`만 반환하여 보호 없음

- [ ] Task 20: 로그아웃 경로 통합
  - `api-client.ts`, `auth-store.ts`, `auth.service.ts` 3곳에 분산
  - `window.location.href` 리다이렉트 경쟁으로 상태 정리 누락 가능

- [ ] Task 21: Access token 접근 제한 강화
  - `api-client.ts` — `getAccessToken()` export로 전역 접근 가능
  - XSS 공격 시 토큰 탈취 용이

---

## Phase 3: LOW 심각도 (10건)

- [ ] Task 22: 클랜 초대 코드 엔트로피 강화
  - `clan.service.ts` — 8자 16진수(32비트)로 무차별 대입 가능성

- [ ] Task 23: DM 수신자 존재 확인 추가
  - `dm.gateway.ts` — 존재하지 않는 사용자에게 메시지 전송 시 고아 메시지 생성

- [ ] Task 24: 유저네임 형식 검증 추가
  - `user.service.ts` — 빈 문자열, 특수문자 등 유효성 검사 없음

- [ ] Task 25: 파일 업로드 MIME/크기 검증 강화
  - `user.controller.ts`, `community.controller.ts` — FileInterceptor에 명시적 제한 없음

- [ ] Task 26: profileStore stats 캐시 갱신 로직 추가
  - `profile-store.ts` — `statsLoaded` 플래그로 한 번만 요청, 이후 갱신 안 됨

- [ ] Task 27: chatMessages 배열 상한선 추가
  - `room-store.ts`, `clan-store.ts` — 메시지 무한 추가로 메모리 누수

- [ ] Task 28: lobby-store 소켓 관리 통합
  - `lobby-store.ts` — `socket-client.ts`와 별도 소켓 인스턴스 생성
  - `disconnectAllSockets()`으로 정리 안 됨

- [ ] Task 29: API 호출 에러 핸들링 사용자 피드백 추가
  - `notification-store.ts`, `presence-store.ts`, `profile-store.ts` 등
  - 에러를 console.error만으로 처리, UI 피드백 없음

- [ ] Task 30: 프로덕션 console.log 정리
  - 23개 파일, 80회 console 호출 — 프로덕션 환경에서 내부 정보 노출

- [ ] Task 31: localStorage 민감 정보 최소화
  - `auth-store.ts` — role 캐시로 admin 메뉴 잠시 노출 가능
  - `friend-store.ts` — 친구 닉네임/메모가 공유 PC에서 노출

---

**Last Updated**: 2026-03-11
