# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Package manager: pnpm (v8+), Node >= 20
pnpm dev              # 개발 서버 켜기 — 포트 3010 고정, 메모리 상한 적용
pnpm dev:stop         # 끄기
pnpm dev:status       # 켜짐/꺼짐, PID, 메모리, 포트 점유 확인
pnpm dev:logs         # 로그 (journalctl)
pnpm build            # Build all workspaces
pnpm lint             # Lint all workspaces
pnpm test             # Run all tests (Jest)
pnpm format           # Prettier format entire project
pnpm clean            # Clean all build outputs + node_modules

# Database (PostgreSQL via Prisma)
pnpm db:generate      # Generate Prisma client after schema changes
pnpm db:push          # Push schema to DB (preferred over migrate dev)
pnpm db:studio        # Open Prisma Studio GUI on :5555

# Per-app commands
cd apps/api && pnpm test      # Jest tests for API

# Infrastructure (Docker)
docker compose -f docker-compose.dev.yml up -d   # Start PostgreSQL + Redis
```

**Dev startup sequence**: Docker (postgres+redis) → `pnpm db:generate` → `pnpm db:push` → `pnpm dev`

### ⚠ 개발 서버는 포트 하나만 쓴다

`pnpm dev`는 `scripts/dev-server.sh`를 통해 **3010 한 포트**로만 뜬다. 포트를 추가하지 않는다.

- 이 호스트는 운영 상주 서버다. dev 인스턴스가 늘어난 만큼 메모리를 먹고,
  그게 2026-09-16·09-20 두 번 WSL VM을 얼려 사이트를 Cloudflare 1033으로 내렸다.
- 유닛도 포트도 하나라 중복 기동이 구조적으로 막힌다. 띄우기 전 `pnpm dev:status`로 확인한다.
- `cd apps/web && pnpm dev` 같은 직접 실행은 **메모리 상한을 우회한다.** 쓰지 마라.
  일회성으로 다른 명령을 돌려야 하면 `scripts/dev-capped.sh <명령>`으로 감싼다.
- 상세: `docs/setup/OPERATIONS_RECOVERY.md`의 "Local dev is not covered" 항목

## Project Architecture

Turborepo monorepo with pnpm workspaces:

```
apps/
  api/          → NestJS backend (REST + WebSocket), port 4000, prefix /api
  web/          → Next.js 14 App Router frontend, port 3000
packages/
  database/     → @nexus/database — Prisma schema + client (schema at prisma/schema.prisma)
  types/        → @nexus/types — Shared TypeScript types (ApiResponse, User, Auction, WS events)
```

### Backend (apps/api)

NestJS modules in `apps/api/src/modules/`, each following the pattern:

- `*.module.ts` — DI registration
- `*.controller.ts` — HTTP endpoints
- `*.service.ts` — Business logic
- `*.gateway.ts` — Socket.IO WebSocket handler (where applicable)

**Key modules**: auth, user, room, auction, snake-draft, role-selection, match, clan, community, dm, friend, notification, presence, reputation, admin, riot, discord, tasks, stats, upload

**Path alias**: `@/*` → `./src/*`

**Global config**: ValidationPipe (whitelist + transform), GlobalExceptionFilter, Helmet, rate limiting (100 req/min)

### Frontend (apps/web)

- **Routing**: Next.js App Router under `src/app/(root)/`
- **State**: Zustand stores in `src/stores/` (15+ stores: auth, room, auction, match, clan, dm, friend, notification, presence, etc.)
- **Data fetching**: TanStack React Query v5
- **API client**: `src/lib/api-client.ts`
- **Socket client**: `src/lib/socket-client.ts`
- **Path alias**: `@/*` → `./src/*`
- **UI**: TailwindCSS + Radix UI + Framer Motion

### Real-time (Socket.IO)

8 namespace-separated gateways, each with JWT auth:

| Namespace         | Gateway file              | Purpose                       |
| ----------------- | ------------------------- | ----------------------------- |
| `/room`           | room.gateway.ts           | Room chat, join/leave, typing |
| `/auction`        | auction.gateway.ts        | Live bidding, timer, auto-bid |
| `/match`          | match.gateway.ts          | Match events, results         |
| `/role-selection` | role-selection.gateway.ts | Post-auction role assignment  |
| `/clan`           | clan.gateway.ts           | Clan chat                     |
| `/dm`             | dm.gateway.ts             | Direct messages               |
| `/notification`   | notification.gateway.ts   | Real-time alerts              |
| `/presence`       | presence.gateway.ts       | Online status                 |

Client connects per-namespace via `connect*Socket()` functions in `socket-client.ts`. Transport: WebSocket only (no polling fallback). Auth: callback-based token passing.

### Database Design Conventions

- **Soft references**: `ChatMessage.roomId` is nullable with `roomName` snapshot — preserves chat logs after room deletion
- **onDelete: SetNull** preferred over Cascade to preserve historical data
- **DirectMessage**: nullable sender/receiver IDs with username snapshots
- Use `pnpm db:push` (not `prisma migrate dev`) for schema updates

## Language

The project targets Korean users. UI text, commit messages, and communication are in Korean.

## Claude Code 작업 규칙

- **작업 단위 커밋**: 작업 하나가 완료될 때마다 커밋한다.
- **한글 주석**: 코드 주석은 한글로 꼼꼼하게 작성한다.
- **선택지 발생 시 질문**: 구현 방향에 여러 선택지가 있을 경우 임의로 결정하지 않고 반드시 사용자에게 먼저 물어본다.
- **docs TODO 양식**: `.md` 파일에 TODO 항목 작성 시 반드시 아래 형식을 사용한다. 완료 시 `[x]`로 변경한다. 제목 헤더(`###`)만 쓰거나 `#### [ ]` 형태는 사용하지 않는다.
  ```
  - [ ] Task 11: 클랜 상세 페이지 탭 구조
  - [x] Task 10: 클랜 브라우저 카드 리디자인
  ```
- **TODO 완료 표시**: Task 작업 완료 후 반드시 해당 docs TODO 파일의 항목을 `[x]`로 업데이트하고 커밋한다.
