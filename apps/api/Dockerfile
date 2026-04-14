# Build stage
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY packages/database/package.json ./packages/database/
COPY packages/types/package.json ./packages/types/

# Install dependencies
RUN echo "node-linker=hoisted" > .npmrc && pnpm install --frozen-lockfile

# Copy source code
COPY apps/api ./apps/api
COPY packages ./packages

# Alpine은 OpenSSL 3.x를 사용하므로 Prisma 엔진 바이너리 타깃 명시
ENV PRISMA_CLI_BINARY_TARGETS=linux-musl-openssl-3.0.x

# Generate Prisma client
RUN pnpm --filter @nexus/database db:generate

# 의존 패키지 먼저 빌드 (API가 dist/index.js를 참조하기 때문)
RUN pnpm --filter @nexus/types build
RUN pnpm --filter @nexus/database build

# API 빌드
RUN pnpm --filter @nexus/api build

# Production stage
FROM node:20-alpine AS runner

# Prisma 엔진 실행에 필요한 OpenSSL 설치
RUN apk add --no-cache openssl

# PM2 글로벌 설치
RUN npm install -g pm2

WORKDIR /app

# 로그 디렉토리 생성
RUN mkdir -p /app/logs

ENV NODE_ENV=production

# Copy built files
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
COPY --from=builder /app/apps/api/ecosystem.config.js ./

# node_modules 복사 (workspace symlink은 다음 단계에서 실제 파일로 덮어씀)
COPY --from=builder /app/node_modules ./node_modules

# workspace 패키지를 node_modules/@nexus/에 직접 배치
# (Docker COPY는 node_modules 외부를 가리키는 pnpm symlink를 따라가지 못함)
COPY --from=builder /app/packages/database/dist ./node_modules/@nexus/database/dist
COPY --from=builder /app/packages/database/package.json ./node_modules/@nexus/database/package.json
COPY --from=builder /app/packages/types/dist ./node_modules/@nexus/types/dist
COPY --from=builder /app/packages/types/package.json ./node_modules/@nexus/types/package.json
# Prisma 스키마/마이그레이션 파일
COPY --from=builder /app/packages/database/prisma ./prisma

EXPOSE 4000

# 스키마 동기화 후 API 시작 (로컬/초기 DB에서도 안전하게 기동)
CMD ["sh", "-c", "node_modules/.bin/prisma db push --schema=/app/prisma/schema.prisma && pm2-runtime ecosystem.config.js"]
