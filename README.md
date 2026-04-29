# Project Nexus

LoL 내전 토너먼트 플랫폼 - 경매 드래프트 시스템

## Tech Stack

- **Frontend**: Next.js 14, React 18, TailwindCSS, Zustand
- **Backend**: NestJS, Socket.io, Prisma
- **Database**: PostgreSQL, Redis
- **Infrastructure**: Docker, Cloudflare Tunnel

## Features

### 🚀 Auction & Draft Simulation
- **Bot Participation**: Implemented automated bot participation in auctions and drafts to simulate a full lobby experience and enable robust testing.
- **Advanced Timers & Auto-Bidding**: The auction system now includes sophisticated timers, automatic bid resolution, and an auto-bid mechanism for bots.
- **Session Management**: Added a crucial "Abort Session" feature, allowing hosts to reset an active game session (draft, auction, bracket) back to the lobby state.

### 💬 Community & Social Features
- **Rich Content Editor**: Replaced plain text areas with a new Markdown editor for creating and editing community posts.
- **Interactive Comments**: Users can now reply to and like individual comments, fostering more engaging discussions.
- **Post Bookmarking**: A bookmarking system has been added for users to save and revisit posts.
- **Content Reporting**: Implemented a reporting system for both posts and comments to help moderate the community.
- **Enhanced Sorting**: Added new sorting options for post lists, including by popularity (likes), views, and comment count.

### 🧑‍🤝‍🧑 User Profiles & Settings
- **Public Profiles**: All users now have a public profile page accessible via `/users/:id`.
- **Profile Customization**: Users can set a "highlight champion" to feature on their profile and new privacy settings to control the visibility of their Riot accounts, champion stats, and match history.
- **Detailed Stats**: Profiles now display more detailed information, including preferred champions by role, most-played champions, and clan affiliations.

### ✉️ Direct Messaging (DM) System
- **Enhanced Reliability**: The DM system has been upgraded with Redis caching for unread message counts and more robust handling of user connection status, ensuring a more reliable real-time chat experience.

### 🛠️ Admin & Testing Tools
- **Bot Management**: Administrators now have endpoints to easily add test bots to rooms, streamlining the testing process for game modes.

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

## Documentation

상세한 프로젝트 설계 및 개발 가이드는 **[docs/README.md](./docs/README.md)**를 참조하세요.

- **[Setup & Guides](./docs/setup/)**: 개발 환경 설정, Riot API 연동, 배포 가이드
- **[Technical Specs](./docs/technical/)**: DB 스키마 분석, API/WebSocket 명세
- **[Status & Issues](./docs/status/)**: 현재 개발 현황 및 알려진 이슈
- **[Security](./docs/security/)**: 보안 보고서 및 개선 작업

### Production Deployment

```bash
cp .env.production.example .env.production
pnpm compose:prod:config
pnpm compose:prod:up
```

운영 배포는 `docker-compose.prod.yml`을 사용합니다. API 컨테이너는 시작 전에 `prisma migrate deploy`만 실행하며, 운영 DB에는 `prisma db push`를 사용하지 않습니다. 자세한 절차는 **[docs/setup/DEPLOYMENT.md](./docs/setup/DEPLOYMENT.md)**를 참고하세요.

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
