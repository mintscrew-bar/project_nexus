- [ ] **PUBG 확장 — Phase 1 라우팅 안정화** ([상세 기획](../features/TODO_pubg_expansion.md))
  - `/lol/*`·`/pubg/*` 게임 컨텍스트 유지, 기존 롤 URL 리다이렉트
  - 롤/배그 프로필·호버 프로필·계정 등록 모달 분리
  - 공통 영역은 유지하되 계정·전적·랭킹 데이터는 게임별로만 조회
  - PUBG 방 생성에 경기 모드·팀 크기·팀 수·스팀/카카오 필수 설정
  - 방 제목 `[스배]`/`[카배]` 접두사, 목록·로비·Discord 플랫폼 표시
  - 기존 경매·스네이크·순환·오토 밸런스·수동 팀 배정을 게임별 팀 크기로 일반화

- [ ] **PUBG 확장 — 계정·프로필 기반**
  - `PubgAccount`와 공식 랭크 스냅샷 추가
  - PUBG 닉네임 조회와 Steam/Kakao 샤드 탐색·캐시
  - 공식 PUBG 랭크와 NEXUS `1티어·2티어` 편성 등급 분리
  - 초기 편성 등급은 운영자 지정, 이후 평균 순위·킬·내전 성적으로 자동화

- [ ] **PUBG 확장 — 실제 경기 MVP**
  - 킬내기: 기존 2팀 경기·다전제·결과 보고 재사용
  - 배틀로얄 내전: 다팀·다라운드·순위/킬 누적 리더보드 신규 구현
  - 자동 매칭은 커스텀 매치 실측 전까지 보류하고 수동 매치 ID 입력 경로 우선 제공

- [ ] **`riot_match_cache` purge 실행** — 준비 끝, 실행만 남음
  - `! ./scripts/ops/purge-riot-match-cache.sh --apply` (권한 분류기가 막아 대신 실행 필요)
  - 대상 101,466건 / 보호: 미인제스트 61, 최근 14일 1,295, **미아카이브 0**
  - 선행 작업 완료: 원본 전량을 `RiotMatchArchive` 로 압축 보존(4,797MB → 1,149MB, 4.2배).
    challenges 129키·미보유 루트필드·teams 전부 보존. 검증 통과(커밋 72d0faaf).
  - 삭제 가드 3중(TTL + 정형화 + 아카이브)으로 강화 — 아카이브 안 된 매치는 안 지워진다
  - 코드 변경(인제스트 아카이브 기록, 가드)은 **배포돼야** 신규 매치에 적용된다
  - 전체 백업 확보됨: `~/nexus-backups/weekly/db-full-20260903-090005.sql.gz` (1.1GB)

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
