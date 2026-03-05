# Discord 음성채널 검증 TODO

> **배경**: 게임 시작 시 웹 로비에서 "준비 완료"한 유저와 Discord 음성채널에 실제로 있는 유저가 다를 수 있음.
> 팀 배정 후 없는 사람한테 이동 명령을 보내면 오류 발생 → 사전 검증 필요.
>
> ✅ **완료**: 2026-03-05 — 커밋 `0cae2a4`

---

## 현재 상태

- `GatewayIntentBits.GuildVoiceStates` 인텐트 등록됨 (`discord-bot.service.ts:67`) ✅
- `getUsersInVoiceChannel(channelId)` 메서드 존재 (`discord-voice.service.ts:448`) ✅
- `getDiscordUserIdByNexusUserId()` 메서드 존재 (`discord-voice.service.ts:469`) ✅
- `voiceStateUpdate` 이벤트 핸들러 구현됨 (`discord-bot.service.ts`) ✅
- `start-game` 핸들러에 음성채널 검증 추가됨 (`room.gateway.ts`) ✅
- 프론트 로비에 음성 상태 실시간 표시 구현됨 ✅

---

## 설계 결정사항

| 항목 | 결정 |
|------|------|
| Discord 미연동 유저 처리 | 검증 스킵 (봇 계정, Discord OAuth 없는 유저) |
| Discord 봇 미설정 방 | 채널 없으면 검증 통과 (optional) |
| 실시간 UI 업데이트 | 구현 (voiceStateUpdate → WebSocket 브로드캐스트) |
| 시작 시점 하드 검증 | 구현 (start-game에서 최종 확인) |

---

## TODO

### 백엔드

- [x] 1. `discord-bot.service.ts` - voiceStateUpdate 핸들러 추가

`setupEventHandlers()` 메서드에 추가:

```typescript
this.client.on('voiceStateUpdate', async (oldState, newState) => {
  const channelId = newState.channelId ?? oldState.channelId;
  if (!channelId) return;

  // RoomDiscordChannel에서 해당 채널이 어느 방의 Lobby인지 조회
  const roomChannel = await this.prisma.roomDiscordChannel.findFirst({
    where: { channelId, teamName: 'Lobby' },
  });
  if (!roomChannel) return;

  // NestJS EventEmitter로 이벤트 발행
  this.eventEmitter.emit('discord.voice.update', {
    roomId: roomChannel.roomId,
    discordUserId: newState.member?.id ?? oldState.member?.id,
    joined: !!newState.channelId,  // true=입장, false=퇴장
  });
});
```

- `@nestjs/event-emitter` 패키지 설치 필요 (`pnpm add @nestjs/event-emitter`)
- `EventEmitter2` DI 주입 필요
- `PrismaService` DI 주입 필요 (이미 있음)

---

- [x] 2. `discord-voice.service.ts` - validateVoicePresence 메서드 추가

```typescript
async validateVoicePresence(roomId: string): Promise<{
  valid: boolean;
  missingUsers: { userId: string; username: string }[];
}> {
  // 1. 방의 Lobby 채널 ID 조회
  const lobbyChannel = await this.prisma.roomDiscordChannel.findFirst({
    where: { roomId, teamName: 'Lobby' },
  });

  // Discord 채널 없으면 검증 스킵 (Discord 미설정 방)
  if (!lobbyChannel) return { valid: true, missingUsers: [] };

  // 2. 현재 음성채널에 있는 Discord ID 목록 조회
  const voiceDiscordIds = await this.getUsersInVoiceChannel(lobbyChannel.channelId);

  // 3. 방 참가자 중 isReady인 유저들의 Discord ID 조회
  const participants = await this.prisma.roomParticipant.findMany({
    where: { roomId, isReady: true },
    include: {
      user: {
        include: { authProviders: { where: { provider: 'DISCORD' } } },
      },
    },
  });

  const missingUsers: { userId: string; username: string }[] = [];

  for (const p of participants) {
    // 봇 계정 스킵
    if (/^testbot_\d+$/.test(p.user.username)) continue;

    const discordProvider = p.user.authProviders[0];
    // Discord 미연동 유저 스킵
    if (!discordProvider) continue;

    // 음성채널에 없으면 missing으로 기록
    if (!voiceDiscordIds.includes(discordProvider.providerId)) {
      missingUsers.push({ userId: p.userId, username: p.user.username });
    }
  }

  return { valid: missingUsers.length === 0, missingUsers };
}
```

---

- [x] 3. `room.gateway.ts` - voiceStateUpdate 이벤트 수신 및 브로드캐스트

```typescript
// @OnEvent('discord.voice.update') 리스너 추가
@OnEvent('discord.voice.update')
async handleDiscordVoiceUpdate(payload: {
  roomId: string;
  discordUserId: string;
  joined: boolean;
}) {
  // discordUserId → nexusUserId 역매핑
  const nexusUserId = await this.discordVoiceService
    .getDiscordUserIdByNexusUserId(payload.discordUserId)
    // 실제로는 반대 방향 메서드 필요: discordId → nexusUserId

  // 방 참가자들에게 브로드캐스트
  this.server.to(payload.roomId).emit('voice-status-changed', {
    userId: nexusUserId,
    inVoice: payload.joined,
  });
}
```

- `DiscordVoiceService`에 `getNexusUserIdByDiscordId(discordId)` 역방향 메서드 추가 필요

---

- [x] 4. `room.gateway.ts` - start-game 검증 강화

`handleStartGame` 핸들러에서 실제 시작 전 검증 추가:

```typescript
// Discord 음성채널 검증 (Discord 설정된 방만)
const voiceCheck = await this.discordVoiceService.validateVoicePresence(data.roomId);
if (!voiceCheck.valid) {
  const names = voiceCheck.missingUsers.map((u) => u.username).join(', ');
  return { error: `음성채널에 없는 참가자가 있습니다: ${names}` };
}
```

---

### 프론트엔드

- [x] 5. 로비 페이지 - 음성 상태 실시간 표시

**소켓 이벤트 구독** (`apps/web/src/app/tournaments/[id]/lobby/page.tsx` 또는 관련 store):

```typescript
socket.on('voice-status-changed', ({ userId, inVoice }) => {
  // 참가자 목록의 voice 상태 업데이트
  updateVoiceStatus(userId, inVoice);
});
```

**참가자 카드 UI**:
- 각 참가자 옆에 `🔊` / `🔇` 뱃지 표시
- `inVoice: true` → 초록 뱃지
- `inVoice: false` → 회색 뱃지

**시작 버튼 조건**:
- Discord 채널이 있는 방: 모든 참가자 `inVoice === true`일 때만 활성화
- Discord 채널 없는 방: 기존 로직 유지 (모두 `isReady === true`면 활성화)

- [x] 6. 에러 처리 - start-game 실패 시 UI 피드백

서버에서 `error: "음성채널에 없는 참가자..."` 반환 시:
- 토스트 메시지로 누가 없는지 표시
- 시작 버튼 다시 활성화 (loading 해제)

---

## 구현 순서 (권장)

```
1. pnpm add @nestjs/event-emitter
2. EventEmitterModule을 AppModule에 등록
3. discord-voice.service.ts → validateVoicePresence + getNexusUserIdByDiscordId 추가
4. discord-bot.service.ts → voiceStateUpdate 핸들러 추가 + EventEmitter 주입
5. room.gateway.ts → @OnEvent 리스너 + start-game 검증 추가
6. 프론트 로비 → voice-status-changed 구독 + UI 업데이트
7. 프론트 시작 버튼 → inVoice 조건 추가
```

---

## 아키텍처 플로우

```
디스코드 음성채널 입장/퇴장
    ↓
voiceStateUpdate (discord-bot.service)
    ↓
DB: RoomDiscordChannel 조회 → roomId 확인
    ↓
EventEmitter.emit('discord.voice.update')
    ↓
RoomGateway @OnEvent 수신
    ↓
WebSocket: room에 'voice-status-changed' 브로드캐스트
    ↓
프론트: 🔊/🔇 뱃지 업데이트
    ↓
[호스트가 시작 버튼 클릭]
    ↓
start-game → validateVoicePresence() 하드 검증
    ↓
OK → 게임 시작 / NG → 에러 메시지 반환
```

---

## 관련 파일

| 파일 | 작업 |
|------|------|
| `apps/api/src/modules/discord/discord-bot.service.ts` | voiceStateUpdate 핸들러 |
| `apps/api/src/modules/discord/discord-voice.service.ts` | validateVoicePresence, getNexusUserIdByDiscordId |
| `apps/api/src/modules/room/room.gateway.ts` | @OnEvent, start-game 검증 |
| `apps/web/src/app/tournaments/[id]/lobby/page.tsx` | voice-status-changed 구독 + UI |
| `apps/web/src/stores/lobby-store.ts` | voiceStatus 상태 추가 |
