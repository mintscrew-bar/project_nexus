# 소켓(Socket.IO) 전수 점검 보고서

> 점검일: 2026-10-02 · 범위: API 게이트웨이 10개(핸들러 52개) + 웹 소켓 클라이언트
> 계획: 보고서 작성 + **심각도 높음만 수정**, 재시작 복구는 복원 로직이 없으면 높음으로 처리
> 이벤트 계약표: [WEBSOCKET_EVENTS.md](../technical/WEBSOCKET_EVENTS.md) (`node scripts/socket-inventory.mjs --md` 로 재생성)

## 요약

| 구분             | 건수 |
| ---------------- | ---- |
| 높음 (수정 대상) | 4    |
| 중간             | 5    |
| 낮음             | 6    |

공통 진단: 실시간 게임 3단계(스네이크 드래프트·역할 선택·가위바위보)의 진행 상태가 **프로세스 메모리에만** 있고,
배포(컨테이너 재시작)가 하루에도 여러 번인데 종료 유예가 10초라 진행 중인 게임이 그대로 끊긴다.
경매만 Redis 저장 + 합류 시 타이머 재무장이 있어 복구된다.

## 재시작 복구 현황

| 단계              | 상태 저장                                                          | 타이머                  | 재시작 후                                                                             | 판정             |
| ----------------- | ------------------------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------- | ---------------- |
| 경매              | Redis(`auction:state:*`, TTL 4h) + 부팅 시 복원                    | 게이트웨이 `setTimeout` | 첫 클라이언트 재접속 시 `_ensureBidResolveScheduled` 로 재무장, 지난 마감은 즉시 처리 | 양호 (지연 복구) |
| 스네이크 드래프트 | **인메모리 `draftStates` 만** (픽은 DB)                            | 인메모리 `pickTimers`   | 차례·마감 소실, 방은 `DRAFT` 로 남음                                                  | **높음 (H2)**    |
| 역할 선택         | **인메모리 `roleSelectionStates`·`readyCaptains`·`extendedUsers`** | 인메모리 `roomTimers`   | 준비·연장 전부 "진행 중이 아닙니다", 방은 `ROLE_SELECTION` 에 고정                    | **높음 (H3)**    |
| 가위바위보        | 인메모리 `rpsStates`(진영 확정 후엔 DB)                            | 인메모리                | 진행 중이던 판 소실, 호스트가 `rps:start` 로 다시 시작 가능                           | 중간 (M4)        |
| 방 퇴장 정리      | 인메모리 `disconnectCleanupTimers`                                 | 인메모리                | 대기 중이던 정리 소실                                                                 | 낮음 (L3)        |

호스트가 쓸 수 있는 유일한 탈출구는 "내전 종료"(`POST /rooms/:id/abort-to-lobby`)다.

## 높음

### H1. 경매 종료 후 역할 선택 시작 실패가 호스트에게 안 보이고, 재시도 수단도 없다

- 경로: `auction.gateway.ts` `_startRoleSelectionWithRetry` — 3회 실패 시 `auction-error`(+`retryable`)와 `role-selection-error` 를 보내고
  "호스트가 `retry-role-selection` 을 보내라"고 안내한다.
- 문제: `auction-error` 는 **듣는 클라이언트가 없다**. `role-selection-error` 는 `/role-selection` 네임스페이스로 가는데
  호스트는 아직 경매 화면(`/auction`)에 있다. `retry-role-selection` 을 **호출하는 클라이언트 코드가 없다**(계약표에서 "호출 없음").
- 증상: 경매는 끝났는데 아무 반응 없이 화면이 멈춘다(방 상태 `DRAFT_COMPLETED`). 직전 수정 bb27027f 와 같은 구간.
- 수정: 경매 화면이 `auction-error`(`retryable`)를 받아 호스트에게 "역할 선택 다시 시작" 버튼을 보이고 `retry-role-selection` 을 보낸다.
  호스트가 아니면 안내 문구만.

### H2. 스네이크 드래프트 상태가 재시작에 사라진다

- `snake-draft.service.ts` `draftStates` 는 `startSnakeDraft` 에서만 채워지고 복원이 없다. 픽 결과는 DB(`snakeDraftPick`)에 남지만
  차례 순서·현재 인덱스·`timerEnd` 가 사라져 `getDraftState` 가 `undefined`, 픽 타이머는 아무도 안 건다.
- 수정: 경매와 같은 방식 — 상태 변경 때마다 Redis 에 저장하고 부팅 시 `DRAFT` 방을 조회해 복원,
  게이트웨이가 합류 시 `timerEnd` 로 픽 타이머 재무장(지난 마감은 즉시 자동 픽).

### H3. 역할 선택 상태가 재시작에 사라진다

- `role-selection.service.ts` 의 상태 3종이 모두 인메모리. 재시작 후 `markCaptainReady`·`extendTimer` 는 "진행 중이 아닙니다"로 실패하고,
  타이머가 없어 자동 배정도 안 일어난다. `startRoleSelection` 은 `DRAFT_COMPLETED` 만 허용해 재시작도 못 한다.
- 수정: 상태·준비·연장 횟수를 Redis 에 저장·복원하고, 합류 시 `timerEnd` 로 타이머 재무장(지난 마감은 즉시 자동 배정).

### H4. 배포가 진행 중인 게임을 끊고, 코드의 60초 드레인은 실제로 10초에서 잘린다

- `app.module.ts` `onApplicationShutdown` 은 진행 중인 방이 없어질 때까지 최대 60초 기다린다. 그러나 `docker-compose.prod.yml` 에
  `stop_grace_period` 가 없어 Docker 기본 10초 뒤 SIGKILL — 드레인이 사실상 동작하지 않는다.
- 60초로도 한 판(드래프트·경매 수 분)을 못 기다린다. H2·H3 복구가 들어가기 전까지는 배포 시각이 곧 장애 시각이다.
- 수정: `api` 서비스에 `stop_grace_period: 90s`(PM2 kill_timeout 75초 + 여유). 장시간 게임은 H2·H3·경매 복구로 이어받는다.

## 중간 (보고서에 기록, 우선순위 협의)

- **M1. 게이트웨이 입력 검증이 없다.** 전역 `ValidationPipe`(main.ts)는 게이트웨이에 적용되지 않는다(Nest 하이브리드 앱 규칙).
  페이로드는 TS 타입 표기뿐이라 런타임에서 아무것도 보장하지 않는다. Prisma 는 `undefined` 필드를 where 에서 **지우므로**
  `findFirst({ where: { userId, roomId: data.roomId } })` 형태의 참가자 확인이 `roomId` 누락 시 "아무 방에나 참가 중이면 통과"가 된다
  (드래프트·역할 선택 join). 실제 악용은 어렵지만 방어선이 없다. → 공통 `assertId`/`@UsePipes` 도입.
- **M2. `join-scrim` 에 참가자 확인이 없다.** 인증된 사용자는 누구나 `scrim:{roomId}` 룸에 들어가 스크림 상태 갱신을 받는다(`scrim.gateway.ts`).
- **M3. `join-match` 에 참가자 확인이 없고**, 없는 `matchId` 면 `match.status` 에서 TypeError(try/catch 로 에러 응답은 나감). 참가자가 아니어도 RPS 상태를 받는다.
- **M4. 가위바위보 상태가 인메모리**(위 표). 호스트가 다시 시작하면 되지만, 진영 확정 직전 재시작이면 한 판이 날아간다.
- **M5. 쓰기 이벤트 레이트 리밋 공백.** 경매 입찰·드래프트 픽·채팅/DM 외에는 없다 — 방 `toggle-ready`·`select-team`, 역할 선택 이벤트,
  `rps:*`, `set-status`. 한 소켓이 초당 수백 번 보내도 막을 곳이 없다(HTTP 쪽 스로틀러와 별개).

## 낮음

- L1. 서버가 emit 하는데 듣는 클라이언트가 없는 죽은 이벤트: `clan-join-request-resolved`, `tournament-completed-error`, `host-changed`(방은 `room-updated` 로 갱신),
  `/room` 소켓의 `auction-started`·`snake-draft-started`·`role-selection-started`(로비는 `room.status` 기반 전환을 쓴다).
- L2. 클라이언트가 듣는데 서버가 안 보내는 이벤트: 스네이크 드래프트 `draft-state`, `timer-update`(클라 스토어는 둘 다 무시한다). 리스너 정리 대상.
- L3. 방 퇴장 정리 타이머(`disconnectCleanupTimers`)가 인메모리.
- L4. `presence` `set-status` 의 `status` 값을 검증하지 않는다(임의 문자열이 친구에게 방송됨).
- L5. 클라이언트가 `socket.off("connect")` 처럼 핸들러 없이 이벤트 전체를 해제한다(room-store·clan-store) — 같은 소켓에 다른 `connect` 리스너가 생기면 같이 사라진다.
- L6. 경매 복구는 "첫 클라이언트 재접속 시" 이뤄지는 지연 복구다. 모든 참가자가 끊긴 채 재시작되면 누군가 다시 들어올 때까지 정지한다(자동 재접속이 있어 실사용상 문제는 작다).

## 점검했고 문제 없던 것

- 핸드셰이크 JWT 검증: 전 게이트웨이. 방송(broadcast) 토큰은 자기 방만 구독(auction·draft·role·match).
- RPS 권한: 시작=호스트, 제출=두 팀장, 진영 선택=가위바위보 승자 팀장 — 모두 서버에서 확인.
- DM·클랜·프레즌스: 길이 제한, 레이트 리밋, 클랜 멤버 확인, 친구 관계 확인 있음. 알림은 `user:{id}` 룸 격리.
- 클라이언트 인증·재연결: 연결마다 `ensureValidToken` 으로 새 토큰, 무한 재연결, 경매·드래프트·역할 선택·방·클랜은 재연결 시 재입장.
- 방 게이트웨이 쓰기 이벤트(`toggle-ready`·`select-team`·`start-game`…)는 `userId` 를 서비스로 넘겨 서비스가 권한 검증.

## 미점검 범위 (명시)

- 4단계 인프라: nginx·Cloudflare WebSocket 유휴 타임아웃 vs Socket.IO ping 설정, Redis 장애 시 어댑터 동작 — 운영 서버를 건드리는 실험이 필요해 이번엔 제외.
- 동시성(입찰·픽 동시 도착)은 경매 `_withRoomBidLock` 존재만 확인했고 부하 시험은 하지 않았다(기존 `load-test/` 하네스로 후속).

## TODO

- [x] Task 1: H1 — 경매 화면에서 역할 선택 시작 실패를 호스트에게 알리고 재시도 버튼 제공
- [x] Task 2: H2 — 스네이크 드래프트 상태 Redis 저장·부팅 복원·픽 타이머 재무장
- [ ] Task 3: H3 — 역할 선택 상태 Redis 저장·부팅 복원·타이머 재무장
- [x] Task 4: H4 — `docker-compose.prod.yml` api `stop_grace_period` 90s
- [ ] Task 5: M1 — 게이트웨이 공통 입력 검증(`roomId` 등 문자열 id 가드)
- [ ] Task 6: M2·M3 — `join-scrim`·`join-match` 참가자 확인
- [ ] Task 7: M5 — 쓰기 이벤트 소켓 레이트 리밋(방·역할 선택·RPS·프레즌스)
- [ ] Task 8: M4 — 가위바위보 상태 Redis 저장
- [ ] Task 9: L1·L2·L5 — 죽은 이벤트·리스너 정리

### 수정 메모 — H2 (스네이크 드래프트)
- 상태를 픽마다 Redis(`snake-draft:state:{roomId}`, TTL 4h)에 저장하고 부팅 때 `DRAFT`·`SNAKE_DRAFT` 방을 복원한다.
- 복원 시 DB 픽 기록(`snakeDraftPick`)으로 차례·라운드·남은 선수를 다시 계산한다(`reconcileDraftState`) — Redis 가 한 픽 뒤처져도 DB 가 사실.
- 복원 직후 팀장이 억울하게 자동 픽당하지 않도록 최소 15초를 보장한다.
- 픽 타이머는 첫 참가자가 `join-draft-room` 할 때 `timerEnd` 로 다시 건다(방송 연결 제외). 마지막 픽 직후 죽었다면 완료 처리를 이어서 한다.
- **한계:** 이 배포 *이전*에 시작된 드래프트는 저장된 상태가 없어 복원되지 않는다(호스트 "내전 종료"). 배포 때 진행 중인 드래프트가 없는 시각을 고를 것.
