# 리팩터링 TODO (2026-10-06)

관리자 개선 작업 뒤 코드 검토에서 나온 항목이다. **한 Task 씩, 기능 변경과 섞지 않고 커밋한다.**
근거 수치는 2026-10-06 기준 실측이다.

## 원칙

- 동작은 그대로 두고 구조만 바꾼다. 바꾸기 전 해당 부분에 테스트가 없으면 먼저 테스트로 현재 동작을 고정한다.
- 웹에는 테스트 러너가 없다. 웹 쪽 큰 컴포넌트 분리는 러너를 두기 전에는 기계적 이동(타입·상수·순수 컴포넌트)만 한다.
- 이동만 하는 diff 는 기능 diff 와 다른 커밋으로 낸다.

## Phase A — 입력 검증 (이득이 가장 확실, 위험 낮음)

전역 `ValidationPipe` 는 **클래스(DTO)만** 검증한다. 인라인 타입 `@Body() body: { ... }` 은 검증도 허용 필드 걸러내기도 되지 않는다.
컨트롤러의 인라인 `@Body()` 는 20곳 (room 5, admin 4, riot 3, reputation 2, match 2, role-selection·presence·community·board 각 1).

- [ ] Task 1: admin 컨트롤러 인라인 `@Body()` 4곳 DTO 전환 — `ban`(reason·banUntil), `announcements`(title·message·link), `bot-cleanup`(rooms·matches), `reports/:id/review`. 길이·형식 제한 포함, DTO 검증 테스트 추가
- [ ] Task 2: room 컨트롤러 5곳 DTO 전환
- [ ] Task 3: riot·reputation·match 컨트롤러 7곳 DTO 전환
- [ ] Task 4: role-selection·presence·community·board 컨트롤러 4곳 DTO 전환
- [ ] Task 5: 단일 필드 `@Body("role")`, `@Body("restrictedUntil")`, `@Body("isPinned")` 도 DTO 로 (서비스가 직접 검사하는 곳은 검사를 DTO 로 옮기고 서비스 검사는 방어용으로 유지)
- [ ] Task 6: 회귀 방지 테스트 — 컨트롤러 소스에 인라인 `@Body() x: {` 가 없음을 확인하는 테스트 (게이트웨이의 맨몸 `@MessageBody()` 검사와 같은 방식)

## Phase B — 방 삭제 경로 통합

방을 지우는 길이 세 갈래다: `room.service.deleteRoomData`(222줄), `auction.service`, `snake-draft.service`.
각자 디스코드 채널 삭제 → 방 삭제 → 상태 정리 → 공지 "해산"을 따로 한다.
`RoomOutcome` 기록을 넣을 때 3곳에 똑같이 끼워야 했던 것이 증거다. 네 번째 경로가 생기면 기록이 빠진다.

- [ ] Task 7: **확인 먼저** — 경매·드래프트 경로가 매치 스냅샷 확정(`deleteRoomData` 의 완료 매치 처리)을 건너뛰는 것이 의도인지 확인한다. 그 시점에는 완료 매치가 없다는 전제인지 코드로 검증하고 결과를 이 문서에 적는다
- [ ] Task 8: 방 삭제 진입점 하나로 통합 — `RoomService.dissolveRoom(roomId, opts)`. 경매·드래프트는 이를 호출하고 각자 상태 정리(`clearAuctionState`, `clearDraftState`)만 남긴다
- [ ] Task 9: 통합 후 `RoomOutcome` 기록이 한 곳에서만 일어나는지 테스트 (삭제 경로별 기록 1건)

## Phase C — 타입 안전

- [ ] Task 10: `any` 로 선언된 서비스 주입 9곳을 인터페이스로 교체 — `room.service`·`snake-draft`·`auction`·`match`·`room-nudge` 의 `discordBotService`·`discordVoiceService`. 필요한 메서드만 담은 `RoomAnnouncer`, `VoiceChannelManager` 인터페이스. 모듈 순환(`forwardRef` 43곳)은 풀지 않는다
- [ ] Task 11: 서버 `console.*` 101곳을 Nest `Logger` 로 교체 — `discord-bot.service` 29, `room.gateway` 11, `auction.gateway` 10, `auction.service` 8, `role-selection.gateway` 6 순. 로그 문구는 바꾸지 않는다. 스크립트(`src/scripts/`)는 제외

## Phase D — 소켓 이벤트 타입

서버 `.emit("...")` 문자열 리터럴 132곳, `socket-client.ts` 의 `any` 92개. CLAUDE.md 는 `@nexus/types` 에 WS 이벤트 타입이 있다고 하지만
`ServerToClientEvents` 류의 이벤트 맵은 실제로 없다. 이름 오타·payload 불일치를 컴파일이 못 잡는다. 가장 큰 작업이라 네임스페이스 하나로 시작한다.

- [ ] Task 12: `/room` 네임스페이스 이벤트 맵 설계 — 서버→클라(`ServerToClientEvents`)·클라→서버(`ClientToServerEvents`) 타입을 `@nexus/types` 에 정의. 이벤트 인벤토리(`docs/technical/WEBSOCKET_EVENTS.md`)와 대조
- [ ] Task 13: `/room` 서버 쪽 `emit` 을 타입 지정 서버에 연결
- [ ] Task 14: `/room` 클라 쪽 `socket-client.ts` 의 `any` 제거
- [ ] Task 15: 나머지 네임스페이스(auction, match, role-selection, snake-draft, clan, dm, notification, presence)를 같은 방식으로 — 네임스페이스마다 별도 커밋

## Phase E — 게이트웨이 가드 반복

소켓 점검 때 추가한 `guardAction` 이 22곳(room 7, auction 5, role-selection 4, match 4, presence 2)에서 같은 6줄로 반복된다.
핸들러 반환 형태가 게이트웨이마다 다르다(`{ error }` vs `{ success: false, error }`)라 단순 치환은 위험하다.

- [ ] Task 16: 게이트웨이별 에러 반환 형태 실태 조사 후 통일안 결정 — 클라이언트가 어느 형태를 기대하는지 `socket-client.ts` 와 대조
- [ ] Task 17: 통일 후 가드를 데코레이터나 래퍼로 추출, 기존 레이트 리밋 테스트(`socket-action-rate-limit.spec.ts`)가 그대로 통과하는지 확인

## Phase F — 규모 정리 (기능을 크게 손볼 때 같이)

- [ ] Task 18: `admin.service`(2,834줄, 메서드 52개) 분리 — `AdminStatsService`(통계·깔때기·내보내기), `AdminScrimService`(스크림 조치) 등. 이동만 하는 커밋. 스냅샷·운영 알림이 이미 별도 서비스라 기준을 맞춘다
- [ ] Task 19: 봇 제외 조건 함수화 — `NOT: TEST_BOT_USER_WHERE` 계열 12곳을 방 기준·유저 기준 헬퍼로. `test-bot.util.ts` 에 둔다
- [ ] Task 20: 값 보정 `Math.min(Math.max(...))` 6곳을 공용 `clamp` 로
- [ ] Task 21: `api-client.ts`(3,249줄) 에서 관리자 API 를 별도 파일로 분리 (import 경로만 바뀐다)
- [ ] Task 22: `createRoom`(385줄)의 게임별(롤/배그) 분기를 확인하고 게임별 함수로 분리할지 판단 — **먼저 읽고 판단**, 분리 여부는 결과에 따라
- [ ] Task 23: `GameAccountManagement.tsx`(3,147줄, `useState` 31개) — 웹 테스트 러너를 두기 전에는 타입·상수·순수 하위 컴포넌트의 기계적 이동만
- [ ] Task 24: 반복 문구·select 정리 — `select: { id, username, avatar }` 26곳, `"방을 찾을 수 없습니다"` 13곳, `gameTitle` 필터 조립 20곳. 효과가 작아 다른 작업 중에 만나면 같이

## 하지 않는 것 (이유)

- 모듈 순환(`forwardRef`) 해소 — 범위가 크고 이득이 불분명. Task 10 의 인터페이스로 타입 문제만 먼저 푼다
- `UsersTab` 본체 분리 — 웹 테스트 러너가 없어 동작을 고정할 수 없다. (정정: 상태는 `useState` 14개이며, 이유는 개수가 아니라 러너 부재다)
- 대시보드 쿼리 캐시 — 현재 규모에서는 불필요. 관리자 수나 접속이 늘면 Redis 5분 캐시를 둔다

## 순서

A → B → C → D → E 순으로, 각 Phase 안에서는 번호 순으로 한다. A 는 어느 것과도 독립이라 먼저 한다.
B 는 Task 7(확인)이 선행이다. E 는 D 의 `/room` 이벤트 타입 이후에 하는 편이 안전하다(반환 형태가 타입으로 드러난다). F 는 해당 파일을 다른 이유로 손댈 때 함께 한다.
