- [ ] **`riot_match_cache` 정리 실행** — 검증 끝, 실행만 남음
  - `scripts/ops/purge-riot-match-cache.sh --apply` (드라이런이 기본값)
  - 101,292건 / 4.8GB 삭제. 보호되는 것: 미인제스트 61건, 최근 14일 1,340건
  - 앱 코드의 `TasksService.runRiotMatchCacheCleanup()` 과 완전히 같은 조건이다.
    그 크론은 `RIOT_MATCH_CACHE_CLEANUP_ENABLED` 가 `false` 라 한 번도 돈 적이 없다.
  - **앞으로도 자동으로 돌게 하려면** GitHub Secret `RIOT_MATCH_CACHE_CLEANUP_ENABLED` 를
    `true` 로 바꿔야 한다 (`.env.production` 은 배포 때마다 Secrets 에서 재생성된다).
  - 전체 백업 확보됨: `~/nexus-backups/weekly/db-full-20260903-090005.sql.gz` (1.1GB)

> **정정**: 앞서 "죽은 데이터 6.6GB" 라고 했는데 절반은 틀렸다.
> 지워도 되는 건 `riot_match_cache` 4.8GB(원본 JSON, 정형화 후 중복)뿐이다.
> `match_participants`(1.6GB)와 `known_puuids`(192MB)는 **살아 있는 기능이 읽는다** —
> ranking.service, user.service, stats.service, match.service 등 10곳 이상에서
> 전적·랭킹·챔피언 통계·"부분 통계" 판정에 쓰인다. 지우면 기능이 깨진다.

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

## 완료 (2026-09-03 이 세션에서 처리)

- [x] **DB·업로드 자동 백업** — `scripts/ops/nexus-backup.sh`, 매일 03:30.
      core(매일 220MB/54초) + full(주간) 2단계. 임시 DB 복원으로 검증까지 마쳤다.
- [x] **디스크 정리 스크립트 통합** — 갈라져 있던 두 벌을 하나로. 구버전 삭제.
- [x] **디스크 경고 설치** — 30분 주기, 80% 임계. 작성만 되고 안 돌던 것을 실제로 걸었다.
- [x] **웹훅을 crontab 평문 → `~/.config/nexus-ops.env`(0600)**
- [x] **Uptime Kuma 알림** — 확인해 보니 이미 Discord 로 6개 모니터 전부 연결돼 있었다
- [x] **swap 4G** — 불필요로 종결. 빌드가 CI 로 빠져 OOM 요인이 사라졌다(available 10Gi, OOM 0건)
- [x] **핵심 메트릭 대시보드** — Kuma + 디스크 알림으로 커버. Grafana 는 이 규모에 과하다

설치 확인: `scripts/ops/install-cron.sh --show`

---

## P0 — 남은 데이터 위험

- [ ] **백업 호스트 밖 사본** — `NEXUS_BACKUP_RSYNC_TARGET` 이 비어 있어 백업이 운영 호스트에만 있다.
  볼륨 손상은 막지만 호스트 전손은 못 막는다. **목적지 결정이 필요하다**(NAS / 외장 디스크 /
  클라우드 오브젝트 스토리지 / 다른 PC). core 덤프가 220MB 라 어디든 부담은 없다.

- [ ] **R2 버킷 보호** — 운영이 `UPLOAD_DRIVER=r2` 라 사용자 업로드(클랜 로고·배너 등) 원본이
  Cloudflare R2 에 있고, 위 백업은 이걸 포함하지 않는다. 로컬 `uploads` 볼륨은 비어 있다(0개 파일).
  버킷 버저닝을 켜거나 rclone 주기 동기화를 붙여야 한다.

- [ ] **운영 DB 의 죽은 데이터 정리** — 결정 필요
  - DB 6.7GB 중 6.6GB 가 폐기된 Lab 인제스트 잔재다.
    `riot_match_cache` 4.8GB(102,693행), `match_participants` 1.6GB(1,075,950행 전부 외부),
    `known_puuids` 192MB, 외부 `matches` 107,545행.
  - 실제로 대체 불가능한 데이터는 **2.0MB** 다 (유저 387, 클랜 10, 방 4, 채팅 1842,
    내전 매치 19, 내전 참가자 10).
  - 지우면 DB 6.7GB → 약 50MB, 백업 220MB → 2MB, 덤프 54초 → 1초 미만.
  - 다만 **되돌릴 수 없다.** 전적 기능이 이 캐시를 읽고 있는지 먼저 확인해야 한다
    (`riot-match-cache-ingest.service.ts` 의 */5 크론이 여전히 쓰고 있다).

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

- [ ] **컨테이너 자가 복구** — healthcheck 는 5개 서비스에 있는데 unhealthy 를 보고
      재시작해 줄 주체가 없다. autoheal 컨테이너 추가 (server_reliability Task 7)
- [ ] **tailscaled watchdog** — systemd 는 `Restart=on-failure` 라 죽으면 살아나지만
      응답 없이 매달리면 감지 못 한다 (Task 6)
- [ ] Discord 봇 ops 명령 (`/ops restart web` 등) (Task 11)
      — SSH 가 죽어도 봇은 살아 있던 게 지난 사고의 교훈
- [ ] Cloudflare Tunnel SSH 라우트 (Task 9) — **저장소 밖 작업**.
      cloudflared 가 `TUNNEL_TOKEN` 원격 관리형이라 Cloudflare Zero Trust 대시보드에서 설정한다
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
