# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Package manager: pnpm (v8+), Node >= 20
pnpm dev              # Run all apps (API + Web) in watch mode via Turborepo
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
cd apps/api && pnpm dev       # NestJS watch mode on :4000
cd apps/api && pnpm test      # Jest tests for API
cd apps/web && pnpm dev       # Next.js dev on :3000

# Infrastructure (Docker)
docker compose -f docker-compose.dev.yml up -d   # Start PostgreSQL + Redis
```

**Dev startup sequence**: Docker (postgres+redis) → `pnpm db:generate` → `pnpm db:push` → `pnpm dev`

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

| Namespace | Gateway file | Purpose |
|-----------|-------------|---------|
| `/room` | room.gateway.ts | Room chat, join/leave, typing |
| `/auction` | auction.gateway.ts | Live bidding, timer, auto-bid |
| `/match` | match.gateway.ts | Match events, results |
| `/role-selection` | role-selection.gateway.ts | Post-auction role assignment |
| `/clan` | clan.gateway.ts | Clan chat |
| `/dm` | dm.gateway.ts | Direct messages |
| `/notification` | notification.gateway.ts | Real-time alerts |
| `/presence` | presence.gateway.ts | Online status |

Client connects per-namespace via `connect*Socket()` functions in `socket-client.ts`. Transport: WebSocket only (no polling fallback). Auth: callback-based token passing.

### Database Design Conventions

- **Soft references**: `ChatMessage.roomId` is nullable with `roomName` snapshot — preserves chat logs after room deletion
- **onDelete: SetNull** preferred over Cascade to preserve historical data
- **DirectMessage**: nullable sender/receiver IDs with username snapshots
- Use `pnpm db:push` (not `prisma migrate dev`) for schema updates

## Language

The project targets Korean users. UI text, commit messages, and communication are in Korean.
