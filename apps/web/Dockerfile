# Build stage
FROM node:24-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.34.7 --activate

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
ARG NEXT_PUBLIC_UPLOADS_BASE_URL
ENV NEXT_PUBLIC_UPLOADS_BASE_URL=${NEXT_PUBLIC_UPLOADS_BASE_URL}
# GA4 측정 ID — 빈 값이면 GoogleAnalytics 컴포넌트가 렌더를 건너뜀.
ARG NEXT_PUBLIC_GA_ID
ENV NEXT_PUBLIC_GA_ID=${NEXT_PUBLIC_GA_ID}
# AdSense 수동 광고 단위. 위치별 값이 없으면 DEFAULT 슬롯을 사용한다.
ARG NEXT_PUBLIC_ADSENSE_SLOT_DEFAULT
ENV NEXT_PUBLIC_ADSENSE_SLOT_DEFAULT=${NEXT_PUBLIC_ADSENSE_SLOT_DEFAULT}
ARG NEXT_PUBLIC_ADSENSE_SLOT_LANDING
ENV NEXT_PUBLIC_ADSENSE_SLOT_LANDING=${NEXT_PUBLIC_ADSENSE_SLOT_LANDING}
ARG NEXT_PUBLIC_ADSENSE_SLOT_FEED
ENV NEXT_PUBLIC_ADSENSE_SLOT_FEED=${NEXT_PUBLIC_ADSENSE_SLOT_FEED}
ARG NEXT_PUBLIC_ADSENSE_SLOT_MATCH_HUB
ENV NEXT_PUBLIC_ADSENSE_SLOT_MATCH_HUB=${NEXT_PUBLIC_ADSENSE_SLOT_MATCH_HUB}
ARG NEXT_PUBLIC_ADSENSE_SLOT_PROFILE
ENV NEXT_PUBLIC_ADSENSE_SLOT_PROFILE=${NEXT_PUBLIC_ADSENSE_SLOT_PROFILE}
ARG NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE
ENV NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE=${NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE}
# next.config.mjs의 rewrites도 빌드 타임에 평가되므로 API_URL도 ARG 필요.
# 컨테이너간 통신 호스트명(default: api:4000)을 빌드 인자로 전달한다.
ARG API_URL=http://api:4000
ENV API_URL=${API_URL}
# OOM 방지: Next.js 빌드는 메모리를 많이 소모하므로 힙 상한을 명시한다
ENV NODE_OPTIONS=--max-old-space-size=3072
RUN pnpm --filter @nexus/types build
RUN pnpm --filter @nexus/web build

# Production stage
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# standalone 출력만 복사한다 (next.config 의 output: "standalone").
# Next 가 실제로 쓰는 파일만 추적한 server.js + 최소 node_modules(next·react·sharp 등)다.
# 예전엔 lockfile 전체 node_modules(1GB+)와 .next/cache(빌드 캐시 115MB)까지 넣어서
# 배포마다 큰 레이어를 받다가 CD 가 시간 초과로 취소된 적이 있다(2026-10-23).
# 앱 의존성(@nexus/types 포함)은 서버 번들에 들어가 있어 따로 복사하지 않는다.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
# standalone 은 정적 파일을 담지 않는다 — 브라우저용 청크(static)와 public 을 직접 옆에 둔다
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

WORKDIR /app/apps/web

# PORT·HOSTNAME 은 위 ENV 를 server.js 가 읽는다
CMD ["node", "server.js"]
