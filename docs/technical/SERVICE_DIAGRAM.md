# Nexus 서비스 아키텍처

> 기준일: 2026-04-27

---

## 전체 구조

```
Cloudflare DNS/Proxy
  └─ Caddy / nginx (HTTPS + 리버스 프록시)
       ├─ Next.js 14 (web, :3000)  — SSR + App Router
       └─ NestJS (api, :4000)      — REST /api + WebSocket
            ├─ PostgreSQL (postgres, :5432)  via Prisma 6
            └─ Redis (:6379)                 큐·락·캐시
```

배포 시 GitHub Actions에서 Docker image를 빌드 → GHCR push → 서버에서 `docker compose pull && up`.

---

## 백엔드 모듈 구조

```
apps/api/src/modules/
├─ auth/          인증 (Discord OAuth, 이메일, JWT, 약관)
├─ user/          사용자 프로필·설정·이의신청
├─ riot/          Riot 계정 인증·동기화·Data Dragon 프록시
├─ room/          방 CRUD·참가·채팅 + snake-draft gateway
├─ auction/       경매 엔진 (입찰·타이머·낙찰)
├─ role-selection/ 포지션 선택 단계
├─ match/         브래킷 생성·매치 진행·Tournament Code
├─ clan/          클랜 관리·채팅·초대·활동 로그
├─ community/     게시판·댓글·좋아요·북마크·블라인드
├─ friend/        친구 요청·차단
├─ dm/            1:1 DM
├─ notification/  알림 (실시간 push)
├─ presence/      온라인 상태
├─ reputation/    평가·신고·밴
├─ ranking/       랭킹 집계
├─ discord/       Discord 봇 (음성채널 자동화)
├─ stats/         사용자 통계·전적 크롤링
│   └─ lab/       관리자 전용 분석 대시보드 (챔피언·시너지·Oracle)
├─ admin/         관리자 패널 (유저관리·신고검토·Lab 운영)
├─ tasks/         Cron 작업 (티어 동기화·만료 세션 정리·Lab 스냅샷)
└─ upload/        파일 업로드 (아바타·이미지)
```

---

## WebSocket 네임스페이스

| Namespace | 용도 |
|-----------|------|
| `/room` | 방 채팅·준비·게임 시작 |
| `/auction` | 경매 입찰·타이머 |
| `/snake-draft` | 드래프트 픽 순서 |
| `/role-selection` | 포지션 선택 |
| `/match` | 매치·브래킷 업데이트 |
| `/clan` | 클랜 채팅·멤버 변경 |
| `/dm` | 1:1 메시지 |
| `notification` | 서버 → 클라이언트 push |
| `/presence` | 온라인 상태 |

모든 namespace: `transport: websocket only`, JWT 인증 필수.

---

## 내전 진행 흐름

```
방 생성 → 참가자 입장 → 준비 완료
  → 팀장 선출 (자원/수동)
  → [경매] 또는 [스네이크 드래프트]
  → 역할(포지션) 선택
  → 브래킷 생성 → 매치 진행 → 결과 입력
  → 평판 평가
```

- Discord 봇이 드래프트/경매 완료 시 팀별 음성채널 자동 이동을 처리한다.
- 각 단계는 WebSocket을 통해 모든 참가자에게 동기화된다.

---

## 외부 서비스 연동

```
Riot API ── 계정 인증, 티어 동기화, Tournament Code, Data Dragon
Discord  ── OAuth 로그인, 봇(음성채널 관리·알림), 계정 연동
```

---

## 데이터 흐름 요약

```
사용자 브라우저
  ↕ HTTPS REST /api/*        → NestJS Controllers → Prisma → PostgreSQL
  ↕ WebSocket /namespace     → NestJS Gateways   → Redis (pub/sub, 락)
                                                  → Discord Bot
                                                  → Riot API
```

Lab 분석 데이터는 Cron 작업이 주기적으로 스냅샷을 집계해 DB에 저장하고,  
관리자 대시보드(`/lab`)는 스냅샷을 읽어 표시한다.
