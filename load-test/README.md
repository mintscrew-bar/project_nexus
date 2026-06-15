# Nexus Fresh 부하 테스트

Node.js 기반 부하/안정성 테스트 모음입니다.

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

### 3. 방 정원 안정성 테스트
```bash
ADMIN_EMAIL=admin@nexus.dev ADMIN_PASSWORD=... npm run room:capacity
```
- 10/15/20/30/40명 방을 순서대로 생성
- 관리자 봇으로 정원까지 채움
- 호스트 준비 → /room 소켓 start-game → 팀 구성 검증
- 테스트 후 생성한 방 자동 삭제

옵션:
```bash
# 특정 정원만 반복 테스트
ADMIN_TOKEN=... npm run room:capacity -- --counts=20,40 --repeat=3

# 생성/봇/준비까지만 확인하고 게임 시작은 생략
ADMIN_TOKEN=... npm run room:capacity -- --no-start

# 원격 서버 대상
ADMIN_TOKEN=... npm run room:capacity -- --base=https://api.example.com
```

주의: 방 생성 정책상 유효한 정원은 `10, 15, 20, 30, 40`입니다.

### 4. 실제 유저 흐름 안정성 테스트
```bash
npm run room:realistic -- --count=40
```
- `testbot_01` ~ `testbot_40` 유저를 DB에 준비
- 각 봇이 실제 JWT로 `/room` 소켓 연결
- 순차 입장, 타이핑, 채팅, 준비, 게임 시작
- `/role-selection` 소켓에서 팀별 포지션 선택
- 브래킷 생성 후 `/match` 소켓에서 가위바위보 시작까지 진행

필수 환경:
```bash
DATABASE_URL=...
JWT_ACCESS_SECRET=...
```

옵션:
```bash
# 실제 사람 입장처럼 조금 더 천천히 입장
npm run room:realistic -- --count=40 --join-delay=500

# 반복 실행
npm run room:realistic -- --count=30 --repeat=5

# 브래킷 생성까지만 확인하고 RPS는 생략
npm run room:realistic -- --count=20 --skip-rps

# 여러 PENDING 매치의 RPS까지 검증
npm run room:realistic -- --count=40 --rps-matches=4
```

### 5. 브라우저 실제 흐름 테스트
```bash
npm install
npx playwright install chromium
npm run browser:room -- --count=10
```
- 각 테스트봇이 별도 브라우저 컨텍스트로 로그인 콜백 진입
- 로비 페이지 렌더링, 소켓 연결, 준비 버튼 클릭
- 방장 브라우저에서 내전 시작 클릭
- 역할 선택 페이지에서 포지션 버튼 클릭
- 브래킷 페이지 도착 및 RPS 소켓 검증

옵션:
```bash
# 브라우저 창을 직접 보면서 실행
npm run browser:room -- --count=10 --headful

# 40명 렌더링/라우팅 테스트
npm run browser:room -- --count=40 --join-delay=250

# RPS 검증 생략
npm run browser:room -- --count=20 --skip-rps
```

### 6. 경매 소켓 부하 테스트
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
| 429 응답 증가 | 같은 IP/NAT의 여러 유저가 전역 제한을 공유하거나 조회 API가 과도하게 호출됨 | 응답 로그의 URL 확인, 인증 유저별 제한/엔드포인트별 제한 조정 |
| 500 에러 증가 | DB 커넥션 풀 고갈 | PrismaClient 풀 크기 조정 |
| 메모리 급증 | 소켓 리소스 누수 | Gateway disconnect 핸들러 점검 |
