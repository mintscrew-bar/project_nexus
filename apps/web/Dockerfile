# Build stage
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/

# Install dependencies
RUN echo "node-linker=hoisted" > .npmrc && pnpm install --frozen-lockfile

# Copy source code
COPY apps/web ./apps/web
COPY packages/types ./packages/types

# Build
ENV NEXT_TELEMETRY_DISABLED=1
# Next.js는 빌드 타임에 NEXT_PUBLIC_* 환경변수를 인라인하므로 ARG로 전달
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN pnpm --filter @nexus/web build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# node_modules 복사 (next 바이너리 + 런타임 의존성)
COPY --from=builder /app/node_modules ./node_modules

# 빌드된 Next.js 결과물 복사
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next ./apps/web/.next
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/package.json ./apps/web/
COPY --from=builder /app/apps/web/next.config.mjs ./apps/web/

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

WORKDIR /app/apps/web

CMD ["node", "../../node_modules/next/dist/bin/next", "start"]
