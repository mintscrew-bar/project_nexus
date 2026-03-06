# Nexus Fresh 부하 테스트

Artillery 기반 부하 테스트 모음입니다.

## 준비

```bash
# 1. load-test 디렉토리로 이동
cd load-test

# 2. 의존성 설치
npm install

# 3. 테스트 유저 시드 (DB에 test1~3 유저 생성)
# 프로젝트 루트에서 실행
pnpm --filter @nexus/database db:seed

# 4. 서버 실행 확인 (포트 4000)
curl http://localhost:4000/api/health
```

## 테스트 실행

### 1. HTTP API 부하 테스트 (권장 첫 번째)
```bash
npm run http
```
- 로그인 → 프로필 조회
- 방 목록 조회
- 클랜 정보 조회
- 3단계 부하: 워밍업(2/s) → 일반(10/s) → 최대(30/s)

### 2. 소켓 채팅 부하 테스트
```bash
npm run socket:chat
```
- /clan 네임스페이스 연결 + 메시지 전송
- JWT 인증 흐름 포함

### 3. 경매 소켓 부하 테스트
```bash
npm run socket:auction
```
- **주의**: `scenarios/socket-auction.yml`의 `roomId` 값을 실제 방 ID로 바꿔야 합니다.
- /auction 네임스페이스 연결 + 입찰 이벤트

### HTML 리포트 생성
```bash
npm run http:report
# → report-http.html 파일 생성, 브라우저에서 열기
```

## 결과 읽는 법

```
Response time (msec):
  min: 12       ← 최소 응답시간
  max: 1823     ← 최대 응답시간
  median: 45    ← 중간값
  p95: 234      ← 95%의 요청이 이 시간 안에 완료
  p99: 891      ← 99%의 요청이 이 시간 안에 완료

Codes:
  200: 1200     ← 성공한 요청 수
  500: 3        ← 서버 에러 수 (0이어야 이상적)
```

**p95 < 1000ms**: HTTP API 목표
**p95 < 2000ms**: 소켓 이벤트 목표

## 병목 발견 시

| 증상 | 원인 의심 | 조치 |
|------|----------|------|
| p99만 높고 p95는 정상 | 일부 DB 쿼리 느림 | Prisma 쿼리 최적화 |
| 소켓 연결 실패 급증 | 동시 연결 한도 초과 | NestJS cors/adapter 설정 확인 |
| 500 에러 증가 | DB 커넥션 풀 고갈 | PrismaClient 풀 크기 조정 |
| 메모리 급증 | 소켓 리소스 누수 | Gateway disconnect 핸들러 점검 |
