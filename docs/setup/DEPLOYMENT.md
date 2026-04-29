# Production Deployment

## 1. Prepare Environment

```bash
cp .env.production.example .env.production
```

Set real values before starting:

- `APP_URL`, `CORS_ORIGINS`, `NEXTAUTH_URL`, `NEXT_PUBLIC_API_URL`
- `POSTGRES_PASSWORD`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `NEXTAUTH_SECRET`
- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, callback URLs
- `RIOT_API_KEY`

Generate secrets with:

```bash
openssl rand -base64 32
```

## 2. Validate Compose

```bash
pnpm compose:prod:config
```

To validate with the example file before creating real secrets:

```bash
NEXUS_ENV_FILE=.env.production.example docker compose --env-file .env.production.example -f docker-compose.prod.yml config
```

## 3. Start

```bash
pnpm compose:prod:up
```

The API image runs `prisma migrate deploy` before starting. Production must not use `prisma db push`.

## 4. Check Health

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl http://localhost:4000/api/health
```

## 5. Logs

```bash
pnpm compose:prod:logs:api
pnpm compose:prod:logs:web
```

## Notes

- PostgreSQL and Redis are not exposed to the host in the production compose file.
- Put Nginx/Caddy/Cloudflare Tunnel in front of `web:3000` for HTTPS.
- Keep `RIOT_MATCH_CACHE_CLEANUP_ENABLED=false` until ranked/normal/aram recompute no longer depends on raw Riot match cache.
- Back up the `postgres_data` volume before applying migrations on a real production database.
