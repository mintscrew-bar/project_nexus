# Remote Access Guide

This PC is the production server PC for Nexus.

## Server Address

Use Tailscale for remote access.

```text
haru@100.123.211.60
```

Project path on the server:

```bash
cd ~/projects/nexus
```

## Connect From Home

1. Install Tailscale on the home PC.
2. Log in with the same Tailscale account.
3. Connect over SSH:

```bash
ssh haru@100.123.211.60
```

For VS Code:

1. Install the `Remote - SSH` extension.
2. Add this SSH target:

```text
haru@100.123.211.60
```

3. Open this folder after connecting:

```bash
/home/haru/projects/nexus
```

## Sync Latest Code

After connecting to the server:

```bash
cd ~/projects/nexus
git pull --ff-only origin main
```

## Commit Work

```bash
git status
git add -A
git commit -m "fix: describe the change"
git push origin main
```

Example commit messages:

```bash
git commit -m "fix: resolve beta launch bugs"
git commit -m "feat: improve community notice controls"
git commit -m "chore: update production docs"
git commit -m "fix: polish mobile layout"
```

## Deploy Production Changes

Run from the server PC:

```bash
cd ~/projects/nexus
git pull --ff-only origin main
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build api web
```

Check status:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Check logs:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=80 api
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=80 web
```

## Notes

- Keep this server PC powered on.
- Disable sleep mode if remote access should always work.
- Use Tailscale/SSH for development and admin access.
- Keep Cloudflare Tunnel for public web traffic.
- Be careful with `docker compose down` because this PC is running production.
