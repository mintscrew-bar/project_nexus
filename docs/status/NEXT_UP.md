# 다음 할 일 (통합 백로그)

> 작성일: 2026-09-03
> 근거: `docs/features/*` 전체와 `docs/status/*` 를 코드·운영 DB·호스트와 대조한 결과
>
> 각 항목의 상세 설계는 원본 문서에 있다. 여기는 **무엇을 먼저 할지**만 정리한다.
> 원본과 어긋나면 원본이 아니라 이 문서를 먼저 고친다.

---

## 이번 검증에서 정리된 것 (참고)

문서가 코드보다 뒤처져 있던 항목들을 실제 구현에 맞춰 갱신했다. 되짚을 필요 없는 것들:

- 방송 오버레이는 문서상 Phase 4~6이 미착수였지만 **사실상 완료** 상태였다.
  Result Toast·Bracket/Result/Break scene·전환 레이어가 다 있고, 호스트 조작 UI는
  `/broadcast-control` 패널로 나왔다. 계획에 없던 scene 7종과 컨트롤 모드·외부 조작
  토큰(스트림덱 webhook)까지 붙어 있다.
- 방 목록 델타 업데이트, 소켓 lazy connect는 이미 되어 있었다.
- 운영 DB 마이그레이션 미적용 0건 — 여러 문서의 "migrate deploy 필요" 경고는 모두 해소.
- 베타 배포 준비 항목 6개는 전부 완료(Lightsail 대신 자택 WSL2 상주, Caddy 대신 nginx+Cloudflare Tunnel).
- 대량 매치 수집 파이프라인은 Lab 폐기와 함께 **제거**됐다. `TODO_matches_crawling.md` 는
  `docs/archive/` 로 옮겼다.

---

## P0 — 데이터 유실 위험

- [ ] **DB 자동 백업** ([TODO_improvements](../features/TODO_improvements.md) Task 6)
  - 지금 Postgres 데이터는 컨테이너 볼륨 한 벌뿐이다. 주기 백업이 없다.
  - `scripts/deploy.sh:52` 의 배포 직전 `pg_dump` 가 유일한 백업이었는데, 배포가
    GitHub Actions 로 넘어가면서 그 스크립트는 더 이상 실행되지 않는다.
  - 할 일: `scripts/ops/` 에 `pg_dump | gzip` 스크립트 + cron, 보관 주기(7일/30일) 결정,
    호스트 밖 사본 위치 결정. 복원 절차를 한 번 실제로 돌려볼 것.

---

## P1 — 이미 짜둔 운영 스크립트가 안 돌고 있음

세 항목이 얽혀 있어 한 번에 처리하는 게 낫다. ([TODO_server_reliability](../features/TODO_server_reliability.md))

- [ ] **디스크 정리 스크립트 통합** (Task 1)
  - `scripts/disk-cleanup.sh`(구, crontab 04:00 등록됨) 와
    `scripts/ops/nexus-cleanup.sh`(신, 미설치) 가 기능이 겹친 채 공존한다.
  - 한 벌로 합치고 `/etc/cron.daily/` 에 설치. 각각의 고유 기능(캐시 정리·Discord 보고 /
    `until=24h` 필터)은 살릴 것.
- [ ] **Discord 웹훅 URL 을 crontab 평문에서 env 파일로 분리** (Task 1 부수)
- [ ] **디스크 사용량 알림 설치** (Task 3) — `/etc/nexus-disk-alert.env` + cron. 지금은 죽은 코드다.
- [ ] **`DEPLOY_ALERT_DISCORD_WEBHOOK` 시크릿 등록 여부 확인** (Task 13) — 저장소 밖이라 코드로 확인 불가

## P1 — 사람이 직접 해야 하는 검증 (코드는 다 됐음)

전부 "구현 끝, 실사용만 안 해봄" 상태다. 이게 밀려서 기능 신뢰도가 안 올라간다.

- [ ] **방송 오버레이 OBS 실사용 테스트** ([TODO_broadcast_overlay](../features/TODO_broadcast_overlay.md) Task 10)
      — 남은 방송 작업들의 실질 블로커
- [ ] **스트리머 라이브 감지 실사용 검증** ([TODO_streamer_live](../features/TODO_streamer_live.md) Task 13)
      — 실제 채널 인증 → 방송 켜기 → LIVE 뱃지 확인
- [ ] **가위바위보 진영 선택 실테스트** — 팀장 2명 필요. 빌드·배포는 끝났고 실검증만 남음
- [ ] **알림 end-to-end 점검** ([TODO_improvements](../features/TODO_improvements.md) Task 3)
      — 수신·읽음 처리·클릭 이동 전 구간
- [ ] **E2E 통합 테스트 (10인 방, 경매·드래프트 전 과정)** + 모바일 브라우저 확인
      ([PROJECT_STATUS](./PROJECT_STATUS.md))

---

## P2 — 기능 마무리 (작고 명확함)

- [ ] 방송: focus 전환 연출 — 상단 바만 갈아끼우기 (broadcast Task 14)
- [ ] 방송: 오버레이 위치 조절 옵션 `overlayAnchor`/`offset`/`scale` (broadcast Task 21)
      — OBS 가이드 자체는 설정 > 방송 탭에 이미 있다
- [ ] 방송: 경매 다음 매물 `layoutId` 마이크로 전환 (broadcast Task 20)
- [ ] 시리즈: **결과 오보고 정정** ([TODO_series_match](../features/TODO_series_match.md) Task 17)
      — Bo5 한 세트 잘못 보고하면 시리즈 전체가 틀어진다. P2 중에선 이게 가장 아프다
- [ ] 시리즈: 세트 단위 무효 처리 / 재생성 (리메이크 대응) (Task 18)
- [ ] 시리즈: 관리자 매치 탭 · `guide/match-flow` 문서 갱신 (Task 19)
- [ ] 전적: 매치 히스토리 시각화 — 팀원별 기여도 차트, 전적 카드에 MVP/ACE 배지
      ([TODO_improvements](../features/TODO_improvements.md) Task 5)

## P2 — 원격 복구 채널 (2026-05-09 사고 재발 대비)

빌드가 GitHub runner 로 빠지면서 원인 자체는 크게 줄었지만, 사고 시 복구 경로는 여전히 Tailscale 하나뿐이다.

- [ ] 컨테이너 자가 복구 강화 — autoheal 또는 healthcheck 실패 핸들러 (server_reliability Task 7)
- [ ] tailscaled 자동 재시작 watchdog (Task 6)
- [ ] Discord 봇 ops 명령 (`/ops restart web` 등) (Task 11)
      — SSH 가 죽어도 봇은 살아 있던 게 지난 사고의 교훈
- [ ] Cloudflare Tunnel SSH 라우트 (Task 9)
- [ ] Uptime Kuma 알림 채널 연결 (Task 12) / 핵심 메트릭 대시보드 (Task 14)
- [ ] swap 4G 적용 (Task 4) — `sudo bash scripts/ops/setup-swap.sh` 한 줄. 빌드 분리로 급하진 않음
- [ ] Wake-on-LAN (Task 10) — 물리 접근 대체 수단

---

## P3 — 수요 확인 후

- [ ] 시리즈 MVP (현재 MVP/ACE 투표는 게임 단위) — series Task 22
- [ ] 더블 엘리미네이션 다전제 + 20·40명 DE 프리셋 — series Task 20
- [ ] 그랜드파이널 브래킷 리셋 — series Task 21 (필요성부터 확인)
- [ ] 스트리머 폴링 대상 좁히기 — streamer Task 15 (스트리머 수가 늘면)
- [ ] 유튜브 라이브 지원 — streamer Task 16 (쿼터 설계 선행)
- [ ] 매치 리미터 인메모리 → Redis — riot revamp Task 18 (클러스터 전환 시 필수)
- [ ] AdSense 하이드레이션 불일치 — 레이아웃 raw script 를 `next/script` 로 (보류 중)

## 폐기 / 보류

- **Lab 대시보드** — 기능 제거됨. 되살리려면 퍼스널 키 전역 캡 위에서 재설계 필요
- **대량 매치 수집 파이프라인** — `docs/archive/TODO_matches_crawling.md`
- **스트리머 모드(호스트 방송 polish)** — 보류. 방송 오버레이가 상당 부분 대체
- **Vercel 이전** — 실측 트래픽 대비 비용이 안 맞아 보류. 트래픽 10배 후 재검토
