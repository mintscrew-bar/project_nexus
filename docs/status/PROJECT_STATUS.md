# Project Nexus - 프로젝트 현황

> 기준일: 2026-04-27

---

## 전체 빌드 상태

| 영역 | 상태 |
|------|------|
| API (NestJS) | ✅ 빌드 통과 |
| Web (Next.js) | ✅ 빌드 통과 (37 static + 동적 routes) |
| Prisma Client | ✅ v6.19.3 생성 완료 |
| CI (`ci.yml`) | ✅ GitHub Actions 구성됨 |
| 베타 배포 계획 | ✅ [BETA_PUBLIC_TEST_PLAN.md](./BETA_PUBLIC_TEST_PLAN.md) 완성 |

---

## 백엔드 모듈 (20개)

| 모듈 | 상태 | 주요 기능 |
|------|------|----------|
| auth | ✅ | Discord OAuth, 이메일 로그인, JWT, 약관 동의 |
| user | ✅ | 프로필, 설정, 아바타, 이의신청 |
| riot | ✅ | 계정 인증·동기화, Data Dragon 프록시, Tournament Code |
| room | ✅ | 방 CRUD·참가·채팅, Snake Draft |
| auction | ✅ | 팀장 선출, 입찰, 소프트 타이머, 낙찰·유찰 |
| role-selection | ✅ | 경매/드래프트 후 포지션 선택 |
| match | ✅ | 브래킷 생성, 매치 진행, 결과 처리 |
| clan | ✅ | 클랜 CRUD, 초대, 공지, 활동 로그, 채팅 |
| community | ✅ | 게시판, 댓글, 좋아요, 북마크, 블라인드 |
| friend | ✅ | 친구 요청·차단 |
| dm | ✅ | 1:1 다이렉트 메시지 |
| notification | ✅ | 실시간 알림 push |
| presence | ✅ | 온라인 상태 관리 |
| reputation | ✅ | 평가(실력·태도·의사소통), 신고, 자동 밴 |
| ranking | ✅ | 전체·클랜 랭킹 집계 |
| discord | ✅ | 음성채널 자동화 (팀별 이동·생성·정리) |
| stats | ✅ | 사용자 통계, 전적 크롤링, Lab 분석 대시보드 |
| admin | ✅ | 유저 관리, 신고 검토, Lab 스냅샷 운영 |
| tasks | ✅ | Cron (티어 동기화, 세션 정리, Lab 스냅샷) |
| upload | ✅ | 파일 업로드 (아바타, 커뮤니티 이미지) |

---

## WebSocket 게이트웨이 (9개)

`/room`, `/auction`, `/snake-draft`, `/role-selection`, `/match`, `/clan`, `/dm`, `notification`, `/presence`

→ 이벤트 명세: [WEBSOCKET_EVENTS.md](../technical/WEBSOCKET_EVENTS.md)

---

## 프론트엔드 라우트 (빌드 기준)

| 구분 | 라우트 수 | 주요 라우트 |
|------|----------|-----------|
| Static | 21 | `/`, `/auth/*`, `/clans`, `/community`, `/matches`, `/settings`, `/terms`, `/privacy` 등 |
| Dynamic | 29 | `/auction/[id]`, `/draft/[id]`, `/lab/*`, `/tournaments/[id]/*`, `/users/[id]` 등 |

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Backend | NestJS, Prisma 6, PostgreSQL, Socket.io, Redis |
| Frontend | Next.js 14 App Router, Zustand, TanStack Query v5, Tailwind CSS, Radix UI |
| Auth | Discord OAuth, JWT (access + refresh) |
| External | Riot Games API, Discord Bot API |
| Infra | Docker Compose, Turborepo, pnpm, GitHub Actions |

---

## 남은 작업

### 베타 배포 준비 (즉시)

- [ ] `docker-compose.prod.yml` 작성 (GHCR 이미지 pull 방식)
- [ ] GitHub Actions `deploy.yml` 작성 (GHCR push → SSH pull)
- [ ] Lightsail 인스턴스 셋업 (`scripts/setup-server.sh` 활용)
- [ ] Caddy/nginx HTTPS 설정
- [ ] 베타 도메인 Discord/Riot OAuth redirect URL 재등록
- [ ] 운영 `.env` 구성 (Riot key, Discord OAuth, JWT secrets)

### 테스트

- [ ] E2E 통합 테스트 (10인 방, 경매·드래프트 전 과정)
- [ ] 모바일 브라우저 확인

### 보안

→ [SECURITY_TODO.md](../security/SECURITY_TODO.md), [SYSTEM_VULNERABILITY_REPORT.md](../security/SYSTEM_VULNERABILITY_REPORT.md) 참조

---

## 알려진 이슈

→ [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) 참조
