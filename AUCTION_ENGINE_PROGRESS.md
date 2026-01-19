# 옥션 엔진 구현 진행 상황

## ✅ 완료된 작업

### 1. 옥션 상태 머신 구현
- `AuctionStateService` 생성
- 상태 전환 로직 구현
- Redis 기반 상태 저장

### 2. 타이머 서비스 구현
- `AuctionTimerService` 생성
- 입찰 타이머 관리
- 타이머 만료 처리

## 🔄 진행 중인 작업

### 옥션 서비스 개선 필요
- [ ] 상태 머신과 통합
- [ ] 골드 계산 로직 추가
- [ ] 유찰 처리 로직 완성
- [ ] 캡틴 선출 로직 추가

## 📋 다음 단계

1. **옥션 서비스 업데이트**
   - `AuctionStateService`와 통합
   - 상태 전환 로직 추가

2. **골드 계산 로직**
   - 팀별 남은 골드 계산
   - 입찰 시 골드 검증

3. **캡틴 선출 로직**
   - RECRUITING -> CAPTAIN_SELECT 전환
   - 캡틴 2명 선출

4. **Socket.io 이벤트 완성**
   - 상태 업데이트 이벤트
   - 타이머 업데이트 이벤트

5. **유찰 처리 (Snake Draft)**
   - 유찰 플레이어 목록 관리
   - 팀별 교차 선택 로직

## 🎯 구현 상태

### Phase 1: 기반 구축 ✅
- [x] Monorepo 초기화
- [x] Docker Compose 설정
- [x] Prisma 스키마 설정
- [x] 기본 인증 플로우 구현

### Phase 2: 핵심 로직 (진행 중)
- [x] Socket.io Gateway 구축
- [x] 옥션 상태 머신 구현
- [x] Redis 상태 관리
- [ ] 입찰 동시성 제어 (Optimistic Locking) - 부분 완료
- [ ] 골드 계산 로직
- [ ] 유찰(Snake Draft) 처리

## 📝 참고사항

- 상태 머신은 Redis에 저장되며, DB와 동기화 필요
- 타이머는 메모리와 Redis 모두에서 관리
- 입찰 시 Optimistic Locking을 위해 version 필드 사용
