# Project Nexus: LoL In-House Tournament Platform

## Project Overview

This is a monorepo for "Project Nexus," a web application for hosting and participating in League of Legends in-house tournaments. The platform features a real-time auction draft system.

The project is structured as a `pnpm` workspace monorepo managed by `turborepo`.

- **`apps/api`**: A [NestJS](https://nestjs.com/) backend that serves the main API and handles real-time communication via WebSockets ([Socket.io](https://socket.io/)). It manages all business logic, including user authentication, game rooms, auction drafts, and integration with the Riot Games API.
- **`apps/web`**: A [Next.js](https://nextjs.org/) 14 frontend application that provides the user interface for the platform. It uses [Tailwind CSS](https://tailwindcss.com/) for styling and [Zustand](https://github.com/pmndrs/zustand) for state management.
- **`packages/database`**: A shared package containing the [Prisma](https://www.prisma.io/) schema and generated client for interacting with the PostgreSQL database. This ensures data consistency between different parts of the application.
- **`packages/types`**: A shared package for TypeScript types and interfaces used across both the frontend and backend.

## Building and Running

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- Docker and Docker Compose

### Development Workflow

1.  **Install dependencies** from the root of the project:
    ```bash
    pnpm install
    ```

2.  **Set up environment variables**. Copy the example file and fill in the required values:
    ```bash
    cp .env.example .env
    ```

3.  **Start the development database** using Docker Compose:
    ```bash
    docker compose -f docker-compose.dev.yml up -d
    ```

4.  **Apply database schema changes and generate the Prisma client**:
    ```bash
    pnpm db:push
    pnpm db:generate
    ```

5.  **Run all development servers** (API and Web) concurrently:
    ```bash
    pnpm dev
    ```
    - The Next.js web app will be available at `http://localhost:3000`.
    - The NestJS API server will be available at `http://localhost:4000`.

### Other Key Commands

- **Build all apps and packages**:
  ```bash
  pnpm build
  ```
- **Run linters**:
  ```bash
  pnpm lint
  ```
- **Access the database studio**:
  ```bash
  pnpm db:studio
  ```

## Development Conventions

- **Monorepo Management**: The project uses `turborepo` to orchestrate build, development, and testing tasks across the workspaces. Task configurations can be found in `turbo.json`.
- **Package Management**: `pnpm` is used for managing dependencies. All workspaces are defined in `pnpm-workspace.yaml`.
- **Database**: Database schema is managed via Prisma migrations. The schema file at `packages/database/prisma/schema.prisma` is the single source of truth for the data model.
- **API**: The backend follows the modular structure of NestJS. New features should be organized into their own modules (e.g., `apps/api/src/modules/new-feature`).
- **Real-time Communication**: WebSockets are used for real-time features like the auction draft. Events are handled in the `apps/api/src/modules/auction/auction.gateway.ts` and corresponding modules.
