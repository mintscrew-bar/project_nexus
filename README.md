# Project Nexus

LoL 내전 토너먼트 플랫폼 - 경매 드래프트 시스템

## Tech Stack

- **Frontend**: Next.js 14, React 18, TailwindCSS, Zustand
- **Backend**: NestJS, Socket.io, Prisma
- **Database**: PostgreSQL, Redis
- **Infrastructure**: Docker, Cloudflare Tunnel

## Project Structure

```
nexus/
├── apps/
│   ├── api/          # NestJS API 서버
│   └── web/          # Next.js 웹 앱
├── packages/
│   ├── database/     # Prisma 스키마 & 클라이언트
│   └── types/        # 공유 TypeScript 타입
├── scripts/          # 배포 스크립트
└── docker-compose.yml
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker & Docker Compose

### Development Setup

```bash
# 1. 의존성 설치
pnpm install

# 2. 환경 변수 설정
cp .env.example .env
# .env 파일 수정

# 3. 개발용 DB 시작
docker compose -f docker-compose.dev.yml up -d

# 4. Prisma 클라이언트 생성 & 마이그레이션
pnpm db:generate
pnpm db:push

# 5. 개발 서버 시작
pnpm dev
```

### Production Deployment

```bash
# 서버에서
./scripts/deploy.sh
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL 연결 URL |
| `REDIS_URL` | Redis 연결 URL |
| `JWT_ACCESS_SECRET` | JWT Access Token 시크릿 |
| `JWT_REFRESH_SECRET` | JWT Refresh Token 시크릿 |
| `DISCORD_CLIENT_ID` | Discord OAuth 클라이언트 ID |
| `DISCORD_CLIENT_SECRET` | Discord OAuth 시크릿 |
| `DISCORD_BOT_TOKEN` | Discord 봇 토큰 |
| `RIOT_API_KEY` | Riot API 키 |

## API Endpoints

- `GET /api/health` - 헬스 체크
- `GET /api/auth/discord` - Discord OAuth 시작
- `POST /api/auth/refresh` - 토큰 갱신
- `GET /api/users/me` - 내 프로필
- `POST /api/riot/verify/start` - Riot 계정 인증 시작
- `POST /api/auctions` - 경매 생성
- `POST /api/auctions/:id/join` - 경매 참가

## WebSocket Events

### Client → Server
- `join-auction` - 경매 룸 참가
- `place-bid` - 입찰

### Server → Client
- `auction-state` - 경매 상태 업데이트
- `new-bid` - 새 입찰 알림

## License

Private - All rights reserved
