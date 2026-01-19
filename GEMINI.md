# GEMINI Project Context: Nexus

This document provides a comprehensive overview of the **Nexus** project, a full-stack monorepo application, to be used as instructional context for a generative AI assistant.

## 1. Project Overview

**Nexus** is a web platform for hosting custom "League of Legends" tournaments, featuring an auction draft system. Players can sign up, verify their Riot Games account, and participate in auctions where team captains bid on players to form teams.

The project is structured as a **Turborepo monorepo** using **pnpm workspaces**.

### Key Technologies:

-   **Monorepo:** Turborepo, pnpm
-   **Frontend (`apps/web`):** Next.js, React, Tailwind CSS, Zustand
-   **Backend (`apps/api`):** NestJS, Socket.io, Prisma
-   **Database (`packages/database`):** PostgreSQL (managed with Prisma), Redis
-   **Language:** TypeScript
-   **Infrastructure:** Docker for development and production environments.

### Architecture:

-   `apps/api`: The NestJS backend server. It handles business logic, database interactions via Prisma, user authentication (Discord OAuth), real-time communication for auctions (Socket.io), and integration with the Riot Games API.
-   `apps/web`: The Next.js frontend application. It provides the user interface for browsing tournaments, participating in auctions, and viewing match results.
-   `packages/database`: Contains the Prisma schema (`schema.prisma`) which defines the entire data model, including users, riot accounts, auctions, teams, and matches. It also contains the generated Prisma client.
-   `packages/types`: A shared package for TypeScript types and interfaces used across both the frontend and backend.

## 2. Building and Running the Project

The project relies on `pnpm` as the package manager and `turbo` as the monorepo task runner.

### Initial Setup

1.  **Install Dependencies:**
    ```bash
    pnpm install
    ```
2.  **Setup Environment Variables:**
    Copy `.env.example` to a new `.env` file and fill in the required values (database URLs, API keys, etc.).
    ```bash
    cp .env.example .env
    ```
3.  **Start Development Database:**
    Requires Docker Desktop to be running.
    ```bash
    docker compose -f docker-compose.dev.yml up -d
    ```
4.  **Prepare Database:**
    Generate the Prisma client and push the schema to the development database.
    ```bash
    pnpm db:generate
    pnpm db:push
    ```

### Core Development Commands

-   **Run all apps in development mode:**
    (Starts frontend on `localhost:3000`, backend on `localhost:4000`)
    ```bash
    pnpm dev
    ```
-   **Build all apps for production:**
    ```bash
    pnpm build
    ```
-   **Run linters across the monorepo:**
    ```bash
    pnpm lint
    ```

### Database Management

-   **Generate Prisma Client:** (Run after changes to `schema.prisma`)
    ```bash
    pnpm db:generate
    ```
-   **Apply schema to dev DB:** (Non-destructive)
    ```bash
    pnpm db:push
    ```
-   **Open Prisma Studio:** (A GUI for the database)
    ```bash
    pnpm db:studio
    ```

## 3. Development Conventions

-   **Monorepo Structure:** Code is organized into `apps` and `packages`. Reusable code (like database clients or shared types) should be in `packages`.
-   **Package Manager:** `pnpm` is strictly used. Lockfiles should be committed.
-   **Task Runner:** All scripts (`dev`, `build`, `lint`) should be run from the root of the project using `turbo` (e.g., `pnpm dev` not `pnpm --filter @nexus/web dev` unless you explicitly want to run only one app).
-   **Code Style:** The project uses Prettier for code formatting and ESLint for linting. Use `pnpm format` to format code.
-   **Database Migrations:** For development, `pnpm db:push` is acceptable. For production or schema changes that require data migration, a new migration file should be created with `pnpm db:migrate`.
-   **Environment Variables:** All secrets and environment-specific configurations are managed in a `.env` file at the project root. This file is not committed to git.
