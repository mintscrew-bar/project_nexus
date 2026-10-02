# WebSocket Events

> 자동 생성 — `node scripts/socket-inventory.mjs --md` (2026-10-02).
> 손으로 고치지 않는다. 정적 분석이라 변수로 만든 이벤트 이름은 빠질 수 있다.
> REST 엔드포인트는 [API_REFERENCE.md](./API_REFERENCE.md) 참조

## 공통

- 전송: 클라이언트는 `transports: ["websocket", "polling"]` (polling 폴백 허용) — `apps/web/src/lib/socket-client.ts`
- 인증: 연결 시 `auth.token` 콜백으로 JWT accessToken 전달 (방송 오버레이는 broadcast 토큰)
- 어댑터: Redis (`apps/api/src/adapters/redis-io.adapter.ts`)

## /auction

파일: `apps/api/src/modules/auction/auction.gateway.ts`

### 클라이언트 → 서버

| 이벤트                   | 핸들러                 | 클라이언트 호출 |
| ------------------------ | ---------------------- | --------------- |
| `join-room`              | auction.gateway.ts:214 | 5곳             |
| `leave-room`             | auction.gateway.ts:317 | 2곳             |
| `volunteer-captain`      | auction.gateway.ts:330 | 1곳             |
| `finalize-volunteers`    | auction.gateway.ts:350 | 1곳             |
| `select-manual-captains` | auction.gateway.ts:373 | 1곳             |
| `place-bid`              | auction.gateway.ts:432 | 1곳             |
| `vote-item-skip`         | auction.gateway.ts:539 | 1곳             |
| `retry-role-selection`   | auction.gateway.ts:680 | **없음**        |

### 서버 → 클라이언트

| 이벤트                    | emit 위치 수 | 클라이언트 리스너 |
| ------------------------- | ------------ | ----------------- |
| `volunteer-list-updated`  | 1            | 2곳               |
| `captain-selection-phase` | 1            | 2곳               |
| `volunteer-finalized`     | 1            | 1곳               |
| `captains-confirmed`      | 1            | 2곳               |
| `auction-started`         | 2            | 2곳               |
| `bid-placed`              | 2            | 2곳               |
| `item-skip-vote-updated`  | 1            | 1곳               |
| `auction-item-started`    | 1            | 2곳               |
| `player-sold`             | 1            | 2곳               |
| `player-unsold`           | 1            | 2곳               |
| `timer-update`            | 1            | 2곳               |
| `timer-expired`           | 1            | 1곳               |
| `auction-error`           | 2            | **없음**          |
| `session-aborted`         | 1            | 2곳               |
| `bid-resolved`            | 1            | 2곳               |
| `auction-complete`        | 1            | 2곳               |

## /clan

파일: `apps/api/src/modules/clan/clan.gateway.ts`

### 클라이언트 → 서버

| 이벤트              | 핸들러              | 클라이언트 호출 |
| ------------------- | ------------------- | --------------- |
| `join-clan-chat`    | clan.gateway.ts:103 | 1곳             |
| `leave-clan-chat`   | clan.gateway.ts:129 | 1곳             |
| `send-clan-message` | clan.gateway.ts:146 | 1곳             |
| `is-typing`         | clan.gateway.ts:183 | 1곳             |

### 서버 → 클라이언트

| 이벤트                       | emit 위치 수 | 클라이언트 리스너 |
| ---------------------------- | ------------ | ----------------- |
| `new-clan-message`           | 1            | 1곳               |
| `user-typing`                | 1            | 1곳               |
| `user-stopped-typing`        | 1            | 1곳               |
| `member-joined`              | 1            | 1곳               |
| `member-left`                | 1            | 1곳               |
| `member-kicked`              | 1            | 1곳               |
| `member-promoted`            | 1            | 1곳               |
| `ownership-transferred`      | 1            | 1곳               |
| `clan-updated`               | 1            | 1곳               |
| `clan-deleted`               | 1            | 1곳               |
| `clan-message-deleted`       | 1            | 1곳               |
| `clan-announcement-created`  | 1            | 1곳               |
| `clan-announcement-deleted`  | 1            | 1곳               |
| `clan-join-request-received` | 1            | 1곳               |
| `clan-join-request-resolved` | 1            | **없음**          |

## /dm

파일: `apps/api/src/modules/dm/dm.gateway.ts`

### 클라이언트 → 서버

| 이벤트      | 핸들러            | 클라이언트 호출 |
| ----------- | ----------------- | --------------- |
| `send-dm`   | dm.gateway.ts:130 | 1곳             |
| `is-typing` | dm.gateway.ts:212 | 1곳             |
| `mark-read` | dm.gateway.ts:261 | 1곳             |

### 서버 → 클라이언트

| 이벤트              | emit 위치 수 | 클라이언트 리스너 |
| ------------------- | ------------ | ----------------- |
| `dm-unread-count`   | 3            | 1곳               |
| `dm-stopped-typing` | 3            | 1곳               |
| `new-dm`            | 2            | 1곳               |
| `dm-typing`         | 1            | 1곳               |

## /match

파일: `apps/api/src/modules/match/match.gateway.ts`

### 클라이언트 → 서버

| 이벤트              | 핸들러               | 클라이언트 호출 |
| ------------------- | -------------------- | --------------- |
| `join-match`        | match.gateway.ts:136 | 3곳             |
| `leave-match`       | match.gateway.ts:188 | 2곳             |
| `join-bracket`      | match.gateway.ts:196 | 2곳             |
| `leave-bracket`     | match.gateway.ts:222 | 1곳             |
| `rps:captain-ready` | match.gateway.ts:599 | 1곳             |
| `rps:start`         | match.gateway.ts:653 | 1곳             |
| `rps:submit`        | match.gateway.ts:689 | 1곳             |
| `rps:choose-side`   | match.gateway.ts:725 | 1곳             |

### 서버 → 클라이언트

| 이벤트                       | emit 위치 수 | 클라이언트 리스너 |
| ---------------------------- | ------------ | ----------------- |
| `rps:state`                  | 2            | 2곳               |
| `rps:ready-state`            | 1            | 2곳               |
| `rps:reveal`                 | 2            | 2곳               |
| `rps:error`                  | 1            | 1곳               |
| `rps:done`                   | 1            | 1곳               |
| `rps:invite`                 | 1            | 2곳               |
| `match-started`              | 2            | 2곳               |
| `match-result`               | 2            | 2곳               |
| `bracket-generated`          | 1            | 2곳               |
| `broadcast-focus-updated`    | 1            | 1곳               |
| `broadcast-control-updated`  | 1            | 1곳               |
| `bracket-updated`            | 1            | 2곳               |
| `series-updated`             | 1            | 1곳               |
| `bracket-complete`           | 1            | 2곳               |
| `tournament-code-generated`  | 1            | 1곳               |
| `session-aborted`            | 1            | 2곳               |
| `tournament-completed`       | 1            | 2곳               |
| `tournament-completed-error` | 1            | **없음**          |

## /notification

파일: `apps/api/src/modules/notification/notification.gateway.ts`

### 클라이언트 → 서버

| 이벤트 | 핸들러 | 클라이언트 호출 |
| ------ | ------ | --------------- |

### 서버 → 클라이언트

| 이벤트         | emit 위치 수 | 클라이언트 리스너 |
| -------------- | ------------ | ----------------- |
| `notification` | 1            | 1곳               |
| `unread-count` | 1            | 1곳               |
| `room-invite`  | 1            | 1곳               |

## /presence

파일: `apps/api/src/modules/presence/presence.gateway.ts`

### 클라이언트 → 서버

| 이벤트               | 핸들러                  | 클라이언트 호출 |
| -------------------- | ----------------------- | --------------- |
| `set-status`         | presence.gateway.ts:122 | 1곳             |
| `get-friends-status` | presence.gateway.ts:139 | 1곳             |
| `subscribe-friend`   | presence.gateway.ts:151 | 1곳             |
| `unsubscribe-friend` | presence.gateway.ts:177 | 1곳             |

### 서버 → 클라이언트

| 이벤트                  | emit 위치 수 | 클라이언트 리스너 |
| ----------------------- | ------------ | ----------------- |
| `friend-status-changed` | 2            | 1곳               |

## /role-selection

파일: `apps/api/src/modules/role-selection/role-selection.gateway.ts`

### 클라이언트 → 서버

| 이벤트               | 핸들러                        | 클라이언트 호출 |
| -------------------- | ----------------------------- | --------------- |
| `join-room`          | role-selection.gateway.ts:125 | 5곳             |
| `cancel-role`        | role-selection.gateway.ts:178 | 1곳             |
| `select-role`        | role-selection.gateway.ts:202 | 1곳             |
| `extend-timer`       | role-selection.gateway.ts:446 | 1곳             |
| `mark-captain-ready` | role-selection.gateway.ts:512 | 1곳             |

### 서버 → 클라이언트

| 이벤트                      | emit 위치 수 | 클라이언트 리스너 |
| --------------------------- | ------------ | ----------------- |
| `role-cancelled`            | 1            | 2곳               |
| `role-selected`             | 1            | 2곳               |
| `timer-tick`                | 2            | 1곳               |
| `role-selection-navigation` | 1            | 1곳               |
| `role-selection-completed`  | 1            | 2곳               |
| `role-selection-error`      | 2            | 1곳               |
| `role-selection-timeout`    | 1            | 1곳               |
| `role-selection-started`    | 1            | 2곳               |
| `timer-extended`            | 1            | 1곳               |
| `captain-ready-updated`     | 1            | 1곳               |
| `session-aborted`           | 1            | 2곳               |

## /room

파일: `apps/api/src/modules/room/room.gateway.ts`

### 클라이언트 → 서버

| 이벤트                  | 핸들러               | 클라이언트 호출 |
| ----------------------- | -------------------- | --------------- |
| `subscribe-room-list`   | room.gateway.ts:376  | 1곳             |
| `unsubscribe-room-list` | room.gateway.ts:387  | 1곳             |
| `join-room`             | room.gateway.ts:464  | 5곳             |
| `leave-room`            | room.gateway.ts:547  | 3곳             |
| `toggle-ready`          | room.gateway.ts:602  | 1곳             |
| `toggle-spectator`      | room.gateway.ts:635  | 1곳             |
| `select-team`           | room.gateway.ts:665  | 1곳             |
| `start-game`            | room.gateway.ts:689  | 1곳             |
| `auto-balance-reroll`   | room.gateway.ts:925  | 1곳             |
| `auto-balance-swap`     | room.gateway.ts:951  | 1곳             |
| `auto-balance-undo`     | room.gateway.ts:981  | 1곳             |
| `auto-balance-confirm`  | room.gateway.ts:1009 | 1곳             |
| `send-message`          | room.gateway.ts:1057 | 3곳             |
| `is-typing`             | room.gateway.ts:1094 | 1곳             |

### 서버 → 클라이언트

| 이벤트                     | emit 위치 수 | 클라이언트 리스너 |
| -------------------------- | ------------ | ----------------- |
| `room-left`                | 1            | 1곳               |
| `user-left`                | 5            | 2곳               |
| `room-start-alert`         | 1            | 1곳               |
| `room-list-updated`        | 3            | 1곳               |
| `user-joined`              | 1            | 2곳               |
| `host-changed`             | 2            | **없음**          |
| `room-updated`             | 10           | 2곳               |
| `ready-status-changed`     | 1            | 2곳               |
| `all-ready`                | 1            | 1곳               |
| `participant-role-changed` | 1            | 1곳               |
| `participant-team-changed` | 1            | 1곳               |
| `draft-started`            | 1            | 1곳               |
| `game-starting`            | 2            | 1곳               |
| `new-message`              | 1            | 3곳               |
| `user-typing`              | 1            | 1곳               |
| `auction-started`          | 1            | 1곳               |
| `snake-draft-started`      | 1            | **없음**          |
| `role-selection-started`   | 1            | 1곳               |
| `user-stopped-typing`      | 1            | 1곳               |
| `voice-status-changed`     | 1            | 1곳               |
| `participant-kicked`       | 1            | 1곳               |

## /scrim

파일: `apps/api/src/modules/scrim/scrim.gateway.ts`

### 클라이언트 → 서버

| 이벤트        | 핸들러              | 클라이언트 호출 |
| ------------- | ------------------- | --------------- |
| `join-scrim`  | scrim.gateway.ts:63 | 1곳             |
| `leave-scrim` | scrim.gateway.ts:72 | 1곳             |

### 서버 → 클라이언트

| 이벤트            | emit 위치 수 | 클라이언트 리스너 |
| ----------------- | ------------ | ----------------- |
| `scrim-created`   | 1            | 1곳               |
| `scrim-started`   | 1            | 1곳               |
| `scrim-ready`     | 1            | 1곳               |
| `round-started`   | 1            | 1곳               |
| `round-completed` | 2            | 1곳               |
| `scrim-updated`   | 1            | 1곳               |
| `scrim-completed` | 1            | 1곳               |

## /snake-draft

파일: `apps/api/src/modules/room/snake-draft.gateway.ts`

### 클라이언트 → 서버

| 이벤트             | 핸들러                     | 클라이언트 호출 |
| ------------------ | -------------------------- | --------------- |
| `join-draft-room`  | snake-draft.gateway.ts:139 | 2곳             |
| `leave-draft-room` | snake-draft.gateway.ts:187 | 1곳             |
| `make-pick`        | snake-draft.gateway.ts:196 | 1곳             |
| `get-draft-state`  | snake-draft.gateway.ts:347 | 1곳             |

### 서버 → 클라이언트

| 이벤트            | emit 위치 수 | 클라이언트 리스너 |
| ----------------- | ------------ | ----------------- |
| `pick-made`       | 2            | 2곳               |
| `draft-complete`  | 2            | 2곳               |
| `next-pick`       | 2            | 2곳               |
| `draft-started`   | 1            | 2곳               |
| `timer-expired`   | 1            | 1곳               |
| `auto-pick-made`  | 1            | 1곳               |
| `session-aborted` | 1            | 2곳               |
