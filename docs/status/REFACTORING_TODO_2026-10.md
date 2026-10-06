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

## 리팩터링을 해도 되는 근거 (2026-10-06 실측)

| 근거 | 내용 |
| --- | --- |
| 안전망 | API 테스트 95 스위트 / 1,108개, 타입 검사, `pnpm lint` 가 CI 게이트다. 통과 못 하면 배포가 멈춘다 |
| 되돌리기 | `IMAGE_TAG=<commit-sha> docker compose -f docker-compose.prod.yml up -d` 로 이전 이미지로 즉시 복귀할 수 있다 (`docker-compose.prod.yml`). 스키마를 안 건드리는 리팩터링은 롤백이 데이터에 영향을 주지 않는다 |
| 기준선 | 현재 main(`5eaf6f03`)이 배포·검증된 상태다. 리팩터링은 그 위에서 한 Task 씩 쌓으므로 문제가 생기면 마지막 Task 만 되돌린다 |
| 변경 범위 | Phase A·C·E 는 새 기능이 없고 마이그레이션이 없다. B 는 삭제 순서만 모은다. D 는 타입만이라 런타임 동작이 같다 |
| 운영 환경 | 이 호스트는 운영 상주 서버다. 배포 직후 verification 레시피(메모리 `ci_run_lookup`)가 이미 있다 |

**근거가 약한 곳** — 그대로 진행하면 안 되는 부분:

- 컨트롤러 spec 은 3개뿐(`discord`, `streamer`, `chzzk-oauth`)이고 DTO 검증 테스트는 3개 파일뿐이다. Phase A 는 **테스트를 먼저 만들어야** 안전하다.
- 방 삭제 경로 테스트는 `room.service.spec.ts` 에 `deleteRoomData` 언급이 2건뿐이다. Phase B 는 현재 동작을 고정하는 테스트가 선행이다.
- 웹에는 테스트 러너가 없다. 웹 쪽(Task 14, 21, 23)은 타입 검사와 lint, 그리고 이번에 쓴 Playwright 목 API 점검만 안전망이다.

## 진행 방식 (공통)

1. Task 하나 = 커밋 하나. 기능 변경과 섞지 않는다.
2. 바꾸기 전 **현재 동작을 고정하는 테스트**를 먼저 쓰고, 리팩터링 전에 통과하는지 본다. 리팩터링 후에도 같은 테스트가 그대로 통과해야 한다.
3. 커밋 전 `pnpm lint`, `npx tsc --noEmit`, 관련 모듈 jest. Phase 가 끝날 때 전체 jest.
4. 푸시는 Phase 단위로 묶는다. 푸시 전 진행 중인 드래프트·경매가 없는지 로그로 확인한다.
5. 배포 후: CI → CD(버전 범프 SHA) → `docker ps` 기동 시각 → 주요 페이지·API 스모크를 배포 전 기준선과 비교. 소켓 변경(Phase D·E)은 잘못된 토큰으로 10개 네임스페이스 접속 프로브까지.

## Phase 별 구상

### A — 인라인 `@Body()` → DTO

**주의: 전역 `ValidationPipe` 가 `whitelist: true, forbidNonWhitelisted: true, transform: true` 다.**
DTO 로 바꾸면 클라이언트가 보내던 **여분 필드가 400 으로 거부된다.** 지금은 인라인 타입이라 통과하던 요청이 깨질 수 있다.

- Task 마다 순서: ① `apps/web/src/lib/api-client.ts`(그리고 다른 호출처 — 봇·디스코드·부하 테스트 하네스)에서 그 엔드포인트가 실제로 보내는 키를 확인 ② DTO 작성 — 서비스가 이미 하던 검사(타입·길이·열거)를 그대로 옮긴다, 더 엄격하게 하지 않는다 ③ 테스트: **클라이언트가 실제로 보내는 payload 가 통과**하고, 잘못된 값·미지의 키가 거부되는지 ④ 서비스 안의 방어 검사는 지운다 말고 유지한다.
- 선택 필드는 `@IsOptional()`. `null` 을 보내는 클라이언트가 있으면 `@ValidateIf` 로 허용한다.
- Task 6 의 회귀 테스트(소스 스캔)는 마지막에 둔다. 먼저 넣으면 아직 안 바꾼 곳 때문에 CI 가 깨진다.
- 위험: 가장 흔한 사고는 "프런트가 보내는 보조 키" 때문에 갑자기 400 이 나는 것이다. 이를 막는 것이 ① 이다.

### B — 방 삭제 통합

- Task 7 에서 경매·드래프트 경로가 `deleteRoomData` 의 완료 매치 스냅샷 처리를 건너뛰어도 되는지 확인한다. 그 시점에 완료 매치가 없다는 근거(코드·호출 시점)를 문서에 적는다. 근거가 없으면 통합은 하지 않고 중복만 `RoomOutcome` 기록처럼 작은 공통 함수로 줄인다.
- 통합 전 세 경로 각각에 "방이 지워지고, 채널이 지워지고, 공지가 해산되고, `RoomOutcome` 이 1건 생긴다" 를 확인하는 테스트를 붙인다.
- 위험: 삭제 순서가 바뀌면 FK 오류나 남은 디스코드 채널이 생긴다. 순서는 지금 코드와 **똑같이** 유지한다.

### C — 타입

- `any` → 인터페이스는 호출하는 메서드만 담는다(`announceDissolved`, `deleteRoomChannels` 등). 구현체가 구조적으로 만족하므로 주입부는 안 바뀐다.
- `console.*` → `Logger` 는 문구를 그대로 둔다. 로그 수집 쪽에 문자열 의존(`grep`, 알림 규칙)이 있는지 `scripts/` 와 운영 문서에서 먼저 찾는다.

### D — 소켓 이벤트 타입

- `/room` 하나로 시작해 이벤트 맵을 `@nexus/types` 에 둔다. 서버는 `Server<ClientToServerEvents, ServerToClientEvents>` 제네릭으로 연결한다.
- 타입만 바뀌고 런타임은 같다. 컴파일이 통과하는지가 곧 검증이다. 이름·payload 불일치가 컴파일 오류로 드러나면 **그것은 기존 버그**이므로 별도 커밋으로 고친다(리팩터링과 섞지 않는다).
- `@nexus/types` 는 dist 로 빌드되므로 변경 후 `tsc` 로 빌드해야 API·웹이 본다.

### E — 가드 반복

- D 의 `/room` 이벤트 타입이 끝난 뒤에 한다. 반환 형태(`{ error }` vs `{ success: false, error }`)가 클라이언트마다 기대하는 형태와 맞는지 D 가 드러내 준다.
- 통일은 **클라이언트가 이미 처리하는 형태에 서버를 맞춘다.** 서버를 먼저 바꾸면 클라이언트가 에러를 못 읽는다.

### F — 규모 정리

- 이동만 하는 diff 다. 서비스 분리(Task 18)는 먼저 새 클래스로 메서드를 옮기고, 기존 `AdminService` 에 위임 메서드를 남겨 컨트롤러를 안 건드린 채 통과시킨 뒤 컨트롤러를 옮긴다(두 커밋).

## 하지 않는 것 (이유)

- 모듈 순환(`forwardRef`) 해소 — 범위가 크고 이득이 불분명. Task 10 의 인터페이스로 타입 문제만 먼저 푼다
- `UsersTab` 본체 분리 — 웹 테스트 러너가 없어 동작을 고정할 수 없다. (정정: 상태는 `useState` 14개이며, 이유는 개수가 아니라 러너 부재다)
- 대시보드 쿼리 캐시 — 현재 규모에서는 불필요. 관리자 수나 접속이 늘면 Redis 5분 캐시를 둔다

## 순서

A → B → C → D → E 순으로, 각 Phase 안에서는 번호 순으로 한다. A 는 어느 것과도 독립이라 먼저 한다.
B 는 Task 7(확인)이 선행이다. E 는 D 의 `/room` 이벤트 타입 이후에 하는 편이 안전하다(반환 형태가 타입으로 드러난다). F 는 해당 파일을 다른 이유로 손댈 때 함께 한다.
