# Project Nexus - Setup Guide

## 사전 요구사항

### 필수 소프트웨어
- **Node.js**: v20 이상
- **pnpm**: v8 이상 (`npm install -g pnpm`)
- **Docker & Docker Compose**: PostgreSQL + Redis 실행용
- **Git**

### 필수 계정 (외부 서비스)
- **Discord Developer Portal**: Bot 토큰 및 OAuth2
- **Google Cloud Console**: OAuth2 인증
- **Riot Games Developer Portal**: API 키

---

## 빠른 시작 (5분)

### 1. 저장소 클론 및 의존성 설치

```bash
git clone <repository-url>
cd nexus_fresh
pnpm install
```

### 2. 환경 변수 설정

```bash
# 루트의 .env.example을 apps/api/.env로 복사
cp .env.example apps/api/.env
```

`apps/api/.env` 파일을 열어서 아래 값들을 채워주세요:

| 변수 | 설명 | 필수 |
|------|------|------|
| `JWT_ACCESS_SECRET` | `openssl rand -base64 32`로 생성 | O |
| `JWT_REFRESH_SECRET` | `openssl rand -base64 32`로 생성 | O |
| `GOOGLE_CLIENT_ID` | Google OAuth 클라이언트 ID | O |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 시크릿 | O |
| `DISCORD_CLIENT_ID` | Discord OAuth 클라이언트 ID | O |
| `DISCORD_CLIENT_SECRET` | Discord OAuth 시크릿 | O |
| `DISCORD_BOT_TOKEN` | Discord 봇 토큰 | O |
| `DISCORD_GUILD_ID` | Discord 서버 ID | O |
| `RIOT_API_KEY` | Riot Developer API 키 | O |
| `DATABASE_URL` | PostgreSQL URL (기본값 사용 가능) | - |
| `REDIS_URL` | Redis URL (기본값 사용 가능) | - |

> **참고**: `DATABASE_URL`과 `REDIS_URL`은 Docker Compose 기본 설정과 맞춰져 있어서 그대로 두면 됩니다.

### 3. Docker로 인프라 시작

```bash
docker compose -f docker-compose.dev.yml up -d
```

PostgreSQL(5432)과 Redis(6379)가 실행됩니다.

### 4. 데이터베이스 설정

```bash
# Prisma 클라이언트 생성
pnpm db:generate

# 스키마를 DB에 반영
pnpm db:push
```

### 5. 개발 서버 실행

```bash
pnpm dev
```

- 백엔드: http://localhost:4000
- 프론트엔드: http://localhost:3000

---

## 외부 서비스 설정

### Discord Bot 설정

1. [Discord Developer Portal](https://discord.com/developers/applications) 접속
2. "New Application" 클릭
3. **Bot** 탭에서 봇 생성 및 토큰 복사 → `DISCORD_BOT_TOKEN`
4. **OAuth2** 탭에서:
   - Redirect URI: `http://localhost:4000/api/auth/discord/callback`
   - Scopes: `identify`, `email`
5. Bot Permissions:
   - Manage Channels
   - Move Members
   - View Channels

### Google OAuth 설정

1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. 프로젝트 생성
3. "APIs & Services" → "Credentials"
4. "Create Credentials" → "OAuth 2.0 Client ID"
5. Authorized redirect URIs:
   - `http://localhost:4000/api/auth/google/callback`

### Riot API 키 발급

1. [Riot Developer Portal](https://developer.riotgames.com) 접속
2. 로그인 후 Development Key 발급 (개발용, 24시간 유효)
3. Rate Limits:
   - Development: 20 requests/second, 100 requests/2 minutes
   - Production: Application 승인 필요

---

## 개발 도구

### Prisma Studio (데이터베이스 GUI)
```bash
pnpm db:studio
# http://localhost:5555
```

### DB 스키마 수정 후
```bash
# schema.prisma 수정 후 아래 순서로 실행
pnpm db:generate   # Prisma 클라이언트 재생성
pnpm db:push       # DB에 반영
```

> **주의**: `prisma migrate dev` 대신 `pnpm db:push`를 사용합니다.

---

## 문제 해결

### Docker 컨테이너 상태 확인
```bash
docker compose -f docker-compose.dev.yml ps
docker compose -f docker-compose.dev.yml logs postgres
```

### "Port already in use" 오류
```bash
# Windows
netstat -ano | findstr :4000
taskkill /PID <PID> /F

# macOS/Linux
lsof -ti:4000 | xargs kill -9
```

### Prisma 타입 오류
```bash
pnpm db:generate
```

### WebSocket 연결 실패
- `apps/api/.env`의 `CORS_ORIGINS`에 프론트엔드 URL 포함 확인
- 방화벽 설정 확인

### OAuth 401 에러 (invalid_client)
- Google/Discord Console에서 **리디렉션 URI**가 정확히 일치하는지 확인
- 콜백 URL에 `/api` prefix 포함 필수:
  ```
  GOOGLE_CALLBACK_URL=http://localhost:4000/api/auth/google/callback
  DISCORD_CALLBACK_URL=http://localhost:4000/api/auth/discord/callback
  ```

### Discord 봇 초기화 실패
Discord 봇 자격 증명이 없거나 잘못된 경우 경고 메시지가 표시되지만 서버는 정상 작동합니다:
```
Discord bot not properly configured, skipping bot initialization
```

---

## 프로젝트 구조

```
nexus_fresh/
├── apps/
│   ├── api/              # NestJS 백엔드 (port 4000)
│   │   ├── src/modules/  # 기능별 모듈 (auth, room, auction 등)
│   │   └── .env          # 환경변수 (git 미추적)
│   └── web/              # Next.js 프론트엔드 (port 3000)
│       └── src/
│           ├── app/      # Next.js App Router
│           ├── stores/   # Zustand 상태 관리
│           └── lib/      # API/Socket 클라이언트
├── packages/
│   ├── database/         # @nexus/database - Prisma 스키마 & 클라이언트
│   └── types/            # @nexus/types - 공유 TypeScript 타입
├── docs/                 # 문서
├── .env.example          # 환경변수 템플릿
├── docker-compose.dev.yml # 개발용 Docker (PostgreSQL + Redis)
└── docker-compose.yml    # 프로덕션 Docker
```

---

## 추가 문서

- [Riot Setup](./RIOT_SETUP.md) - Riot API 상세 설정
