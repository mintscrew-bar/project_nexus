# 테스트 가이드

## 사전 준비

1. **환경변수 설정**
   - `nexus/apps/api/.env` 파일 생성 (ENV_SETUP.md 참고)
   - `nexus/apps/web/.env.local` 파일 생성

2. **데이터베이스 및 Redis 실행**
   ```bash
   cd nexus
   docker-compose -f docker-compose.dev.yml up -d
   ```

3. **Prisma 마이그레이션**
   ```bash
   cd nexus
   pnpm db:push
   ```

## 테스트 절차

### 1. 백엔드 서버 시작
```bash
cd nexus/apps/api
pnpm dev
```

서버가 `http://localhost:4000`에서 실행되어야 합니다.

### 2. 프론트엔드 서버 시작
```bash
cd nexus/apps/web
pnpm dev
```

서버가 `http://localhost:3000`에서 실행되어야 합니다.

### 3. 인증 플로우 테스트

#### 3.1 로그인 테스트
1. 브라우저에서 `http://localhost:3000` 접속
2. "Discord로 로그인" 버튼 클릭
3. Discord OAuth 인증 완료
4. `/auth/callback`으로 리다이렉트되어 토큰 저장 확인
5. `/dashboard`로 자동 이동 확인

#### 3.2 사용자 정보 조회 테스트
1. 대시보드 페이지에서 사용자 정보 표시 확인
2. 브라우저 개발자 도구 > Network 탭에서 `/api/auth/me` 요청 확인
3. Authorization 헤더에 Bearer 토큰 포함 확인

#### 3.3 토큰 갱신 테스트
1. Access Token 만료 시뮬레이션 (15분 대기 또는 토큰 수동 만료)
2. API 요청 시 자동으로 `/api/auth/refresh` 호출 확인
3. 새 Access Token으로 요청 재시도 확인

#### 3.4 로그아웃 테스트
1. 헤더의 "로그아웃" 버튼 클릭
2. `/api/auth/logout` 요청 확인
3. 메인 페이지로 리다이렉트 확인
4. 이후 API 요청 시 401 에러 발생 확인

## 예상 문제 및 해결

### 문제 1: CORS 에러
**증상**: 브라우저 콘솔에 CORS 관련 에러
**해결**: 
- `nexus/apps/api/.env`에 `CORS_ORIGINS=http://localhost:3000` 설정 확인
- 백엔드 서버 재시작

### 문제 2: 401 Unauthorized
**증상**: API 요청 시 401 에러
**해결**:
- 토큰이 제대로 저장되었는지 확인
- JWT_SECRET 환경변수 확인
- 브라우저 개발자 도구에서 Authorization 헤더 확인

### 문제 3: Discord OAuth 리다이렉트 실패
**증상**: Discord 로그인 후 에러 페이지
**해결**:
- Discord Developer Portal에서 Redirect URL 확인
- `DISCORD_CALLBACK_URL` 환경변수 확인
- `APP_URL` 환경변수 확인

### 문제 4: 데이터베이스 연결 실패
**증상**: 백엔드 시작 시 DB 연결 에러
**해결**:
- Docker Compose가 실행 중인지 확인
- `DATABASE_URL` 환경변수 확인
- Prisma 마이그레이션 실행 확인

## 다음 단계

인증 시스템 테스트 완료 후:
1. 옥션 엔진 구현 (Phase 2)
2. Socket.io Gateway 구축
3. 옥션 상태 머신 구현
