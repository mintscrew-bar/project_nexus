# Known Issues & Technical Debt

> 현재 프로젝트의 알려진 문제점과 개선이 필요한 부분

---

## ✅ 해결됨 (Resolved)

### 1. ~~Prisma Schema 업데이트 필요~~
**상태**: ✅ 완료
**해결**: 모든 모델/필드/관계가 schema.prisma에 반영됨. 모든 모듈 활성화 상태.

### 2. ~~경매 컴포넌트 중복~~
**상태**: ✅ 정리됨
**해결**: `domain/AuctionBoard.tsx` 통합 컴포넌트로 일원화. 기존 auction/ 폴더 제거됨.

### 3. ~~Store 타입 불일치~~
**상태**: ✅ 확인됨
**해결**: `auction-store.ts`, `room-store.ts` 타입 정상. `lobby-store.ts`도 올바른 이벤트 사용.

### 4. ~~WebSocket 이벤트 불일치~~
**상태**: ✅ 수정됨
**해결**: socket-client.ts, lobby-store.ts 모두 올바른 이벤트명 사용. `start-game` 핸들러도 room.gateway.ts에 구현됨.

---

## 🟡 중요 (Medium Priority)

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

### 7. ~~에러 바운더리 미적용~~
**상태**: ✅ 완료
**해결**: `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx` 생성됨.

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
| **타입 체크** | ✅ 통과 | ✅ 통과 |
| **린트** | ✅ 통과 | ✅ 통과 |
| **스키마** | ✅ 완료 | - |
| **에러 바운더리** | - | ✅ 적용 |
| **Cron Jobs** | ✅ 적용 | - |
| **통합 테스트** | ⏳ 미실행 | ⏳ 미실행 |

---

## 🔧 권장 작업 순서

1. ~~**즉시**~~ ✅
   - [x] Prisma 스키마 업데이트 및 마이그레이션

2. ~~**우선순위**~~ ✅
   - [x] 경매 컴포넌트 중복 정리
   - [x] Store 타입 통일
   - [x] WebSocket 이벤트 수정

3. ~~**선택적**~~ ✅
   - [x] 유틸리티 함수 통합
   - [x] 에러 바운더리 추가
   - [x] Cron jobs (자동 밴 해제, 티어 동기화)

4. **장기** (남은 작업)
   - [ ] 테스트 코드 작성
   - [ ] Email 서비스 구현
   - [ ] CI/CD 설정

---

## 💡 참고 문서

- [SCHEMA_UPDATES_NEEDED.md](./SCHEMA_UPDATES_NEEDED.md) - 스키마 변경사항
- [QUICK_FIX_GUIDE.md](./QUICK_FIX_GUIDE.md) - 빠른 해결 가이드
- [API_REFERENCE.md](./API_REFERENCE.md) - API 명세
- [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) - 디자인 시스템

---

**Last Updated**: 2026-02-20
**Status**: 핵심 이슈 모두 해결됨. 테스트 코드 및 Email 서비스 작성 대기.
