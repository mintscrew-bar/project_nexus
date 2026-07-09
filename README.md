# Project Nexus

LoL 내전 토너먼트 플랫폼 — 경매 드래프트부터 대진 운영, OBS 방송 송출까지 한 곳에서.

## Tech Stack

- **Monorepo**: Turborepo + pnpm workspaces
- **Frontend**: Next.js 14 (App Router), React 18, TailwindCSS, Zustand, TanStack Query
- **Backend**: NestJS, Socket.IO, Prisma
- **Database**: PostgreSQL, Redis
- **Infrastructure**: Docker, Cloudflare Tunnel

## Features

### 🎯 Auction & Draft
- 실시간 **경매 드래프트**(입찰·자동입찰·타이머·유찰 처리)와 **스네이크 드래프트**
- 팀장 선정, 봇 참가 시뮬레이션, 세션 중단/리셋

### 🏆 Tournament & Match
- **대진표**(싱글·더블 엘리미네이션), 팀장 **가위바위보 진영 선택**
- 경매 이후 **역할(포지션) 선택** 단계

### 🎥 Broadcast Overlay (OBS)
- 호스트별 방송 링크로 OBS 브라우저 소스 송출
- 씬 자동 전환(대기 → 경매 → 역할선택 → 드래프트 → 대진표 → 경기 중계)
- 라이브 경매 중계, 플레이오프 대진 보드, 경기 중계 오버레이

### 🛡️ Clans & 📺 Streamers
- 클랜 **정체성**(엠블럼·배너·대표색) 및 **모집**(포지션·최소 티어) 기능
- 스트리머 **다중 플랫폼** 프로필과 커스텀 링크

### 🧑 Profiles & Stats
- 공개 프로필(`/users/:id`), Riot 계정 연동, 내전+랭크 통합 지표
- 선호 라인·챔피언 통계, 공개 범위(privacy) 설정

### 💬 Community & DM
- 마크다운 게시판, 댓글·좋아요·북마크, 신고 기반 모더레이션
- 실시간 다이렉트 메시지

### 🔗 Discord Integration
- 방 생성 시 팀별 음성 채널 자동 생성, 내전 모집 알림
- 서버(길드) 연동 자동 승인 + 관리자 취소 관리

### 🛠️ Admin
- 유저 관리(상태/접속 필터·제재·밴), 신고 처리, 매치 수집 큐 모니터링

## Project Structure

```
nexus/
├── apps/
│   ├── api/          # NestJS API 서버 (REST + WebSocket)
│   └── web/          # Next.js 웹 앱
├── packages/
│   ├── database/     # Prisma 스키마 & 클라이언트
│   └── types/        # 공유 TypeScript 타입
├── scripts/          # 배포 스크립트
└── docker-compose.yml
```

## Documentation

상세한 설계 및 개발 가이드는 **[docs/README.md](./docs/README.md)** 를 참조하세요.

- **[Setup & Guides](./docs/setup/)**: 개발 환경 설정, Riot API 연동, 배포 가이드
- **[Technical Specs](./docs/technical/)**: DB 스키마, API/WebSocket 명세

### Production Deployment

운영 배포는 `docker-compose.prod.yml`을 사용합니다. API 컨테이너는 시작 전에
`prisma migrate deploy`만 실행하며(운영 DB에 `prisma db push` 미사용), 자세한 절차는
**[docs/setup/DEPLOYMENT.md](./docs/setup/DEPLOYMENT.md)** 를 참고하세요.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL 연결 URL |
| `REDIS_URL` | Redis 연결 URL |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | JWT 토큰 시크릿 |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | Discord OAuth |
| `DISCORD_BOT_TOKEN` | Discord 봇 토큰 |
| `DISCORD_GUILD_ID` | 홈 Discord 서버(길드) ID |
| `DISCORD_NOTIFICATION_CHANNEL_ID` | 내전 모집 알림 채널 ID |
| `RIOT_API_KEY` | Riot API 키 |
| `APP_URL` | 웹 앱 공개 URL |
| `NEXT_PUBLIC_API_URL` | 프론트에서 사용하는 API URL |

> 광고/분석(AdSense·GA) 등 선택 키는 `.env.example`을 참고하세요.

## License

Private — All rights reserved
