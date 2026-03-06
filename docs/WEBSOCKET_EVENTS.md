# WebSocket Events - API Specification

> 프론트엔드와 백엔드 간 WebSocket 이벤트 명세

---

## 🔴 발견된 이벤트 불일치

### Auction Namespace (`/auction`)

| Frontend (socket-client.ts) | Backend (auction.gateway.ts) | 상태 | 수정 필요 |
|------------------------------|------------------------------|------|----------|
| `join-auction` | `join-room` | ❌ 불일치 | Frontend |
| `place-bid` | `place-bid` | ✅ 일치 | - |
| `auction-started` | 없음 | ⚠️ Backend 미구현 | Backend |
| `new-bid` | `bid-placed` | ❌ 불일치 | Frontend |
| `player-sold` | 없음 | ⚠️ Backend 미구현 | Backend |
| `player-unsold` | 없음 | ⚠️ Backend 미구현 | Backend |
| `auction-complete` | `auction-complete` | ✅ 일치 | - |
| `timer-update` | 없음 | ⚠️ Backend 미구현 | Backend |
| - | `bid-resolved` | ⚠️ Frontend 미사용 | - |
| - | `timer-expired` | ⚠️ Frontend 미사용 | - |

---

## 📋 올바른 이벤트 명세

### 1. Auction Events (`/auction`)

#### Client → Server (Emit)

```typescript
// 경매 방 참가
emit('join-room', { roomId: string })
→ returns: { success: boolean, state: AuctionState }

// 입찰하기
emit('place-bid', { roomId: string, amount: number })
→ returns: { success: boolean, state: AuctionState } | { error: string }

// 입찰 확정 (타이머 만료 시)
emit('resolve-bid', { roomId: string })
→ returns: { success: boolean, result: any } | { error: string }

// 방 나가기
emit('leave-room', { roomId: string })
```

#### Server → Client (Listen)

```typescript
// 새로운 입찰 발생
on('bid-placed', (data: {
  userId: string;
  username: string;
  amount: number;
  timerEnd: number;
  timestamp: string;
}) => void)

// 입찰 확정 (플레이어 낙찰/유찰)
on('bid-resolved', (result: {
  player: Player;
  winner?: string;
  amount?: number;
  sold: boolean;
}) => void)

// 경매 완료
on('auction-complete', () => void)

// 타이머 만료
on('timer-expired', () => void)
```

### 2. Room Events (`/room`)

#### Client → Server

```typescript
emit('join-room', { roomId: string })
→ returns: { success: boolean, room: Room } | { error: string }

emit('leave-room', { roomId: string })
→ returns: { success: boolean } | { error: string }

emit('toggle-ready', { roomId: string })
→ returns: { success: boolean, isReady: boolean } | { error: string }

emit('send-message', { roomId: string, content: string })
→ returns: { success: boolean, message: Message } | { error: string }
```

#### Server → Client

```typescript
on('user-joined', (data: { userId: string, username: string }) => void)
on('user-left', (data: { userId: string, username: string }) => void)
on('ready-status-changed', (data: { userId: string, isReady: boolean }) => void)
on('all-ready', () => void)
on('new-message', (message: Message) => void)
```

#### 🔴 Event Name Mismatches Found

| Frontend (lobby-store.ts) | Backend (room.gateway.ts) | Status | Fix |
|---------------------------|---------------------------|--------|-----|
| `join-lobby` | `join-room` | ❌ Wrong | Frontend |
| `set-ready-status` | `toggle-ready` | ❌ Wrong | Frontend |
| `start-game` | Not implemented | ⚠️ Missing | Backend |
| `room-update` listener | Not emitted | ⚠️ Missing | Backend |
| `game-starting` listener | Not emitted | ⚠️ Missing | Backend |

### 3. Snake Draft Events (`/snake-draft`)

#### Client → Server

```typescript
emit('join-draft-room', { roomId: string })
emit('make-pick', { roomId: string, playerId: string })
emit('get-draft-state', { roomId: string })
```

#### Server → Client

```typescript
on('draft-started', (state: DraftState) => void)
on('pick-made', (data: {
  teamId: string;
  player: Player;
  nextTeamId: string;
  timerEnd: number;
}) => void)
on('draft-complete', (data: { teams: Team[] }) => void)
on('timer-update', (data: { timeLeft: number }) => void)
on('draft-state', (state: DraftState) => void)
```

### 4. Match Events (`/match`)

#### Client → Server

```typescript
emit('join-match-room', { roomId: string })
```

#### Server → Client

```typescript
on('bracket-generated', (data: { bracket: Bracket }) => void)
on('match-started', (data: { match: Match }) => void)
on('match-completed', (data: { match: Match }) => void)
on('bracket-update', (data: { bracket: Bracket }) => void)
```

### 5. Clan Events (`/clan`)

#### Client → Server

```typescript
emit('join-clan', { clanId: string })
emit('leave-clan', { clanId: string })
emit('send-message', { clanId: string, message: string })
```

#### Server → Client

```typescript
on('new-message', (message: Message) => void)
on('member-joined', (data: { member: Member }) => void)
on('member-left', (data: { userId: string }) => void)
on('clan-update', (clan: Clan) => void)
```

---

## 🔧 필요한 수정 사항

### Frontend (socket-client.ts)

```typescript
// ❌ 수정 전
export const auctionSocketHelpers = {
  joinAuction: (roomId: string) => {
    auctionSocket?.emit("join-auction", { roomId });  // ❌ 틀림
  },

  onNewBid: (callback: (data: any) => void) => {
    auctionSocket?.on("new-bid", callback);  // ❌ 틀림
  },
}

// ✅ 수정 후
export const auctionSocketHelpers = {
  joinAuction: (roomId: string) => {
    auctionSocket?.emit("join-room", { roomId });  // ✅ 올바름
  },

  onNewBid: (callback: (data: any) => void) => {
    auctionSocket?.on("bid-placed", callback);  // ✅ 올바름
  },
}
```

### Backend (auction.gateway.ts)

추가 필요한 이벤트들:

```typescript
// Timer update broadcast (AuctionService에서 호출)
emitTimerUpdate(roomId: string, timeLeft: number) {
  this.server.to(`room:${roomId}`).emit('timer-update', { timeLeft });
}

// Auction started
emitAuctionStarted(roomId: string, state: AuctionState) {
  this.server.to(`room:${roomId}`).emit('auction-started', { state });
}

// Player sold
emitPlayerSold(roomId: string, data: any) {
  this.server.to(`room:${roomId}`).emit('player-sold', data);
}

// Player unsold
emitPlayerUnsold(roomId: string, data: any) {
  this.server.to(`room:${roomId}`).emit('player-unsold', data);
}
```

---

## ✅ 수정 우선순위

### 🔴 필수 (즉시)
1. Frontend `join-auction` → `join-room` 변경
2. Frontend `new-bid` → `bid-placed` 변경

### 🟡 중요 (통합 테스트 전)
3. Backend에 `auction-started` 이벤트 추가
4. Backend에 `player-sold`/`player-unsold` 이벤트 추가
5. Backend에 `timer-update` 이벤트 추가

### 🟢 권장
6. 이벤트 이름 상수로 관리
7. TypeScript 타입 정의 공유

---

## 📝 권장 사항

### 이벤트 이름 상수화

```typescript
// shared/constants/socket-events.ts
export const AUCTION_EVENTS = {
  // Client to Server
  JOIN_ROOM: 'join-room',
  LEAVE_ROOM: 'leave-room',
  PLACE_BID: 'place-bid',
  RESOLVE_BID: 'resolve-bid',

  // Server to Client
  BID_PLACED: 'bid-placed',
  BID_RESOLVED: 'bid-resolved',
  AUCTION_COMPLETE: 'auction-complete',
  TIMER_EXPIRED: 'timer-expired',
  TIMER_UPDATE: 'timer-update',
  AUCTION_STARTED: 'auction-started',
  PLAYER_SOLD: 'player-sold',
  PLAYER_UNSOLD: 'player-unsold',
} as const;
```

사용 예시:
```typescript
// Backend
@SubscribeMessage(AUCTION_EVENTS.PLACE_BID)
handleBid(...) { ... }

// Frontend
auctionSocket?.emit(AUCTION_EVENTS.JOIN_ROOM, { roomId });
auctionSocket?.on(AUCTION_EVENTS.BID_PLACED, callback);
```

---

**Last Updated**: 2026-02-20
**Status**: ✅ 이벤트 불일치 수정 완료. socket-client.ts 및 lobby-store.ts 모두 올바른 이벤트명 사용. start-game 핸들러도 room.gateway.ts에 구현됨.
