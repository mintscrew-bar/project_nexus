# Build stage
FROM node:24-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.34.7 --activate

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

# 운영 이미지에 넣을 node_modules 를 따로 뽑는다 — api 의 dependencies 만, devDependencies 는 뺀다.
# 위의 /app/node_modules 는 lockfile 전체(web 의존성·jest·nest cli·webpack·typescript…)라 1GB 가 넘는다.
# 의존성이 바뀌는 배포마다 이 레이어를 통째로 새로 받아야 해서, GHCR 이 느린 날 CD 가 pull 단계에서
# 15분 제한에 걸려 취소됐다(2026-10-23). `pnpm deploy` 는 api 의 운영 의존성만 담은 평평한 node_modules 를 만든다.
# (prisma CLI 는 entrypoint 의 migrate deploy 가 런타임에 쓰므로 api dependencies 에 둔다)
# Prisma 7 부터 클라이언트는 @nexus/database 의 dist 에 컴파일돼 들어가서 여기서 따로 생성하지 않는다.
RUN pnpm --filter @nexus/api deploy --prod --legacy /out

# Production stage
FROM node:24-alpine AS runner

# Prisma 엔진 실행에 필요한 OpenSSL 설치
RUN apk add --no-cache openssl

# PM2 글로벌 설치 — entrypoint 의 pm2-runtime 이 이걸 쓴다.
# 버전을 고정해 두지 않으면 빌드할 때마다 최신이 들어와 재현성이 깨진다.
# (package.json 의존성에는 두지 않는다 — 런타임에 필요한 건 이 전역 설치뿐이다)
RUN npm install -g pm2@7.0.4

WORKDIR /app

# 로그/업로드 디렉토리 생성
RUN mkdir -p /app/logs /app/uploads

ENV NODE_ENV=production

# Copy built files
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./
COPY --from=builder /app/apps/api/ecosystem.config.js ./

# node_modules 복사 — 운영 의존성만 뽑은 /out 의 것
# api 전용 버전도 여기 평평하게 들어간다. 예전처럼 루트 node_modules 만 복사하면
# apps/api/node_modules 에 따로 깔린 버전이 조용히 빠지는 문제가 있었다.
COPY --from=builder /out/node_modules ./node_modules

# workspace 패키지를 node_modules/@nexus/에 직접 배치
# (Docker COPY는 node_modules 외부를 가리키는 pnpm symlink를 따라가지 못함)
COPY --from=builder /app/packages/database/dist ./node_modules/@nexus/database/dist
COPY --from=builder /app/packages/database/package.json ./node_modules/@nexus/database/package.json
COPY --from=builder /app/packages/types/dist ./node_modules/@nexus/types/dist
COPY --from=builder /app/packages/types/package.json ./node_modules/@nexus/types/package.json
# Prisma 스키마/마이그레이션 파일 + CLI 설정(Prisma 7 은 접속 URL 을 여기서 읽는다)
COPY --from=builder /app/packages/database/prisma ./prisma
COPY --from=builder /app/packages/database/prisma.config.ts ./prisma.config.ts

# 시작 스크립트 (마이그레이션 / 백필 / 기동 분리)
COPY --from=builder /app/apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
# 기본 동작: 마이그레이션 적용 후 API 기동.
# 백필은 시작 경로에서 분리했다 — `run --rm api backfill`로 별도 실행한다.
CMD ["serve"]
