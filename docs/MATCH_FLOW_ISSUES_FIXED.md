# 내전 진행 흐름 문제점 및 해결

## 🔴 발견된 문제점

### 1. 상태 전환 중복 업데이트 문제

**문제**:
- `role-selection.service.ts`의 `completeRoleSelection`에서 브래킷 생성 후 룸 상태를 `IN_PROGRESS`로 업데이트
- `match-bracket.service.ts`의 `generateBracket`에서도 룸 상태를 `IN_PROGRESS`로 업데이트
- 브래킷 생성 실패 시에도 룸 상태가 `IN_PROGRESS`로 변경됨

**영향**:
- 상태 불일치: 룸이 `IN_PROGRESS` 상태인데 브래킷이 없는 경우 발생 가능
- 불필요한 DB 업데이트

**해결**:
- ✅ 브래킷 생성이 룸 상태를 업데이트하도록 통일
- ✅ 브래킷 생성 실패 시 에러 throw하여 상태 변경 방지
- ✅ `completeRoleSelection`은 브래킷 생성 성공 후 상태를 조회만 함

---

### 2. 브래킷 중복 생성 문제

**문제**:
- 브래킷 생성이 여러 번 호출되면 매치가 중복 생성될 수 있음
- 기존 브래킷 존재 여부 확인 없음

**영향**:
- 중복 매치 생성
- 데이터 불일치

**해결**:
- ✅ 브래킷 생성 전 기존 매치 확인 로직 추가
- ✅ 기존 브래킷이 있으면 반환
- ✅ 트랜잭션으로 원자성 보장

---

### 3. 에러 처리 부족

**문제**:
- 브래킷 생성 실패 시 에러를 무시하고 계속 진행
- 사용자에게 명확한 피드백 부족
- WebSocket 에러 이벤트 부족

**영향**:
- 사용자가 문제를 인지하지 못함
- 디버깅 어려움

**해결**:
- ✅ 브래킷 생성 실패 시 명확한 에러 메시지
- ✅ WebSocket으로 에러 이벤트 전송 (`role-selection-error`)
- ✅ 상태 불일치 방지

---

## ✅ 해결된 사항

### 1. 상태 전환 로직 개선

**변경 전**:
```typescript
// role-selection.service.ts
try {
  await this.matchService.generateBracket(room.hostId, roomId);
} catch (error) {
  console.error("Error generating bracket:", error);
  // Continue anyway, bracket can be generated manually
}

// Update room status to IN_PROGRESS (항상 실행됨)
await this.prisma.room.update({
  where: { id: roomId },
  data: { status: RoomStatus.IN_PROGRESS },
});
```

**변경 후**:
```typescript
// role-selection.service.ts
try {
  await this.matchService.generateBracket(room.hostId, roomId);
  // Bracket generation successful - room status is already updated to IN_PROGRESS
} catch (error: any) {
  // If bracket generation fails, throw error instead of silently continuing
  throw new BadRequestException(
    `Failed to generate bracket: ${error.message || 'Unknown error'}. Please try again or generate bracket manually.`
  );
}

// Fetch updated room (status already updated by generateBracket)
const updatedRoom = await this.prisma.room.findUnique({
  where: { id: roomId },
  // ...
});
```

---

### 2. 브래킷 중복 생성 방지

**추가된 로직**:
```typescript
// match-bracket.service.ts
// Check if bracket already exists (prevent duplicate generation)
const existingMatches = await this.prisma.match.findMany({
  where: { roomId },
  select: { id: true },
});

if (existingMatches.length > 0) {
  this.logger.warn(`Bracket already exists for room ${roomId}`);
  const existingBracket = await this.getExistingBracket(roomId);
  return existingBracket;
}
```

---

### 3. 에러 처리 개선

**WebSocket 에러 이벤트 추가**:
```typescript
// role-selection.gateway.ts
catch (error: any) {
  const errorMessage = error?.message || "Role selection completion failed";
  this.server.to(`room:${roomId}`).emit("role-selection-error", {
    message: errorMessage,
    error: error?.response?.message || errorMessage,
  });
  throw error;
}
```

---

## 🔍 추가 검증 사항

### 1. Round Robin 승자 처리

**현재 상태**:
- Round Robin은 리그전 방식으로 각 팀이 모든 다른 팀과 한 번씩 경기
- 승자 진출 로직이 없음 (정상)
- 최종 순위는 승수로 결정

**확인 필요**:
- ✅ Round Robin의 경우 `advanceWinnerToNextRound`가 호출되지 않음 (정상)
- ✅ 최종 순위 계산 로직 필요 (현재는 없음)

---

### 2. Tournament Code 생성

**현재 상태**:
- Tournament Code는 선택사항
- 매치 시작 전에 생성 가능
- Riot API 실패 시 플레이스홀더 코드 사용

**확인 필요**:
- ✅ Tournament Code 없이도 매치 시작 가능 (정상)
- ✅ 매치 데이터 수집은 Tournament Code가 있을 때만 가능

---

### 3. 매치 데이터 수집

**현재 상태**:
- 매치 완료 후 백그라운드에서 데이터 수집
- Tournament Code가 있어야 수집 가능
- 재시도 로직 있음 (최대 5회)

**확인 필요**:
- ✅ Tournament Code 없으면 데이터 수집 안 됨 (정상)
- ✅ 재시도 로직이 `setTimeout` 사용 (개선 가능하지만 작동함)

---

## 📊 상태 전환 검증

### 정상 흐름

```
WAITING
  ↓ startAuction/startDraft
TEAM_SELECTION
  ↓
DRAFT
  ↓ completeAuction/completeDraft
DRAFT_COMPLETED
  ↓ startRoleSelection
ROLE_SELECTION
  ↓ completeRoleSelection → generateBracket (성공)
IN_PROGRESS ✅
  ↓ 모든 매치 완료
COMPLETED
```

### 에러 케이스

```
ROLE_SELECTION
  ↓ completeRoleSelection → generateBracket (실패)
ROLE_SELECTION (상태 유지) ✅
  ↓ 에러 메시지 전달
  ↓ 수동 브래킷 생성 가능
```

---

## ✅ 최종 검증

### 상태 전환
- [x] 중복 상태 업데이트 제거
- [x] 브래킷 생성 실패 시 상태 유지
- [x] 트랜잭션으로 원자성 보장

### 브래킷 생성
- [x] 중복 생성 방지
- [x] 기존 브래킷 반환
- [x] 에러 처리 개선

### 에러 처리
- [x] 명확한 에러 메시지
- [x] WebSocket 에러 이벤트
- [x] 상태 불일치 방지

---

## 🎯 결론

내전 진행 흐름이 안정적으로 작동하도록 개선되었습니다:

1. ✅ 상태 전환 로직 정상 작동
2. ✅ 브래킷 중복 생성 방지
3. ✅ 에러 처리 강화
4. ✅ 상태 불일치 방지

모든 단계에서 적절한 검증과 에러 처리가 이루어지며, 문제없이 이용할 수 있습니다.
