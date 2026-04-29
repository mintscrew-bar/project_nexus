# WebSocket Events

> 기준일: 2026-04-27 (9개 gateway 직접 추출)
> REST 엔드포인트는 [API_REFERENCE.md](./API_REFERENCE.md) 참조

## 공통

- 전송 방식: `websocket` only (polling fallback 없음)
- 인증: 연결 시 `auth.token` 콜백으로 JWT accessToken 전달
- 모든 namespace에서 토큰 만료 시 연결이 끊어진다

```javascript
const socket = io("https://api.example.com/room", {
  transports: ["websocket"],
  auth: { token: accessToken },
});
```

---

## 1. Room (`/room`)

방 목록 구독, 로비 채팅, 준비 상태, 게임 시작을 담당한다.

### Client → Server

| 이벤트 | 페이로드 | 설명 |
|--------|---------|------|
| `subscribe-room-list` | — | 방 목록 실시간 구독 시작 |
| `unsubscribe-room-list` | — | 구독 해제 |
| `join-room` | `{ roomId, password? }` | 방 입장 |
| `leave-room` | `{ roomId }` | 방 퇴장 |
| `toggle-ready` | `{ roomId }` | 준비 상태 토글 |
| `toggle-spectator` | `{ roomId }` | 관전 모드 토글 |
| `start-game` | `{ roomId }` | 게임 시작 (호스트) |
| `send-message` | `{ roomId, content }` | 채팅 전송 |
| `is-typing` | `{ roomId, isTyping }` | 타이핑 상태 |

### Server → Client

| 이벤트 | 페이로드 | 설명 |
|--------|---------|------|
| `room-list-updated` | `{ type: "add"\|"update"\|"remove", room?, roomId? }` | 방 목록 변경 |
| `user-joined` | `{ userId, username }` | 유저 입장 |
| `user-left` | `{ userId, username }` | 유저 퇴장 |
| `room-updated` | room 객체 | 방 정보 변경 |
| `host-changed` | `{ newHostId }` | 호스트 변경 |
| `ready-status-changed` | `{ userId, isReady }` | 준비 상태 변경 |
| `all-ready` | — | 전원 준비 완료 |
| `participant-role-changed` | `{ userId, newRole }` | 참가자 역할 변경 |
| `new-message` | message 객체 | 새 채팅 메시지 |
| `user-typing` | `{ userId, username }` | 타이핑 중 |
| `user-stopped-typing` | `{ userId }` | 타이핑 종료 |
| `draft-started` | draft 상태 객체 | 드래프트 시작 알림 |
| `game-starting` | `{ roomId, teamMode }` | 게임 시작 알림 |
| `voice-status-changed` | `{ userId, inVoice }` | Discord 음성채널 상태 |

---

## 2. Auction (`/auction`)

경매 입찰, 팀장 선출, 낙찰/유찰 처리를 담당한다.

### Client → Server

| 이벤트 | 페이로드 | 설명 |
|--------|---------|------|
| `join-room` | `{ roomId }` | 경매방 입장 |
| `leave-room` | `{ roomId }` | 경매방 퇴장 |
| `volunteer-captain` | `{ roomId }` | 팀장 자원 |
| `finalize-volunteers` | `{ roomId, selectedUserIds? }` | 자원자 중 팀장 확정 |
| `select-manual-captains` | `{ roomId, userIds }` | 팀장 수동 지정 |
| `place-bid` | `{ roomId, amount }` | 입찰 (100골드 단위) |
| `resolve-bid` | `{ roomId }` | 입찰 확정 |
| `retry-role-selection` | `{ roomId }` | 역할 선택 재시도 |

### Server → Client

| 이벤트 | 페이로드 | 설명 |
|--------|---------|------|
| `volunteer-list-updated` | volunteer 데이터 | 자원자 목록 변경 |
| `captain-selection-phase` | `{ mode, requiredCount, volunteers, timerEnd, participants, hostId }` | 팀장 선출 단계 |
| `captains-confirmed` | `{ captainUserIds, teams }` | 팀장 확정 |
| `auction-started` | `{ teams, players, auctionState }` | 경매 시작 |
| `bid-placed` | `{ userId, teamId, username, amount, timerEnd, timestamp }` | 입찰 발생 |
| `bid-resolved` | resolved 결과 + state + teams + players | 낙찰/유찰 결정 |
| `player-sold` | `{ player, team, price }` | 낙찰 |
| `player-unsold` | `{ player }` | 유찰 |
| `timer-update` | `{ timeLeft }` | 타이머 업데이트 |
| `timer-expired` | — | 타이머 만료 |
| `auction-complete` | `{ teams }` | 경매 완료 |
| `auction-error` | `{ error, retryable? }` | 에러 |
| `session-aborted` | abort 데이터 | 세션 중단 |

> 입찰 규칙: 티어별 시작 골드 (Iron 3000 ~ Diamond+ 2000), 100골드 단위, 5초 소프트 타이머, 유찰 시 다음 사이클, 팀장 골드 소진 시 500골드 보너스.

---

## 3. Snake Draft (`/snake-draft`)

스네이크 순서 드래프트 픽을 담당한다.

### Client → Server

| 이벤트 | 페이로드 | 설명 |
|--------|---------|------|
| `join-draft-room` | `{ roomId }` | 드래프트 입장 |
| `leave-draft-room` | `{ roomId }` | 드래프트 퇴장 |
| `make-pick` | `{ roomId, targetPlayerId }` | 선수 픽 |
| `get-draft-state` | `{ roomId }` | 현재 상태 조회 |

### Server → Client

| 이벤트 | 페이로드 | 설명 |
|--------|---------|------|
| `draft-started` | draft 상태 객체 | 드래프트 시작 |
| `pick-made` | `{ teamId, player, nextTeamId, timerEnd }` | 픽 완료 |
| `auto-pick-made` | `{ teamId, playerId, username }` | 자동 픽 |
| `next-pick` | `{ currentTeamId, timerEnd }` | 다음 턴 |
| `draft-complete` | `{ teams }` | 드래프트 완료 |
| `timer-expired` | — | 타이머 만료 |
| `session-aborted` | abort 데이터 | 세션 중단 |

> 드래프트 규칙: 스네이크 순서 (A→B→C→C→B→A), 30초 픽 타이머, 만료 시 자동 픽.

---

## 4. Role Selection (`/role-selection`)

경매/드래프트 완료 후 포지션 선택을 담당한다.

### Client → Server

| 이벤트 | 페이로드 | 설명 |
|--------|---------|------|
| `join-room` | `{ roomId }` | 역할 선택 입장 |
| `select-role` | `{ roomId, role }` | 포지션 선택 |

### Server → Client

| 이벤트 | 페이로드 | 설명 |
|--------|---------|------|
| `role-selection-started` | 역할 선택 데이터 | 단계 시작 |
| `role-selected` | `{ userId, username, teamId, role, memberId }` | 역할 선택 완료 |
| `timer-tick` | `{ timeRemaining }` | 타이머 |
| `role-selection-completed` | `{ room }` | 전원 선택 완료 |
| `role-selection-timeout` | `{ message }` | 타임아웃 |
| `role-selection-error` | `{ message, error }` | 에러 |
| `session-aborted` | abort 데이터 | 세션 중단 |

---

## 5. Match (`/match`)

매치 시작/결과, 토너먼트 브래킷 업데이트를 담당한다.

### Client → Server

| 이벤트 | 페이로드 | 설명 |
|--------|---------|------|
| `join-match` | `{ matchId }` | 매치 입장 |
| `leave-match` | `{ matchId }` | 매치 퇴장 |
| `join-bracket` | `{ roomId }` | 브래킷 뷰 입장 |
| `leave-bracket` | `{ roomId }` | 브래킷 뷰 퇴장 |

### Server → Client

| 이벤트 | 페이로드 | 설명 |
|--------|---------|------|
| `match-started` | `{ tournamentCode? }` | 매치 시작 |
| `match-result` | `{ winnerId }` | 매치 결과 |
| `tournament-code-generated` | `{ code }` | Tournament Code 생성 |
| `bracket-generated` | `{ bracket }` | 브래킷 생성 |
| `bracket-updated` | `{ matches }` | 브래킷 업데이트 |
| `bracket-complete` | — | 브래킷 완료 |
| `tournament-completed` | `{ standings, completedAt }` | 토너먼트 종료 |
| `tournament-completed-error` | `{ error, roomId }` | 종료 처리 에러 |
| `session-aborted` | abort 데이터 | 세션 중단 |

---

## 6. Clan (`/clan`)

클랜 채팅, 멤버 변경 알림을 담당한다.

### Client → Server

| 이벤트 | 페이로드 | 설명 |
|--------|---------|------|
| `join-clan-chat` | `{ clanId }` | 클랜 채팅 입장 |
| `leave-clan-chat` | `{ clanId }` | 클랜 채팅 퇴장 |
| `send-clan-message` | `{ clanId, content }` | 메시지 전송 |
| `is-typing` | `{ clanId, isTyping }` | 타이핑 상태 |

### Server → Client

| 이벤트 | 페이로드 | 설명 |
|--------|---------|------|
| `new-clan-message` | message 객체 | 새 메시지 |
| `clan-message-deleted` | `{ messageId }` | 메시지 삭제 |
| `user-typing` | `{ userId, username }` | 타이핑 중 |
| `user-stopped-typing` | `{ userId }` | 타이핑 종료 |
| `member-joined` | `{ user }` | 멤버 가입 |
| `member-left` | `{ userId, username }` | 멤버 탈퇴 |
| `member-kicked` | `{ userId, username, kickedBy }` | 멤버 추방 |
| `member-promoted` | `{ userId, username, newRole }` | 역할 변경 |
| `ownership-transferred` | `{ oldOwnerId, newOwnerId }` | 오너 이전 |
| `clan-updated` | clan 객체 | 클랜 정보 변경 |
| `clan-deleted` | — | 클랜 삭제 |
| `clan-announcement-created` | announcement 객체 | 공지 생성 |
| `clan-announcement-deleted` | `{ announcementId }` | 공지 삭제 |
| `clan-join-request-received` | request 데이터 | 가입 신청 |
| `clan-join-request-resolved` | `{ requestId, accepted }` | 가입 신청 처리 |

---

## 7. DM (`/dm`)

1:1 다이렉트 메시지를 담당한다.

### Client → Server

| 이벤트 | 페이로드 | 설명 |
|--------|---------|------|
| `send-dm` | `{ receiverId, content }` | DM 전송 |
| `is-typing` | `{ receiverId, isTyping }` | 타이핑 상태 |
| `mark-read` | `{ senderId }` | 읽음 처리 |

### Server → Client

| 이벤트 | 페이로드 | 설명 |
|--------|---------|------|
| `new-dm` | message 객체 | 새 DM |
| `dm-unread-count` | `{ total }` | 안 읽은 수 |
| `dm-typing` | `{ userId, username }` | 타이핑 중 |
| `dm-stopped-typing` | `{ userId }` | 타이핑 종료 |

---

## 8. Notification (`notification`)

서버 발신 전용. 실시간 알림 푸시를 담당한다.

> Client → Server 이벤트 없음. 서버가 단방향으로 push한다.

### Server → Client

| 이벤트 | 페이로드 | 설명 |
|--------|---------|------|
| `notification` | notification 객체 | 새 알림 |
| `unread-count` | `{ count }` | 안 읽은 알림 수 |

---

## 9. Presence (`/presence`)

온라인/자리비움 상태 관리를 담당한다.

### Client → Server

| 이벤트 | 페이로드 | 설명 |
|--------|---------|------|
| `set-status` | `{ status: "ONLINE"\|"AWAY" }` | 내 상태 변경 |
| `get-friends-status` | — | 친구 상태 일괄 요청 |
| `subscribe-friend` | `{ friendId }` | 특정 친구 상태 구독 |
| `unsubscribe-friend` | `{ friendId }` | 구독 해제 |

### Server → Client

| 이벤트 | 페이로드 | 설명 |
|--------|---------|------|
| `friend-status-changed` | `{ userId, status, lastSeenAt }` | 친구 상태 변경 |
