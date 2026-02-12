# 내전 진행 흐름 분석 및 개선

## 📋 내전 진행 흐름

### 전체 흐름도

```
1. WAITING (대기)
   ↓ (호스트가 경매/드래프트 시작)
2. TEAM_SELECTION (팀 선택)
   ↓ (경매/드래프트 시작)
3. DRAFT (드래프트 진행)
   ↓ (경매/드래프트 완료)
4. DRAFT_COMPLETED (드래프트 완료)
   ↓ (역할 선택 시작)
5. ROLE_SELECTION (역할 선택)
   ↓ (역할 선택 완료 → 브래킷(대진표) 자동 생성)
6. ★ 대진표 단계 (IN_PROGRESS)
   - 대진표 페이지: /tournaments/[id]/bracket
   - 매치별 Tournament Code 생성, 매치 시작, 결과 보고
   ↓ (모든 매치 완료)
7. COMPLETED (토너먼트 완료)
```

**대진표(브래킷) 포함 여부**: ✅ 흐름 중간에 포함됨  
- 역할 선택 완료 시 **대진표가 자동 생성**되고, 룸 상태가 `IN_PROGRESS`로 변경됩니다.  
- 로비에서 상태가 `IN_PROGRESS`이면 **대진표 페이지로 자동 이동**합니다.  
- `DRAFT_COMPLETED`부터 로비에 **「대진표 보기」** 버튼이 노출되며, 클릭 시 대진표 페이지로 이동합니다.  
- 대진표 페이지에서 매치 클릭 → Tournament Code 생성 → 매치 시작 → 결과 보고까지 진행합니다.

---

## 🔄 단계별 상세 흐름

### 1. 룸 생성 (WAITING)
- 호스트가 룸 생성
- 참가자들이 룸에 입장
- 최소 인원 충족 시 경매/드래프트 시작 가능

**상태**: `WAITING` → `TEAM_SELECTION`

---

### 2. 팀 구성 (TEAM_SELECTION → DRAFT → DRAFT_COMPLETED)

#### 경매 방식 (AUCTION)
- 호스트가 경매 시작
- 상태: `DRAFT`
- 주장들이 선수 입찰
- 모든 선수 배정 완료 시
- 상태: `DRAFT_COMPLETED` → `ROLE_SELECTION`

#### 스네이크 드래프트 방식 (SNAKE_DRAFT)
- 호스트가 드래프트 시작
- 상태: `DRAFT`
- 주장들이 순서대로 선수 선택
- 모든 선수 배정 완료 시
- 상태: `DRAFT_COMPLETED` → `ROLE_SELECTION`

---

### 3. 역할 선택 (ROLE_SELECTION)
- 각 팀원이 자신의 역할 선택 (TOP, JUNGLE, MID, ADC, SUPPORT)
- 타이머: 2분
- 모든 역할 선택 완료 시:
  1. 브래킷 자동 생성 시도
  2. 성공 시: 상태 `IN_PROGRESS`
  3. 실패 시: 에러 발생, 상태 유지

**검증**:
- 모든 팀이 5명인지 확인
- 각 팀원이 역할을 선택했는지 확인

---

### 4. 브래킷 생성 (ROLE_SELECTION → IN_PROGRESS)

**브래킷 타입**:
- 2팀: SINGLE (단판)
- 3,5,6,7팀: ROUND_ROBIN (리그전)
- 4팀: SINGLE_ELIMINATION 또는 DOUBLE_ELIMINATION
- 8팀: SINGLE_ELIMINATION 또는 DOUBLE_ELIMINATION

**처리 과정**:
1. 룸 상태 확인 (`ROLE_SELECTION`)
2. 팀 구성 검증 (각 팀 5명)
3. 브래킷 타입 결정
4. 매치 생성 (트랜잭션)
5. 룸 상태 업데이트 (`IN_PROGRESS`)

**중복 생성 방지**:
- 기존 매치 존재 시 기존 브래킷 반환
- 트랜잭션으로 원자성 보장

---

### 5. 매치 진행 (IN_PROGRESS)

#### 매치 시작 전
1. Tournament Code 생성 (선택사항)
   - Riot API 호출
   - 실패 시 플레이스홀더 코드 사용
2. 매치 시작
   - 상태: `PENDING` → `IN_PROGRESS`
   - 검증: 팀 할당 확인 (TBD 아님)

#### 매치 진행 중
- Riot API로 라이브 상태 확인 가능
- WebSocket으로 실시간 업데이트

#### 매치 완료
1. 결과 보고
   - 승자 팀 ID 입력
   - 검증: 승자가 매치의 팀 중 하나인지 확인
2. 승자 진출
   - Single Elimination: 다음 라운드로 진출
   - Double Elimination: 승자/패자 라우팅
3. 브래킷 업데이트
   - WebSocket으로 실시간 브래킷 업데이트

---

### 6. 토너먼트 완료 (COMPLETED)

**완료 조건**:
- 모든 매치가 `COMPLETED` 상태
- 최종 승자 결정

**처리**:
1. 룸 상태 업데이트 (`COMPLETED`)
2. Discord 알림 전송
3. 최종 순위 계산

---

## ✅ 개선된 사항

### 1. 상태 전환 로직 개선

**문제점**:
- `completeRoleSelection`에서 브래킷 생성 실패 시에도 룸 상태를 `IN_PROGRESS`로 변경
- 브래킷 생성과 역할 선택 완료에서 중복 상태 업데이트

**해결**:
- 브래킷 생성이 룸 상태를 업데이트하도록 통일
- 브래킷 생성 실패 시 에러 throw하여 상태 변경 방지
- `completeRoleSelection`은 브래킷 생성 성공 후 상태를 조회만 함

---

### 2. 브래킷 중복 생성 방지

**문제점**:
- 브래킷 생성이 여러 번 호출되면 매치가 중복 생성될 수 있음

**해결**:
- 브래킷 생성 전 기존 매치 확인
- 기존 브래킷이 있으면 반환
- 트랜잭션으로 원자성 보장

---

### 3. 에러 처리 개선

**문제점**:
- 브래킷 생성 실패 시 에러를 무시하고 계속 진행
- 사용자에게 명확한 피드백 부족

**해결**:
- 브래킷 생성 실패 시 명확한 에러 메시지
- WebSocket으로 에러 이벤트 전송
- 상태 불일치 방지

---

## 🔍 검증 포인트

### 각 단계별 검증

1. **브래킷 생성**
   - ✅ 룸 상태: `ROLE_SELECTION`
   - ✅ 호스트 권한 확인
   - ✅ 각 팀 5명 확인
   - ✅ 브래킷 중복 생성 방지

2. **매치 시작**
   - ✅ 호스트 권한 확인
   - ✅ 매치 상태: `PENDING`
   - ✅ 팀 할당 확인 (TBD 아님)

3. **Tournament Code 생성**
   - ✅ 호스트 권한 확인
   - ✅ 팀 할당 확인
   - ✅ 모든 플레이어 Riot 계정 연결 확인

4. **결과 보고**
   - ✅ 호스트 권한 확인
   - ✅ 매치 상태: `IN_PROGRESS`
   - ✅ 승자 팀 ID 검증
   - ✅ 팀 할당 확인

---

## ⚠️ 주의사항

### 1. 상태 불일치 방지
- 브래킷 생성 실패 시 룸 상태를 `IN_PROGRESS`로 변경하지 않음
- 트랜잭션으로 원자성 보장

### 2. 중복 작업 방지
- 브래킷 중복 생성 방지
- 매치 중복 시작 방지
- 결과 중복 보고 방지

### 3. 에러 복구
- 브래킷 생성 실패 시 수동 생성 가능
- 상태 불일치 시 수동 복구 가능

---

## 🧪 테스트 시나리오

### 정상 흐름
1. ✅ 룸 생성 → 경매/드래프트 → 역할 선택 → 브래킷 생성 → 매치 진행 → 완료

### 에러 케이스
1. ✅ 브래킷 생성 실패 시 상태 유지 확인
2. ✅ TBD 매치 시작 시도 시 에러 확인
3. ✅ 브래킷 중복 생성 시 기존 브래킷 반환 확인
4. ✅ 잘못된 승자 ID 보고 시 에러 확인

---

## 📊 상태 전환 다이어그램

```
WAITING
  ↓ startAuction/startDraft
TEAM_SELECTION
  ↓ auction/draft in progress
DRAFT
  ↓ completeAuction/completeDraft
DRAFT_COMPLETED
  ↓ startRoleSelection
ROLE_SELECTION
  ↓ completeRoleSelection → generateBracket
IN_PROGRESS (브래킷 생성됨)
  ↓ 모든 매치 완료
COMPLETED
```

---

## ✅ 검증 완료

- [x] 상태 전환 로직 정상 작동
- [x] 브래킷 중복 생성 방지
- [x] 에러 처리 개선
- [x] 상태 불일치 방지
- [x] 검증 로직 강화

---

## 🎯 결론

내전 진행 흐름이 안정적으로 작동하도록 개선되었습니다:

1. ✅ 상태 전환 로직 개선
2. ✅ 브래킷 중복 생성 방지
3. ✅ 에러 처리 강화
4. ✅ 검증 로직 추가

모든 단계에서 적절한 검증과 에러 처리가 이루어지며, 상태 불일치 문제가 해결되었습니다.
