# Known Issues & Technical Debt

> 현재 프로젝트의 알려진 문제점과 개선이 필요한 부분

---

## 🔴 긴급 (High Priority)

### 1. Prisma Schema 업데이트 필요
**상태**: 🔴 차단됨
**영향**: 백엔드 모든 기능

**문제**:
- 백엔드 코드는 완성되었으나 Prisma 스키마가 업데이트 안 됨
- 임시 타입 파일(`community.types.ts`) 사용 중
- 필드 누락으로 일부 기능 주석 처리됨

**해결 방법**:
- [`SCHEMA_UPDATES_NEEDED.md`](./SCHEMA_UPDATES_NEEDED.md) 참조
- Prisma 마이그레이션 실행 필요

---

## 🟡 중요 (Medium Priority)

### 2. 경매 컴포넌트 중복
**상태**: 🟡 정리 필요
**영향**: 프론트엔드 경매 기능

**문제**:
```
apps/web/src/components/
├── auction/                    # 기존 컴포넌트 (작은 단위)
│   ├── AuctionStatus.tsx
│   ├── BiddingPanel.tsx
│   ├── BidHistory.tsx
│   └── TeamList.tsx
└── domain/
    └── AuctionBoard.tsx        # 새로운 통합 컴포넌트
```

- 두 가지 경매 UI 구현이 공존
- 기존: 작은 단위로 나뉨 (집에서 작업)
- 새로운: 통합 컴포넌트 (오늘 작업)

**해결 방법**:
1. **Option A** (권장): `AuctionBoard`를 메인으로 사용, 기존 컴포넌트 삭제
2. **Option B**: 기존 컴포넌트를 새 디자인 시스템에 맞춰 리팩토링
3. **Option C**: 둘 다 유지 (다른 용도로 사용)

**현재 상태**:
- 경매 페이지(`/auction/[id]`)는 기존 컴포넌트 사용 중
- 빌드 성공, 동작 확인 필요

### 3. Store 타입 불일치
**상태**: 🟡 확인 필요
**영향**: Auction, Room 기능

**문제**:
- `auction-store.ts`: 집에서 수정된 버전
- `room-store.ts`: 오늘 업데이트된 버전
- API 응답 타입과 Store 타입이 일치하지 않을 수 있음

**확인 필요**:
```typescript
// auction-store.ts
interface AuctionState {
  players: Player[];  // 배열로 관리?
  teams: Team[];
  // ...
}

// AuctionBoard.tsx
interface AuctionState {
  currentPlayer: Player | null;  // 단일 플레이어?
  // ...
}
```

**해결 방법**:
- 백엔드 API 응답 구조 확인
- Store 타입과 컴포넌트 Props 타입 통일

### 4. WebSocket 이벤트 불일치 수정 완료 ✅
**상태**: 🟢 수정됨
**영향**: 실시간 기능 (경매, 드래프트, 채팅)

**발견 및 수정한 문제**:

#### Auction Namespace (`/auction`)
- ❌ `join-auction` → ✅ `join-room`
- ❌ `new-bid` → ✅ `bid-placed`
- ✅ 추가된 이벤트: `bid-resolved`, `timer-expired`

#### Room/Lobby Namespace (`/room`)
- ❌ Namespace: `/lobby` → ✅ `/room`
- ❌ `join-lobby` → ✅ `join-room`
- ❌ `set-ready-status` → ✅ `toggle-ready`
- ❌ `room-update` 리스너 → ✅ `ready-status-changed`, `user-joined`, `user-left` 리스너로 교체
- ⚠️ `start-game` 이벤트 - 백엔드 미구현

**참조**: [`WEBSOCKET_EVENTS.md`](./WEBSOCKET_EVENTS.md)

**남은 작업**:
- 백엔드에 `start-game` 이벤트 핸들러 추가 필요

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

### 7. 에러 바운더리 미적용
**상태**: 🟢 권장
**영향**: 사용자 경험

**문제**:
- 전역 에러 바운더리 없음
- 컴포넌트 에러 시 전체 앱 크래시 가능

**해결 방법**:
```tsx
// app/error.tsx 생성
'use client';

export default function Error({ error, reset }) {
  return (
    <div>
      <h2>문제가 발생했습니다</h2>
      <button onClick={reset}>다시 시도</button>
    </div>
  );
}
```

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

## 📊 현재 상태 요약

| 구분 | 백엔드 | 프론트엔드 |
|------|--------|------------|
| **컴파일** | ✅ 성공 | ✅ 성공 |
| **빌드** | ✅ 성공 | ✅ 성공 |
| **타입 체크** | ✅ 통과 | ✅ 통과 (1개 warning) |
| **린트** | ✅ 통과 | ✅ 통과 |
| **스키마** | ❌ 업데이트 필요 | - |
| **통합 테스트** | ⏳ 미실행 | ⏳ 미실행 |

---

## 🔧 권장 작업 순서

1. **즉시**
   - [ ] Prisma 스키마 업데이트 및 마이그레이션

2. **우선순위**
   - [ ] 경매 컴포넌트 중복 정리 (Option A 또는 B 선택)
   - [ ] Store 타입 통일
   - [ ] WebSocket 이벤트 테스트

3. **선택적**
   - [ ] 유틸리티 함수 통합
   - [ ] 에러 바운더리 추가
   - [ ] 성능 최적화 (필요시)

4. **장기**
   - [ ] 테스트 코드 작성
   - [ ] 문서화 개선
   - [ ] CI/CD 설정

---

## 💡 참고 문서

- [SCHEMA_UPDATES_NEEDED.md](./SCHEMA_UPDATES_NEEDED.md) - 스키마 변경사항
- [QUICK_FIX_GUIDE.md](./QUICK_FIX_GUIDE.md) - 빠른 해결 가이드
- [API_REFERENCE.md](./API_REFERENCE.md) - API 명세
- [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) - 디자인 시스템

---

**Last Updated**: 2026-01-21
**Status**: 빌드 성공, 통합 테스트 대기
