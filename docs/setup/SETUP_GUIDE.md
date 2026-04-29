# Project Nexus - 개발 환경 설정

## 사전 요구사항

| 도구                    | 버전                           |
| ----------------------- | ------------------------------ |
| Node.js                 | 20 이상                        |
| pnpm                    | 8 이상 (`npm install -g pnpm`) |
| Docker & Docker Compose | PostgreSQL + Redis 실행용      |

### 필요한 외부 계정

- **Discord Developer Portal**: OAuth2 클라이언트 + Bot 토큰
- **Riot Games Developer Portal**: API 키

> Google OAuth는 현재 운영에서 사용하지 않는다. Discord 단일 OAuth만 활성화되어 있다.

---

## 빠른 시작

### 1. 저장소 클론 및 의존성 설치

```bash
git clone <repository-url>
cd project_nexus
pnpm install
```

### 2. 환경 변수 설정

루트에 `.env` 파일을 만들고 아래 값을 채운다:

```env
# JWT
JWT_ACCESS_SECRET=<openssl rand -base64 32>
JWT_REFRESH_SECRET=<openssl rand -base64 32>

# Discord OAuth + Bot
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_CALLBACK_URL=http://localhost:4000/api/auth/discord/callback
DISCORD_LINK_CALLBACK_URL=http://localhost:4000/api/auth/discord/link/callback
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=

# Riot
RIOT_API_KEY=
RIOT_MATCH_RATE_LIMIT_MAX=70
RIOT_MATCH_RATE_LIMIT_WINDOW_SECONDS=120
RIOT_MATCH_REQUEST_DELAY_MS=1350
RIOT_MATCH_BACKGROUND_RATE_LIMIT_MAX=15
RIOT_MATCH_BACKGROUND_REQUEST_DELAY_MS=8000
MATCH_FETCH_RANKED_LIMIT=5
MATCH_FETCH_NORMAL_LIMIT=3
MATCH_FETCH_ARAM_LIMIT=2
MATCH_FETCH_CUSTOM_LIMIT=1
MATCH_FETCH_RANKED_SEEDED_SLOT_CAP=2
MATCH_FETCH_RANKED_SEEDED_INITIAL_BACKFILL_LIMIT=25

# DB / Redis (Docker 기본값 그대로 두면 됨)
DATABASE_URL=postgresql://nexus:nexus_password@localhost:5432/nexus?schema=public
REDIS_URL=redis://localhost:6379

# Next.js (개발)
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<openssl rand -base64 32>
NEXT_PUBLIC_API_URL=http://localhost:4000
APP_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000
```

### 3. 인프라 시작 (PostgreSQL + Redis)

```bash
docker compose -f docker-compose.dev.yml up -d
```

### 4. Prisma 클라이언트 생성 및 DB 반영

```bash
pnpm db:generate   # Prisma 클라이언트 생성 (Prisma 6.x)
pnpm db:push       # 스키마를 DB에 반영
```

> **운영 배포 시**: `db:push` 대신 `prisma migrate deploy`를 사용한다.

### 5. 개발 서버 실행

```bash
pnpm dev
```

- API: http://localhost:4000
- Web: http://localhost:3000
- Prisma Studio: `pnpm db:studio` → http://localhost:5555

---

## Discord 설정

1. [Discord Developer Portal](https://discord.com/developers/applications) → New Application
2. **OAuth2** 탭 Redirect URI 두 개 추가:
   - `http://localhost:4000/api/auth/discord/callback`
   - `http://localhost:4000/api/auth/discord/link/callback`
   - Scopes: `identify`, `email`
3. **Bot** 탭에서 봇 생성 → 토큰 복사 → `DISCORD_BOT_TOKEN`
4. Bot Permissions: `Manage Channels`, `Move Members`, `View Channels`

Discord 봇 자격 증명이 없거나 잘못된 경우 다음 경고와 함께 서버는 정상 동작한다:

```
Discord bot not properly configured, skipping bot initialization
```

---

## Riot API 설정

1. [Riot Developer Portal](https://developer.riotgames.com) → Development Key 발급 (24시간 유효)
2. 베타/운영 단계에서는 Production Key 신청이 필요하다.
3. 상세 설정은 [RIOT_SETUP.md](./RIOT_SETUP.md) 참조.

---

## 개발 명령어

```bash
pnpm dev              # API + Web 동시 실행 (Turborepo)
pnpm build            # 전체 빌드
pnpm lint             # 전체 lint
pnpm test             # 전체 테스트
pnpm db:generate      # Prisma 클라이언트 재생성
pnpm db:push          # 스키마를 DB에 반영
pnpm db:studio        # DB GUI (:5555)
pnpm compose:up       # docker compose up --build
pnpm compose:down     # docker compose down
```

---

## 문제 해결

### "Port already in use"

```bash
# macOS/Linux
lsof -ti:4000 | xargs kill -9
lsof -ti:3000 | xargs kill -9
```

### Prisma 타입 오류

```bash
pnpm db:generate
```

### WebSocket 연결 실패

- `.env`의 `CORS_ORIGINS`에 프론트엔드 URL이 포함돼 있는지 확인한다.

### Discord OAuth 401

- Developer Portal에서 Redirect URI가 콜백 URL과 정확히 일치하는지 확인한다. `/api` prefix 포함 필수.

### `.next` 빌드 권한 오류

```bash
sudo rm -rf apps/web/.next
pnpm --filter @nexus/web build
```

---

## 프로젝트 구조

```
project_nexus/
├─ apps/
│   ├─ api/         NestJS 백엔드 (:4000, prefix /api)
│   └─ web/         Next.js 14 프론트엔드 (:3000)
├─ packages/
│   ├─ database/    @nexus/database — Prisma 스키마 + 클라이언트
│   └─ types/       @nexus/types — 공유 TypeScript 타입
├─ docs/            문서
├─ nginx/           nginx.conf
├─ scripts/         서버 셋업 스크립트
├─ .env             환경변수 (git 미추적)
├─ docker-compose.dev.yml   개발용 (PostgreSQL + Redis)
└─ docker-compose.yml       프로덕션용 (전체 스택)
```

---

## 추가 문서

- [API_REFERENCE.md](../technical/API_REFERENCE.md) — REST 엔드포인트 명세
- [WEBSOCKET_EVENTS.md](../technical/WEBSOCKET_EVENTS.md) — WebSocket 이벤트 명세
- [BETA_PUBLIC_TEST_PLAN.md](../status/BETA_PUBLIC_TEST_PLAN.md) — 베타 배포 체크리스트
- [RIOT_SETUP.md](./RIOT_SETUP.md) — Riot API 상세 설정
