# Project Nexus - Setup Guide

## 📋 사전 요구사항

### 필수 소프트웨어
- **Node.js**: v20 이상
- **npm**: v10 이상
- **PostgreSQL**: v14 이상
- **Git**

### 필수 계정
- **Discord Developer Portal**: Bot 토큰 및 OAuth2
- **Google Cloud Console**: OAuth2 인증
- **Riot Games Developer Portal**: API 키

---

## 🚀 빠른 시작

### 1. 저장소 클론 및 의존성 설치

```bash
git clone <repository-url>
cd nexus
npm install
```

### 2. 환경 변수 설정

루트 디렉토리에 `.env` 파일 생성:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/nexus"

# JWT Secrets (openssl rand -base64 32 로 생성)
JWT_ACCESS_SECRET="your-access-secret-here"
JWT_REFRESH_SECRET="your-refresh-secret-here"

# Server
PORT=4000
NODE_ENV=development
APP_URL="http://localhost:3000"
CORS_ORIGINS="http://localhost:3000,http://localhost:4000"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_CALLBACK_URL="http://localhost:4000/api/auth/google/callback"

# Discord OAuth
DISCORD_CLIENT_ID="your-discord-client-id"
DISCORD_CLIENT_SECRET="your-discord-client-secret"
DISCORD_CALLBACK_URL="http://localhost:4000/api/auth/discord/callback"

# Discord Bot
DISCORD_BOT_TOKEN="your-discord-bot-token"
DISCORD_GUILD_ID="your-discord-server-id"

# Riot API
RIOT_API_KEY="your-riot-api-key"
RIOT_REGION="kr"
```

### 3. 데이터베이스 설정

```bash
# PostgreSQL 데이터베이스 생성
createdb nexus

# Prisma 마이그레이션 실행
cd packages/database
npx prisma migrate dev
npx prisma generate
```

### 4. 개발 서버 실행

터미널 1 - 백엔드:
```bash
cd apps/api
npm run dev
# 실행: http://localhost:4000
```

터미널 2 - 프론트엔드:
```bash
cd apps/web
npm run dev
# 실행: http://localhost:3000
```

---

## 🔑 외부 서비스 설정

### Discord Bot 설정

1. [Discord Developer Portal](https://discord.com/developers/applications) 접속
2. "New Application" 클릭
3. Bot 탭에서 봇 생성 및 토큰 복사
4. OAuth2 탭에서:
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
2. 로그인 후 "Register Product" (프로덕션용)
3. Development Key 발급 (개발용, 24시간 유효)
4. API Rate Limits:
   - Development: 20 requests/second, 100 requests/2 minutes
   - Production: Application 승인 필요

---

## 🗄️ 데이터베이스 스키마 업데이트

현재 백엔드 코드는 완성되었지만 Prisma 스키마 업데이트가 필요합니다.

자세한 내용은 [`SCHEMA_UPDATES_NEEDED.md`](./SCHEMA_UPDATES_NEEDED.md) 참조

빠른 수정: [`QUICK_FIX_GUIDE.md`](./QUICK_FIX_GUIDE.md) 참조

---

## 📦 프로젝트 구조

```
nexus/
├── apps/
│   ├── api/              # NestJS 백엔드
│   │   ├── src/
│   │   │   ├── modules/  # 11개 주요 모듈
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   └── package.json
│   └── web/              # Next.js 프론트엔드
│       ├── src/
│       │   ├── app/      # Next.js 14 App Router
│       │   ├── components/
│       │   ├── stores/   # Zustand 상태 관리
│       │   ├── hooks/    # React hooks
│       │   └── lib/      # API/Socket clients
│       └── package.json
├── packages/
│   └── database/         # Prisma 스키마
│       └── prisma/
│           └── schema.prisma
└── docs/                 # 문서
```

---

## 🧪 개발 도구

### Prisma Studio (데이터베이스 GUI)
```bash
cd packages/database
npx prisma studio
# http://localhost:5555
```

### API 테스트
- Postman Collection (준비 중)
- API 문서: [`API_REFERENCE.md`](./API_REFERENCE.md)

---

## 🐛 문제 해결

### "Port already in use" 오류
```bash
# 포트 사용 중인 프로세스 종료
# Windows
netstat -ano | findstr :4000
taskkill /PID <PID> /F

# macOS/Linux
lsof -ti:4000 | xargs kill -9
```

### Prisma 타입 오류
```bash
cd packages/database
npx prisma generate
```

### WebSocket 연결 실패
- CORS 설정 확인 (`.env`의 `CORS_ORIGINS`)
- 방화벽 설정 확인

---

## 📚 추가 문서

- [API Reference](./API_REFERENCE.md) - 전체 API 엔드포인트
- [Implementation Status](./IMPLEMENTATION_STATUS.md) - 프로젝트 현황
- [Schema Updates Needed](./SCHEMA_UPDATES_NEEDED.md) - DB 스키마 변경사항
- [Quick Fix Guide](./QUICK_FIX_GUIDE.md) - 즉시 해결 방법
- [Riot Setup](./RIOT_SETUP.md) - Riot API 상세 설정

---

## 🎯 다음 단계

1. ✅ 개발 환경 설정
2. ✅ 백엔드 서버 실행
3. ✅ 프론트엔드 서버 실행
4. ⏳ 스키마 업데이트 (필수)
5. ⏳ 컴포넌트 개발
6. ⏳ 통합 테스트
