# Project Nexus 공개 베타 테스트 플랜

> 목적: 초대코드 없이 공개 접속부터 실제 내전 운영까지 한 번에 검증한다.

## 1. 공개 베타 원칙

- 가입 제한은 두지 않는다.
- 수익화, 참가비, 유료 기능은 베타 중 사용하지 않는다.
- 베타 도메인은 운영 도메인과 구분한다. 예: `beta.example.com`.
- 베타 중 데이터는 예고 후 초기화될 수 있음을 공지한다.
- 장애가 나면 기능 수정 전 DB 백업과 로그 확보를 먼저 한다.

## 2. 베타 전 필수 점검

### 외부 서비스

- Riot Developer Portal에 서비스 등록 상태를 확인한다.
- Riot API key를 베타 서버 `.env`에 설정한다.
- Discord Developer Portal OAuth redirect URL을 베타 도메인으로 등록한다.
- Discord bot을 테스트 서버에 초대하고 권한을 확인한다.
- Google OAuth를 사용한다면 Google Console redirect URL도 베타 도메인으로 등록한다.

### 법/정책/운영

- `/terms` 이용약관 페이지가 접근 가능한지 확인한다.
- `/privacy` 개인정보처리방침 페이지가 접근 가능한지 확인한다.
- 신규 OAuth 가입자의 약관 동의 플로우가 작동하는지 확인한다.
- 베타 공지에 다음 문구를 포함한다.

```text
Project Nexus는 공개 베타 테스트 중입니다.
서비스 장애, 데이터 초기화, 일부 기능 제한이 발생할 수 있습니다.
베타 기간 중 유료 결제, 참가비, 상금 운영은 진행하지 않습니다.
버그 및 신고는 Discord 지정 채널로 접수합니다.
```

### 서버 환경변수

베타 도메인이 `https://beta.example.com`인 경우 예시:

```env
NODE_ENV=production
APP_URL=https://beta.example.com
CORS_ORIGINS=https://beta.example.com
NEXTAUTH_URL=https://beta.example.com
API_URL=http://api:4000
NEXT_PUBLIC_API_URL=https://beta.example.com
DATABASE_URL=postgresql://nexus:<password>@postgres:5432/nexus?schema=public
REDIS_URL=redis://redis:6379
JWT_ACCESS_SECRET=<openssl rand -base64 32>
JWT_REFRESH_SECRET=<openssl rand -base64 32>
NEXTAUTH_SECRET=<openssl rand -base64 32>
RIOT_API_KEY=<riot key>
DISCORD_CLIENT_ID=<discord client id>
DISCORD_CLIENT_SECRET=<discord client secret>
DISCORD_CALLBACK_URL=https://beta.example.com/api/auth/discord/callback
DISCORD_LINK_CALLBACK_URL=https://beta.example.com/api/auth/discord/link/callback
DISCORD_BOT_TOKEN=<discord bot token>
DISCORD_GUILD_ID=<discord guild id>
```

## 3. 공개 베타 배포 체크리스트

- `main` 브랜치 최신 커밋을 배포한다.
- 배포 전 `pnpm lint`, `pnpm build`, `pnpm test -- --passWithNoTests`를 통과시킨다.
- 운영 DB에는 `prisma db push` 대신 `prisma migrate deploy`를 사용한다.
- PostgreSQL 볼륨 백업 위치를 확인한다.
- Redis가 재시작되어도 핵심 데이터가 DB 기준으로 복구되는지 확인한다.
- nginx 또는 Caddy에서 HTTPS가 정상 적용되는지 확인한다.
- `/api/health`가 200을 반환하는지 확인한다.
- WebSocket `/socket.io/`가 프록시되는지 확인한다.
- `uploads` 디렉터리가 컨테이너 재시작 후에도 유지되는지 확인한다.

## 4. 접속 테스트

### 비로그인 사용자

1. `https://beta.example.com` 접속
2. 랜딩 페이지 확인
3. `/terms` 접근
4. `/privacy` 접근
5. `/tournaments` 목록 접근
6. 로그인 필요 기능 클릭 시 로그인 페이지로 이동하는지 확인

### 신규 사용자

1. Discord 또는 Google로 로그인
2. 약관 동의 페이지 표시 확인
3. 필수 약관 미동의 시 진행 불가 확인
4. 약관 동의 후 대시보드 또는 홈으로 이동 확인
5. `/settings` 접근 확인
6. 로그아웃 후 재로그인 확인

### 연동 테스트

1. Riot 계정 검색/연동
2. Riot 계정 인증 실패 메시지 확인
3. Discord 계정 연동
4. Discord bot 권한이 필요한 기능에서 실패 메시지 확인
5. 프로필 공개/비공개 설정 변경

## 5. 실사용 시나리오

### 최소 인원 테스트: 2~4명

- 방 생성
- 방 참가/나가기
- 준비 상태 변경
- 채팅 송수신
- 새로고침 후 상태 복구
- 모바일 브라우저 접속
- 네트워크 끊김 후 재연결

### 실제 내전 테스트: 10명 이상

1. 방 생성자가 방을 만든다.
2. 참가자 10명이 들어온다.
3. Riot/Discord 미연동 사용자의 에러 메시지를 확인한다.
4. 전원이 준비 완료한다.
5. 경매 또는 드래프트를 시작한다.
6. 입찰/픽/타이머가 모든 사용자에게 동기화되는지 확인한다.
7. 새로고침한 사용자가 현재 상태를 복구하는지 확인한다.
8. 역할 선택이 완료되는지 확인한다.
9. 매치 단계로 이동하는지 확인한다.
10. 결과 입력, 완료 처리, 기록 반영을 확인한다.

### 커뮤니티/운영 테스트

- 게시글 작성/수정/삭제
- 댓글 작성/삭제
- 신고 접수
- 관리자 신고 목록 조회
- 신고 승인/반려
- 유저 제한/밴/해제
- 관리자 공지 발송
- 채팅 로그 조회

## 6. 장애 관찰 포인트

### 서버 로그

- API 500 에러
- Prisma query error
- Redis connection error
- Socket.IO unauthorized 또는 reconnect loop
- Riot API 403, 429
- Discord API permission error

### 사용자 증상

- 로그인 후 무한 로딩
- 약관 동의 후 토큰 미저장
- 방 입장 후 참가자 목록 불일치
- 경매 타이머 불일치
- 드래프트 픽이 일부 사용자에게만 보임
- 모바일에서 버튼이 가려짐
- 새로고침 후 진행 상태 유실

## 7. 베타 성공 기준

- 신규 사용자가 도움 없이 가입부터 Riot/Discord 연동까지 완료한다.
- 10명 방이 최소 2회 이상 끝까지 진행된다.
- 새로고침/재접속 후 경매 또는 드래프트 상태가 복구된다.
- 신고, 밴, 공지, 채팅 로그를 운영자가 실제로 사용할 수 있다.
- DB 백업 파일이 생성되고 복구 절차를 설명할 수 있다.
- 치명적 장애 없이 24시간 이상 베타 서버가 유지된다.

## 8. 공개 베타 공지 템플릿

```text
Project Nexus 공개 베타를 시작합니다.

테스트 범위:
- 회원가입/로그인
- Riot 계정 연동
- Discord 계정 연동
- 내전 방 생성/참가
- 경매/드래프트/역할 선택
- 커뮤니티/신고/평판 기능

주의사항:
- 베타 기간 중 데이터가 초기화될 수 있습니다.
- 결제, 참가비, 상금 기능은 운영하지 않습니다.
- 장애나 버그는 Discord #버그제보 채널에 남겨주세요.
- 악용성 테스트, 도배, 타인 사칭, 개인정보 노출은 제재될 수 있습니다.

접속: https://beta.example.com
```

## 9. 베타 중단 기준

다음 중 하나라도 발생하면 공개 링크 공유를 중단하고 서버를 점검한다.

- 개인정보가 다른 사용자에게 노출됨
- 관리자 권한이 일반 사용자에게 노출됨
- 방/경매/드래프트 데이터가 다른 방과 섞임
- Riot API key 또는 Discord token 노출 의심
- DB migration 실패 또는 데이터 손상
- 서버가 반복적으로 재시작됨

## 10. 저비용 Lightsail 배포 구조

베타에서는 Lightsail 리소스를 여러 개로 나누지 않는다. 단일 인스턴스에 Docker Compose로 필요한 요소를 함께 실행한다.

```text
Cloudflare DNS/Proxy
  -> Lightsail instance
    -> Caddy 또는 nginx
      -> web container
      -> api container
    -> postgres container
    -> redis container
    -> uploads volume
    -> backup files
```

추천 플랜:

- 최소: Lightsail 2GB RAM / 2 vCPU / 60GB SSD
- 안정형: Lightsail 4GB RAM / 2 vCPU / 80GB SSD
- 베타 단계에서는 Lightsail managed database, load balancer, container service를 쓰지 않는다.
- Docker build는 서버에서 하지 않고 GitHub Actions에서 처리한다.

## 11. GitHub Actions 이미지 빌드 방식

역할을 분리한다.

```text
GitHub Actions = 빌드 공장
GHCR = 완성된 Docker image 저장소
Lightsail = 완성된 이미지를 pull해서 실행하는 서버
Caddy/nginx = 사용자 요청을 web/api 컨테이너로 라우팅
```

배포 흐름:

```text
1. 개발자가 main 브랜치에 push
2. GitHub Actions가 소스코드를 checkout
3. Actions가 api/web Docker image를 build
4. Actions가 이미지를 GHCR에 push
5. Lightsail 서버가 이미지를 pull
6. Docker Compose가 새 컨테이너를 실행
7. 사용자는 Lightsail의 Caddy/nginx를 통해 web/api에 접속
```

사용자 트래픽은 GitHub Actions를 거치지 않는다. GitHub Actions는 배포 시점에만 실행된다.

서버에 필요한 파일:

```text
/opt/nexus/docker-compose.prod.yml
/opt/nexus/.env
/opt/nexus/Caddyfile 또는 nginx.conf
/opt/nexus/backups/
/opt/nexus/uploads/
```

서버에서 하지 않는 작업:

```text
pnpm install
pnpm build
next build
nest build
docker build
```

서버에서 하는 작업:

```text
docker compose pull
docker compose up -d
docker compose exec api prisma migrate deploy
```

주의사항:

- Next.js의 `NEXT_PUBLIC_API_URL`은 build time에 인라인되므로 GitHub Actions build-arg로 전달한다.
- GHCR private image를 쓰면 Lightsail에서 `docker login ghcr.io`가 필요하다.
- 운영 DB에는 `prisma db push` 대신 `prisma migrate deploy`를 사용한다.
- API image 시작 명령에서 자동 `db push`가 실행되지 않도록 운영 Dockerfile/CMD를 점검한다.
