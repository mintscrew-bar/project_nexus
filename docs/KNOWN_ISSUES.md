# Known Issues & Technical Debt

> 현재 프로젝트의 알려진 문제점과 개선이 필요한 부분

---

## ✅ 해결됨 (Resolved)

### 1. ~~Prisma Schema 업데이트 필요~~
**상태**: ✅ 완료
**해결**: 모든 모델/필드/관계가 schema.prisma에 반영됨. 모든 모듈 활성화 상태.

### 2. ~~경매 컴포넌트 중복~~
**상태**: ✅ 정리됨
**해결**: `domain/AuctionBoard.tsx` 통합 컴포넌트로 일원화. 기존 auction/ 폴더 제거됨.

### 3. ~~Store 타입 불일치~~
**상태**: ✅ 확인됨
**해결**: `auction-store.ts`, `room-store.ts` 타입 정상. `lobby-store.ts`도 올바른 이벤트 사용.

### 4. ~~WebSocket 이벤트 불일치~~
**상태**: ✅ 수정됨
**해결**: socket-client.ts, lobby-store.ts 모두 올바른 이벤트명 사용. `start-game` 핸들러도 room.gateway.ts에 구현됨.

---

## 🟡 중요 (Medium Priority)

### 9. 전적 페이지 모바일 정보 부족
**상태**: ✅ 완료
**영향**: UX — 모바일 사용자 경험

**해결**:
- 접힌 매치 카드 하단에 `sm:hidden` 모바일 전용 2행 추가
- 아이템(item0~item6) + CS(분당 포함) + 킬관여 + 딜량(k 단위) 표시
- [x] 접힌 매치 카드에 모바일용 2행 레이아웃 적용 (아이템 + CS + 딜량 표시)
- [x] 현재 `hidden md:flex`로 숨겨진 정보를 모바일에서도 표시

---

## 🟢 개선 사항 (Low Priority)

### 5. 중복된 유틸리티 함수
**상태**: 🟢 정리 권장
**영향**: 코드 유지보수성

**문제**:
- `getTierColor()` - 여러 곳에서 비슷한 로직 반복
- 티어 색상 매핑이 일관되지 않을 수 있음

**위치**:
- `lib/utils.ts`
- `components/domain/TierBadge.tsx` (getTierVariant)

**해결 방법**:
- 단일 소스로 통합
- 상수로 티어 매핑 테이블 관리

### 6. 컴포넌트 성능 최적화 미적용
**상태**: 🟢 선택적
**영향**: 성능 (현재는 문제 없음)

**문제**:
- `React.memo()` 미적용
- `useMemo`, `useCallback` 최소 사용

**현재**:
- 빌드 성공, 번들 크기 적절
- 성능 문제 미발생

**해결 방법**:
- 성능 이슈 발견 시 적용
- 프로파일링 후 필요한 곳만 최적화

### 7. ~~에러 바운더리 미적용~~
**상태**: ✅ 완료
**해결**: `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx` 생성됨.

### 8. 테스트 코드 부재
**상태**: 🟢 장기 과제
**영향**: 코드 품질

**문제**:
- 단위 테스트 없음
- 통합 테스트 없음
- E2E 테스트 없음

**해결 방법**:
- Jest + React Testing Library 설정
- 핵심 비즈니스 로직부터 테스트 작성

---

---

## 🔴 소켓 오류 — 미수정 항목 (Socket Errors)

> 에이전트 분석(2026-04-10) 결과 도출. 소켓 오류 수정 작업 미완료.

### S1. JWT 토큰 만료 시 무한 재연결 루프 [P0]
**위치**: `apps/web/src/lib/socket-client.ts` 전체 `connectXSocket()` 함수
**문제**: 토큰 만료 후 재연결 시 갱신 없이 동일한 만료 토큰 재사용 → 서버 거부 → 무한 루프
**해결 방향**: `auth` 콜백에서 토큰 만료 확인 후 refresh token으로 갱신 후 전달

- [x] Task S1: socket-client.ts — 재연결 시 토큰 자동 갱신 로직 추가

### S2. 재연결 후 room-store 이벤트 리스너 손실 [P0]
**위치**: `apps/web/src/stores/room-store.ts:159-227`
**문제**: `socket.on('connect')` 핸들러에서 `joinRoom()`만 재호출, 이벤트 리스너는 재등록 안 됨
**해결 방향**: `connect` 이벤트 시 `setupListeners()` 함수로 리스너 전체 재등록

- [x] Task S2: room-store.ts — reconnect 시 이벤트 리스너 재등록 보장

### S3. 경매 상태 복구 불완전 [P1]
**위치**: `apps/web/src/stores/auction-store.ts:450-498`
**문제**: early return 시 `sessionAbortedAt`/`sessionAbortMessage` 미초기화, REST 폴백 에러 무시
**해결 방향**: `connectToAuction` 진입 시 세션 상태 항상 초기화

- [x] Task S3: auction-store.ts — 재연결 시 세션 상태 초기화 및 폴백 에러 처리

### S4. auction timer-update 이벤트 미구현 [P1]
**위치**: `apps/api/src/modules/auction/auction.gateway.ts:511-513`
**문제**: `emitTimerUpdate()` 메서드가 정의됐으나 호출하는 곳 없음. 경매 타이머 UI 미업데이트.
**해결 방향**: `_scheduleBidResolve` 내 setInterval로 500ms마다 timeLeft emit

- [x] Task S4: auction.gateway.ts — timer-update 이벤트 실제 emit 구현

### S5. Presence 친구 구독 권한 미검증 [P1]
**위치**: `apps/api/src/modules/presence/presence.gateway.ts:150-178`
**문제**: `subscribe-friend` 핸들러에서 실제 친구 관계 검증 없이 누구나 구독 가능
**해결 방향**: FriendService로 실제 친구 관계 확인 후 구독 허용

- [x] Task S5: presence.gateway.ts — subscribe-friend 친구 관계 검증 추가

---

## 🟡 소켓 최적화 — 미수정 항목 (Socket Optimization)

> 에이전트 분석(2026-04-10) 결과 도출.

### O1. 역할 선택 타이머 매초 브로드캐스트 [즉시 적용]
**위치**: `apps/api/src/modules/role-selection/role-selection.gateway.ts:200-204`
**문제**: 매초 모든 참가자에게 `timer-tick` 브로드캐스트
**해결 방향**: 서버는 5초 간격 보정 전송, 클라이언트 로컬 카운트다운

- [x] Task O1: role-selection.gateway.ts — 타이머 tick 간격 5초로 변경 + 클라이언트 로컬 카운트다운

### O2. 타이핑 이벤트 클라이언트 디바운싱 [즉시 적용]
**위치**: `apps/web/src/lib/socket-client.ts:168-170`, `dm.gateway.ts`, `clan.gateway.ts`
**문제**: 매 키 입력마다 is-typing 이벤트 전송
**해결 방향**: socket-client.ts에 debounce 유틸 추가, 500ms throttle 적용

- [x] Task O2: socket-client.ts — is-typing 500ms debounce 적용

### O3. 방 목록 전체 재조회 브로드캐스트 [중기]
**위치**: `apps/api/src/modules/room/room.gateway.ts:191-198`
**문제**: join/leave마다 전체 목록 DB 조회 → 모든 구독자에게 전송
**해결 방향**: 변경된 방 정보만 delta update로 전송

- [x] Task O3: room.gateway.ts — 방 목록 delta update 방식으로 변경

### O4. Presence 더블 브로드캐스트 [중기]
**위치**: `apps/api/src/modules/presence/presence.gateway.ts:181-199`
**문제**: `broadcastStatusToFriends()`에서 개인 룸 + 구독자 룸 양쪽에 중복 전송
**해결 방향**: 채널 하나로 통합

- [x] Task O4: presence.gateway.ts — 친구 상태 브로드캐스트 채널 통합

### O5. Redis Adapter 미사용 [장기]
**위치**: 전체 게이트웨이
**문제**: Socket.IO Redis Adapter 없이 인메모리만 사용 → 수평 확장 불가
**해결 방향**: `@socket.io/redis-adapter` 도입

- [ ] Task O5: Redis Adapter 도입 및 다중 서버 스케일링 준비

### O6. 네임스페이스 Lazy Loading [중기]
**위치**: `apps/web/src/lib/socket-client.ts:4-12`
**문제**: 최대 9개 소켓 동시 연결 가능 — 불필요한 TCP 오버헤드
**해결 방향**: 게임 단계별 필요한 네임스페이스만 연결

- [x] Task O6: socket-client.ts — 게임 단계별 소켓 lazy connect/disconnect

---

## 📊 현재 상태 요약

| 구분 | 백엔드 | 프론트엔드 |
|------|--------|------------|
| **컴파일** | ✅ 성공 | ✅ 성공 |
| **빌드** | ✅ 성공 | ✅ 성공 |
| **타입 체크** | ✅ 통과 | ✅ 통과 |
| **린트** | ✅ 통과 | ✅ 통과 |
| **스키마** | ✅ 완료 | - |
| **에러 바운더리** | - | ✅ 적용 |
| **Cron Jobs** | ✅ 적용 | - |
| **통합 테스트** | ⏳ 미실행 | ⏳ 미실행 |

---

## 🔧 권장 작업 순서

1. ~~**즉시**~~ ✅
   - [x] Prisma 스키마 업데이트 및 마이그레이션

2. ~~**우선순위**~~ ✅
   - [x] 경매 컴포넌트 중복 정리
   - [x] Store 타입 통일
   - [x] WebSocket 이벤트 수정

3. ~~**선택적**~~ ✅
   - [x] 유틸리티 함수 통합
   - [x] 에러 바운더리 추가
   - [x] Cron jobs (자동 밴 해제, 티어 동기화)

4. **장기** (남은 작업)
   - [ ] 테스트 코드 작성
   - [ ] CI/CD 설정

---

## 💡 참고 문서

- [SCHEMA_UPDATES_NEEDED.md](./SCHEMA_UPDATES_NEEDED.md) - 스키마 변경사항
- [QUICK_FIX_GUIDE.md](./QUICK_FIX_GUIDE.md) - 빠른 해결 가이드
- [API_REFERENCE.md](./API_REFERENCE.md) - API 명세
- [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) - 디자인 시스템

---

**Last Updated**: 2026-02-20
**Status**: 핵심 이슈 모두 해결됨. 테스트 코드 작성 대기.
