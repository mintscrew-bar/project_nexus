# Cloudflare Tunnel 운영 가이드

> 현재 운영 기준: WSL2 + Docker 위에서 `docker-compose.prod.yml`을 실행하고,
> `cloudflared`가 `nginx:80`을 원점(origin)으로 바라보며 `labs-nexus.com`을 외부에 노출한다.

## 사전 조건

- GitHub Actions CD가 서버의 `/home/haru/projects/nexus/.env.production`을 GitHub Secrets로 생성할 수 있어야 함
- Cloudflare Zero Trust Tunnel 생성 및 `CLOUDFLARE_TUNNEL_TOKEN` 발급 완료
- Cloudflare에서 운영 도메인(`labs-nexus.com` 등) DNS가 활성화되어 있어야 함
- 운영 서버에서 `docker compose -f docker-compose.prod.yml --env-file .env.production ps` 가 정상 동작해야 함

---

## 1. 도메인과 Tunnel 준비

1. Cloudflare 무료 가입: https://dash.cloudflare.com/sign-up
2. 우측 상단 **Add site** → 도메인 입력 → Free 플랜 선택
3. Cloudflare가 안내하는 nameserver 2개를 도메인 등록업체(가비아 등)에서 변경
4. 전파 대기 (보통 5분~수시간). Cloudflare 대시보드가 "Active" 표시될 때까지

---

## 2. Discord OAuth 콜백 URL 추가

Discord Developer Portal → 본인 앱 → OAuth2 → Redirects에 다음 두 URL 추가:

- `https://labs-nexus.com/api/auth/discord/callback`
- `https://labs-nexus.com/api/auth/discord/link/callback`

(dev URL `http://localhost:3000/...`은 그대로 두고 추가만)

---

## 3. GitHub Secrets / `.env.production` 계약

CD 워크플로는 배포 시 `.env.production`을 매번 다시 생성한다. 따라서 운영에 필요한 값은 로컬 파일이 아니라 GitHub Secrets에 모두 있어야 한다.

최소 확인 항목:

- URL / 포트: `APP_URL`, `CORS_ORIGINS`, `NEXTAUTH_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_UPLOADS_BASE_URL`, `WEB_HOST_PORT`, `API_HOST_PORT`, `API_BIND_HOST`
- 데이터/인증: `POSTGRES_*`, `DATABASE_URL`, `REDIS_URL`, `JWT_*`, `NEXTAUTH_SECRET`, `DATA_ENCRYPTION_KEY`, `DATA_LOOKUP_HMAC_KEY`
- Riot / Discord: `RIOT_API_KEY`, `RIOT_REGION`, `RIOT_TOURNAMENT_PROVIDER_ID`, `RIOT_TOURNAMENT_ID`, `TOURNAMENT_API_ENABLED`, `DISCORD_*`
- 업로드 / 터널: `UPLOAD_DRIVER`, `UPLOAD_PUBLIC_BASE_URL`, `R2_*`, `CLOUDFLARE_TUNNEL_TOKEN`

예시 키 목록은 [`.env.example`](../../.env.example) 를 기준으로 유지한다.

---

## 4. 컨테이너 기동과 origin 구조

현재 운영 트래픽 경로는 다음과 같다.

`Cloudflare Tunnel -> cloudflared -> nginx:80 -> web:3000 / api:4000`

수동 확인 명령:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
docker compose -f docker-compose.prod.yml --env-file .env.production ps
```

헬스 확인:

```bash
curl -f http://127.0.0.1:4000/api/health
curl -f https://labs-nexus.com/api/health
```

운영 배포는 GitHub Actions CD가 담당하며, 현재 워크플로는 `postgres/redis/uptime-kuma`를 보장한 뒤 `api -> web -> nginx -> cloudflared` 순으로 단계별 롤아웃한다.

---

## 5. 첫 배포 시 Prisma 마이그레이션

API 컨테이너에 들어가 마이그레이션 실행 (이미 도커 빌드 시 자동 실행되도록 되어 있으면 스킵 가능, 아니면 수동):

```bash
docker exec -it nexus-api sh -c "cd packages/database && npx prisma migrate deploy"
```

확인:
```bash
docker exec -it nexus-api sh -c "cd packages/database && npx prisma migrate status"
```

`Database schema is up to date!` 가 보이면 완료.

---

## 6. Cloudflare Tunnel 설정

### 7-1. Tunnel 생성 (대시보드 방식 권장)

1. Cloudflare 대시보드 → **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel**
2. 이름: `nexus-home` (자유)
3. 다음 화면에서 **Docker** 탭 선택 → 토큰 복사

### 7-2. cloudflared 컨테이너 띄우기

복사한 토큰을 GitHub Secrets의 `CLOUDFLARE_TUNNEL_TOKEN`과 운영 서버의 `.env.production`에 반영한 뒤 compose로 띄운다:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d cloudflared
```

확인:
```bash
docker logs -f nexus-cloudflared
```
"Connection ... registered" 메시지 4개 정도 보이면 정상.

> 현재 compose에서는 `cloudflared`가 항상 포함되며, origin은 `web:3000`이 아니라 `nginx:80`이다.

### 7-3. Public Hostname 등록

Cloudflare 대시보드 → 만든 Tunnel → **Public Hostnames** → **Add a public hostname**

| 필드 | 값 |
|---|---|
| Subdomain | (비움 = apex) 또는 `www` |
| Domain | `labs-nexus.com` |
| Service Type | `HTTP` |
| URL | `nginx:80` (compose 네트워크 내부 호스트명) |

저장.

---

## 7. Smoke Test

브라우저에서 `https://labs-nexus.com` 접속.

체크리스트:
- [ ] 메인 페이지 로딩 (HTTPS 자물쇠 표시)
- [ ] Discord 로그인
- [ ] Riot 연동
- [ ] 방 만들기 / 입장
- [ ] WebSocket 연결 (방 채팅)
- [ ] 종료된 내전 전적 조회

---

## 8. 운영 시 주의

- **Windows 절전 끄기**: 제어판 → 전원 옵션 → 고성능 + 절전 모드 안 함
- **WSL 자동 종료 방지**: `.wslconfig`에 `vmIdleTimeout=-1` 추가 권장
- **재부팅 시 자동 시작**: Docker Desktop의 "Start Docker Desktop when you sign in to your computer" 체크
- **Redis 메모리 설정**: 호스트에 `vm.overcommit_memory=1` 적용 권장
- **백업**: `docker exec nexus-postgres pg_dump -U nexus nexus | gzip > backup-$(date +%F).sql.gz` 매일 cron

---

## 9. 트러블슈팅

| 증상 | 원인 | 조치 |
|---|---|---|
| `web` 컨테이너에서 `NEXT_PUBLIC_API_URL`이 빈 값 | 빌드 시 ARG 미지정 | 환경변수 확인 후 web 이미지 재빌드 |
| Discord 로그인 시 redirect_uri 오류 | Developer Portal에 운영 콜백 URL 미등록 | 4단계 다시 확인 |
| 502 Bad Gateway | `nginx` upstream(`api` 또는 `web`)이 아직 준비되지 않음 | `docker compose ps`, `docker logs nexus-api`, `docker logs nexus-web` 확인 |
| Tunnel 연결 끊김 | `cloudflared` 재기동 또는 이미지 변경 | `docker logs nexus-cloudflared` 와 Public Hostname origin(`nginx:80`) 확인 |
| WebSocket 끊김 | Cloudflare WebSocket 비활성 | Network → WebSockets ON 확인 |
