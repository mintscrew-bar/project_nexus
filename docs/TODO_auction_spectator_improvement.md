# 경매 UI/UX 개선 + 관전자 시스템 구현

> 진행 기준일: 2026-03-09
> 완료: Task 1~7 / 전체: Task 1~19

---

## Phase 1: 백엔드 버그 수정 (긴급)

- [x] Task 1: 경매 권한 체크 추가
  - `auction.gateway.ts` — `resolve-bid` 호스트 권한 체크
  - `auction.gateway.ts` — `retry-role-selection` 호스트 권한 체크
  - 비호스트가 경매를 강제 종료/조작할 수 있는 보안 이슈

- [x] Task 2: 스네이크 드래프트 타이머 복구 버그 수정
  - `snake-draft.gateway.ts` — 수동 픽 실패(권한 없음 등) 시 취소된 타이머가 복구되지 않는 문제
  - 타이머 취소를 픽 검증 이후로 이동하거나, catch에서 타이머 재스케줄

- [x] Task 3: 트랜잭션 누락 수정
  - `auction.service.ts` `_applySelectedCaptains` — 팀 생성 + 상태 전환을 `$transaction`으로 감싸기
  - `snake-draft.service.ts` `startSnakeDraft` — 동일
  - `room.service.ts` `closeRoom` — 참가자 삭제 + 방 삭제를 `$transaction`으로 감싸기

---

## Phase 2: 관전자 시스템 구현

- [x] Task 4: 백엔드 관전자 로직
  - 방 참가 시 SPECTATOR 역할로 입장 가능 (allowSpectators 체크)
  - 방 안에서 PLAYER ↔ SPECTATOR 전환 API
  - 전환 조건: WAITING 상태에서만 전환 가능
  - 팀 수 계산, 매물 풀, 캡틴 선정에서 SPECTATOR 필터링
  - 관전자 입장/퇴장 소켓 이벤트

- [x] Task 5: 프론트엔드 관전자 UI — 방 로비
  - 방 참가 시 PLAYER/SPECTATOR 선택 UI (allowSpectators일 때)
  - 방 내부에서 본인 역할 전환 버튼
  - 참가자 목록에서 관전자 섹션 분리 표시

- [x] Task 6: 프론트엔드 관전자 UI — 경매/드래프트
  - 관전자는 입찰 패널 대신 "관전 중" 안내 표시
  - 경매/드래프트 전 과정 실시간 구독 (읽기 전용)
  - 채팅 참여 가능

---

## Phase 3: 경매 레이아웃 재구성

- [x] Task 7: 데스크톱 레이아웃 개선
  - 중앙 컬럼 과밀 해소: 팀 카드를 하단 고정 영역 또는 접기/펼치기 구조로 분리
  - 입찰 패널 근처에 경쟁팀 예산 요약 바 추가 (스크롤 없이 파악)
  - 최고 입찰자에 팀 컬러/이름 정보 포함

- [ ] Task 8: 모바일 레이아웃 개선
  - 타이머를 sticky 헤더로 분리 (스크롤 시에도 항상 노출)
  - 입찰 패널을 하단 고정 (bottom sheet 방식)
  - 팀 카드를 가로 스와이프 또는 아코디언으로 축소
  - 세로 스크롤 과다 문제 해결

- [ ] Task 9: 채팅 패널 모바일 대응
  - `GameChatPanel.tsx` `w-[360px]` 하드코딩 → 반응형 처리
  - 모바일에서 풀스크린 또는 화면 너비 맞춤

---

## Phase 4: 경매 실시간 피드백 강화

- [ ] Task 10: 낙찰(player-sold) 피드백
  - 낙찰 순간 애니메이션 (선수 카드 → 팀으로 이동 효과)
  - 낙찰 정보 토스트 ("팀A가 유저B를 500G에 낙찰!")
  - 낙찰 후 잠깐 결과 표시 후 다음 매물 전환

- [ ] Task 11: 유찰(player-unsold) 피드백
  - 유찰 시 시각적 경고 (유찰 횟수/최대치 강조)
  - 유찰 정보 크기 확대 (`text-xs` → 더 눈에 띄게)

- [ ] Task 12: 입찰 실시간 피드백
  - 타인 입찰 시 입찰가 영역 flash/shake 효과
  - 매물 전환 시 슬라이드/페이드 애니메이션 (Framer Motion)

---

## Phase 5: 경매 인터랙션 개선

- [ ] Task 13: 비캡틴/관전자 관전 UX
  - 일반 선수에게 "관전 모드" 안내 문구 표시 (입찰 패널이 안 보이는 이유 설명)
  - 이미 최고 입찰자일 때 입찰 패널을 시각적으로 더 명확히 비활성화

- [ ] Task 14: 에러 복구 및 상태 전환
  - 연결 에러 시 "다시 시도" 버튼 추가
  - 팀장 선정 → 경매 시작 사이 전환 화면 추가

---

## Phase 6: 경매 결과 및 정보 보강

- [ ] Task 15: 경매 완료 결과 요약 화면
  - 즉시 리디렉트 대신 3~5초간 결과 요약 표시
  - 각 팀 구성원 + 사용 금액 요약
  - "역할 선택으로 이동" 버튼 또는 자동 전환

- [ ] Task 16: 입찰 로그 개선
  - 선수별 구분선/라벨 추가 (어떤 선수에 대한 입찰인지)
  - 선수 전환 시 로그 구분 명확화

---

## Phase 7: 백엔드 안정성 개선

- [ ] Task 17: 소켓 동시성 가드 보완
  - `placeBid` 동시 입찰 race condition — 방별 mutex/lock 도입
  - `resolve` 진행 중 `placeBid` 차단

- [ ] Task 18: 프론트엔드 소켓 정리
  - 로그아웃 시 `disconnectAllSockets()` 호출 + 스토어 초기화
  - 소켓 reconnect 시 리스너 중복 등록 방지
  - `notification-store` `markAsRead` 시 `unreadCount` 즉시 감소

- [ ] Task 19: Gateway OnModuleDestroy 구현
  - `RoomGateway`, `DmGateway`, `ClanGateway`, `PresenceGateway`에 OnModuleDestroy 추가
  - 타이머, Map, Set 등 인메모리 자원 정리

---

## 참고: 별도 관리 이슈

- 인메모리 상태 Redis 이관 — 서버 재시작 시 경매/드래프트 상태 유실 (장기 과제)
- React Query ↔ Zustand 동기화 구조 개선 (장기 과제)
- 라우트별 error.tsx 추가 (별도 작업)

---

**Last Updated**: 2026-03-09
