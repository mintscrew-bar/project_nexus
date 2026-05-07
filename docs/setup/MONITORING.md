# Monitoring Setup

NEXUS는 우선 Uptime Kuma를 기본 모니터링 도구로 사용한다. 서버 생존 여부, API 응답, DB/Redis TCP 연결을 확인하고 Discord로 장애 알림을 보낼 수 있다.

## Uptime Kuma 실행

운영 compose에는 `uptime-kuma` 서비스가 포함되어 있다.

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d uptime-kuma
```

기본 포트는 서버 로컬호스트의 `3001`이다.

```bash
curl http://127.0.0.1:3001
```

처음 접속하면 관리자 계정을 생성한다. 초기 설정 화면이 외부에 노출되지 않도록 `docker-compose.prod.yml`은 `127.0.0.1:${UPTIME_KUMA_HOST_PORT:-3001}:3001`로만 바인딩한다.

로컬 PC에서 운영 서버의 Uptime Kuma UI에 접속할 때는 SSH 터널을 사용한다.

```bash
ssh -L 3001:127.0.0.1:3001 <server>
```

그다음 브라우저에서 `http://127.0.0.1:3001`을 연다.

## 권장 모니터

Uptime Kuma의 `Add New Monitor`에서 아래 항목을 추가한다.

| 이름 | 타입 | 대상 |
| --- | --- | --- |
| Nexus Website | HTTP(s) | `https://labs-nexus.com` |
| Nexus API Public | HTTP(s) | `https://labs-nexus.com/api/health` |
| Nexus API Internal | HTTP(s) | `http://api:4000/api/health` |
| Nexus Web Internal | HTTP(s) | `http://web:3000` |
| Postgres | TCP Port | Host: `postgres`, Port: `5432` |
| Redis | TCP Port | Host: `redis`, Port: `6379` |

내부 대상은 Uptime Kuma 컨테이너가 같은 compose 네트워크에 있기 때문에 컨테이너 서비스명으로 접근한다.

## Discord 알림

Discord 서버에 관리자 전용 채널을 만들고 `채널 편집 -> 연동 -> 웹후크`에서 웹후크 URL을 생성한다. Uptime Kuma의 `Settings -> Notifications -> Setup Notification`에서 `Discord`를 선택하고 웹후크 URL을 넣는다.

알림은 최소한 아래 이벤트를 켠다.

- Down
- Up
- Certificate expiry

## 공개 접근

Uptime Kuma는 `/status` 같은 하위 경로 배포에 적합하지 않다. 외부에서 접속해야 한다면 `status.labs-nexus.com` 같은 별도 서브도메인을 쓰고, 가능하면 Cloudflare Access나 VPN으로 관리자 화면을 보호한다.

공개 상태 페이지가 필요하면 Uptime Kuma 안에서 Status Page를 만들고, 관리자 UI와 같은 주소를 공개하기 전에 인증/접근 제어를 먼저 확정한다.

## 환경 변수

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `UPTIME_KUMA_HOST_PORT` | `3001` | 서버 로컬호스트에 바인딩할 Uptime Kuma 포트 |

`UPTIME_KUMA_HOST_PORT`는 `.env.production`에서 바꿀 수 있다. 서버에 이미 `3001`을 쓰는 프로세스가 있으면 다른 포트로 변경한다.
