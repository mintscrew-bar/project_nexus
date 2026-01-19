# 환경변수 설정 가이드

프로젝트 루트에 `.env` 파일을 생성하고 다음 환경변수들을 설정해주세요.

## 백엔드 (nexus/apps/api/.env)

```env
# ============================================
# Application
# ============================================
NODE_ENV=development
APP_URL=http://localhost:3000
API_URL=http://localhost:4000

# ============================================
# Database
# ============================================
DATABASE_URL=postgresql://nexus:nexus_password@localhost:5432/nexus

# ============================================
# Redis
# ============================================
REDIS_URL=redis://localhost:6379

# ============================================
# Discord OAuth2
# ============================================
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_CALLBACK_URL=http://localhost:4000/api/auth/discord/callback
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_GUILD_ID=your_discord_guild_id

# ============================================
# JWT
# ============================================
JWT_ACCESS_SECRET=your_jwt_access_secret_change_in_production
JWT_REFRESH_SECRET=your_jwt_refresh_secret_change_in_production
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# ============================================
# Riot Games API
# ============================================
RIOT_API_KEY=your_riot_api_key

# ============================================
# Riot Tournament API (Tournament-Stub-V5)
# ============================================
# 개발자용 Tournament API 사용 시 필요합니다.
# 
# ⚠️ 중요: Provider ID와 Tournament ID는 수동으로 생성해야 합니다!
#
# 📖 상세 가이드: RIOT_TOURNAMENT_SETUP.md 참고
#
# 간단 요약:
# 1. https://developer.riotgames.com/apis#tournament-stub-v5 접속
# 2. POST /lol/tournament-stub/v5/providers 실행 → Provider ID 획득
# 3. POST /lol/tournament-stub/v5/tournaments 실행 → Tournament ID 획득
# 4. 아래 환경변수에 ID 입력
#
RIOT_TOURNAMENT_PROVIDER_ID=
RIOT_TOURNAMENT_ID=

# ============================================
# CORS
# ============================================
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

## 프론트엔드 (nexus/apps/web/.env.local)

```env
# ============================================
# API Configuration
# ============================================
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=ws://localhost:4000
NEXT_PUBLIC_DDRAGON_VERSION=14.1.1
```

## 환경변수 설명

### 필수 설정

1. **DATABASE_URL**: PostgreSQL 연결 문자열
   - 개발 환경: `postgresql://nexus:nexus_password@localhost:5432/nexus`
   - Docker Compose를 사용하는 경우 위 값 사용

2. **REDIS_URL**: Redis 연결 문자열
   - 개발 환경: `redis://localhost:6379`

3. **DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET**
   - Discord Developer Portal에서 생성
   - https://discord.com/developers/applications

4. **JWT_ACCESS_SECRET / JWT_REFRESH_SECRET**
   - 강력한 랜덤 문자열 사용 권장
   - 프로덕션에서는 반드시 변경 필요

### 선택 설정

- **RIOT_API_KEY**: Riot Games API 키 (개인 키 또는 프로덕션 키)
- **RIOT_TOURNAMENT_PROVIDER_ID / RIOT_TOURNAMENT_ID**: Tournament Code 생성 시 필요

## 설정 방법

1. Discord OAuth2 설정:
   - Discord Developer Portal 접속
   - 새 애플리케이션 생성
   - OAuth2 섹션에서 Redirect URL 추가: `http://localhost:4000/api/auth/discord/callback`
   - Client ID와 Client Secret 복사

2. JWT Secret 생성:
   ```bash
   # Node.js로 랜덤 문자열 생성
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. Riot API 키 발급:
   - https://developer.riotgames.com/ 접속
   - 계정 생성 후 API 키 발급

## 보안 주의사항

- `.env` 파일은 절대 Git에 커밋하지 마세요
- 프로덕션 환경에서는 강력한 비밀번호와 JWT Secret 사용
- 환경변수는 서버에서만 접근 가능하도록 관리
