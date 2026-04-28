# Cloudflare Tunnel 시범 운영 가이드

> 이 PC(WSL2 + Docker)에서 운영 컨테이너를 띄우고 Cloudflare Tunnel로 외부에 노출.
> 도메인 도착 후 처음부터 끝까지 따라가면 30분 안에 시범 서비스 가동.

## 사전 조건

- ✅ `.env.production` 작성 완료 (시크릿은 채워짐, 도메인만 placeholder)
- ✅ Postgres / Redis / cloudflared 이미지 받아둠
- ✅ API 이미지 사전 빌드 (web은 도메인 후 빌드)
- ⏳ 도메인 구입 완료
- ⏳ Cloudflare 계정

---

## 1. 도메인 → Cloudflare 연결

1. Cloudflare 무료 가입: https://dash.cloudflare.com/sign-up
2. 우측 상단 **Add site** → 도메인 입력 → Free 플랜 선택
3. Cloudflare가 안내하는 nameserver 2개를 도메인 등록업체(가비아 등)에서 변경
4. 전파 대기 (보통 5분~수시간). Cloudflare 대시보드가 "Active" 표시될 때까지

---

## 2. `.env.production` 도메인 일괄 교체

도메인이 `nexus.gg`라고 가정:

```bash
sed -i 's|__DOMAIN__|nexus.gg|g' .env.production
```

확인:
```bash
grep "https://" .env.production
```

---

## 3. Discord OAuth 콜백 URL 추가

Discord Developer Portal → 본인 앱 → OAuth2 → Redirects에 다음 두 URL 추가:

- `https://nexus.gg/api/auth/discord/callback`
- `https://nexus.gg/api/auth/discord/link/callback`

(dev URL `http://localhost:3000/...`은 그대로 두고 추가만)

---

## 4. Web 이미지 빌드 (도메인 인라인)

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production build --no-cache web
```

빌드 시간 5~10분.

---

## 5. 컨테이너 기동

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d postgres redis
# DB 준비 대기 후
docker compose -f docker-compose.prod.yml --env-file .env.production up -d api
# API 헬스체크 통과 대기 후
docker compose -f docker-compose.prod.yml --env-file .env.production up -d web
```

또는 한 번에:
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

상태 확인:
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
```

---

## 6. 첫 배포 — Prisma 마이그레이션

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

## 7. Cloudflare Tunnel 설정

### 7-1. Tunnel 생성 (대시보드 방식 권장)

1. Cloudflare 대시보드 → **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel**
2. 이름: `nexus-home` (자유)
3. 다음 화면에서 **Docker** 탭 선택 → 토큰 복사

### 7-2. cloudflared 컨테이너 띄우기

복사한 토큰을 `.env.production`의 `CLOUDFLARE_TUNNEL_TOKEN`에 채운 후 profile로 띄움:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production --profile tunnel up -d cloudflared
```

확인:
```bash
docker logs -f nexus-tunnel
```
"Connection ... registered" 메시지 4개 정도 보이면 정상.

> 같은 compose 안에 있어 별도 network 지정 불필요. cloudflared가 `web:3000`을 내부 호스트명으로 호출 가능.

### 7-3. Public Hostname 등록

Cloudflare 대시보드 → 만든 Tunnel → **Public Hostnames** → **Add a public hostname**

| 필드 | 값 |
|---|---|
| Subdomain | (비움 = apex) 또는 `www` |
| Domain | `nexus.gg` |
| Service Type | `HTTP` |
| URL | `web:3000` (compose 네트워크 내부 호스트명) |

저장.

---

## 8. Smoke Test

브라우저에서 `https://nexus.gg` 접속.

체크리스트:
- [ ] 메인 페이지 로딩 (HTTPS 자물쇠 표시)
- [ ] Discord 로그인
- [ ] Riot 연동
- [ ] 방 만들기 / 입장
- [ ] WebSocket 연결 (방 채팅)
- [ ] Lab 대시보드 진입

---

## 9. 운영 시 주의

- **Windows 절전 끄기**: 제어판 → 전원 옵션 → 고성능 + 절전 모드 안 함
- **WSL 자동 종료 방지**: `.wslconfig`에 `vmIdleTimeout=-1` 추가 권장
- **재부팅 시 자동 시작**: Docker Desktop의 "Start Docker Desktop when you sign in to your computer" 체크
- **백업**: `docker exec nexus-postgres pg_dump -U nexus nexus | gzip > backup-$(date +%F).sql.gz` 매일 cron

---

## 10. 트러블슈팅

| 증상 | 원인 | 조치 |
|---|---|---|
| `web` 컨테이너에서 `NEXT_PUBLIC_API_URL`이 빈 값 | 빌드 시 ARG 미지정 | 환경변수 확인 후 web 이미지 재빌드 |
| Discord 로그인 시 redirect_uri 오류 | Developer Portal에 운영 콜백 URL 미등록 | 4단계 다시 확인 |
| Lab 진입 시 빈 화면 | 로그인 안 함 (랩은 등록 유저 전용) | Discord로 로그인 후 재진입 |
| 502 Bad Gateway | cloudflared가 web:3000에 못 닿음 | network 이름 확인, web 컨테이너 healthy 확인 |
| WebSocket 끊김 | Cloudflare WebSocket 비활성 | Network → WebSockets ON 확인 |

---

## 다음 단계 (Oracle 이전 시)

1. `pg_dump` 백업
2. Oracle Free Tier ARM VM 프로비저닝
3. 동일 docker-compose.prod.yml 사용 (이미지 ARM 호환 확인 필요)
4. `pg_restore`로 데이터 이전
5. Cloudflare Tunnel 컨테이너만 새 호스트로 옮기면 도메인 무중단
