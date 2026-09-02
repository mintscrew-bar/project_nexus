# 개선 TODO

> 작성일: 2026-05-07
> 최종 검증: 2026-09-03 (코드·운영 호스트 대조)
> 우선순위별 개선 항목 목록

---

## 즉시 효과 (작업량 작음)

- [x] Task 1: 소켓 네임스페이스 Lazy Connect
  - 작성 당시 서술("9개 네임스페이스를 한꺼번에 연결")은 이미 사실이 아니다.
    `socket-client.ts` 상단 주석대로 소켓이 두 그룹으로 나뉘어 있다.
  - **게임 소켓**(auction / snakeDraft / match / roleSelection)은 해당 단계에서만
    connect 하고 단계 종료 시 disconnect 한다. room 은 방 입장/퇴장에 붙어 있다.
  - **상시 소켓**(presence / notification / dm / clan)은 의도적으로 유지한다.
    온라인 표시·실시간 알림·DM 은 페이지와 무관하게 살아 있어야 하는 기능이라
    lazy 로 바꾸면 기능이 깨진다. 여기까지가 이 항목의 종착점이다.
  - **위치**: `apps/web/src/lib/socket-client.ts`

- [x] Task 2: 방 목록 Delta Update
  - `room.gateway.ts` 의 `roomListDeltaTimers` 로 방별 디바운스 후
    `room-list-updated` 로 **변경된 방 하나만** 브로드캐스트한다(생성/갱신/삭제 구분).
  - **위치**: `apps/api/src/modules/room/room.gateway.ts`

---

## UX 개선 (중간 작업량)

- [ ] Task 3: 알림 end-to-end 점검
  - 실시간 알림 수신 여부, 읽음 처리, 클릭 시 해당 페이지 이동 전체 플로우 검증
  - 알림 드로어/페이지 완성도 확인

- [x] ~~Task 4: Lab 대시보드 리팩터~~ — **폐기**
  - Lab 기능 자체가 제거됐다(`apps/web/src/app/lab/`, `lab-tasks.service.ts` 모두 없음).
    퍼스널 키 예산을 전적 쪽으로 돌리면서 접은 결정이라 리팩터 대상이 존재하지 않는다.
  - 되살릴 경우 `TODO_riot_account_identity_revamp.md` 의 전역 레이트 캡 전제부터 다시 짜야 한다.

- [ ] Task 5: 매치 히스토리 시각화 개선
  - MVP/ACE 배지는 `MatchDetailModal`·`RiotMatchList`·관리자 매치 탭에 이미 있다.
    남은 건 **전적 카드 레벨**에서의 노출과 팀원별 기여도 차트(딜량/힐량/탱킹)다.
  - 위치: `apps/web/src/components/matches/RiotMatchList.tsx`,
    `apps/web/src/app/matches/match/[matchId]/_MatchDetailsClient.tsx`

---

## 인프라/안정성

- [x] Task 6: DB 자동 백업 (2026-09-03 완료)
  - `scripts/ops/nexus-backup.sh` — 매일 03:30 cron (`install-cron.sh`).
  - **2단계 구조로 나눴다.** 실측해 보니 DB 6.7GB 중 `riot_match_cache` 가 4.8GB 로,
    폐기된 Lab 인제스트가 남긴 외부 매치 원본 JSON 이었다. 전체 덤프는 700MB·4분이 넘어
    매일 돌리면 결국 백업을 꺼버리게 되는 크기다.
    - `db-core-*.sql.gz` — 매일. `--exclude-table-data=riot_match_cache`. **220MB / 54초**
    - `db-full-*.sql.gz` — 일요일만. 캐시까지 포함
    - `uploads-*.tar.gz` — 업로드 볼륨 폴백. **운영에서는 사실상 빈 파일이다**:
      운영이 `UPLOAD_DRIVER=r2` 라 실제 파일은 Cloudflare R2 버킷에 있고 볼륨은 0개다.
      로컬 드라이버 환경용으로만 의미가 있다.
  - 보관: core 14벌, full 3벌. 실패 시에만 Discord 알림(매일 오는 성공 알림은 곧 무시하게 된다).
  - **복원 검증 완료** — 임시 DB 로 실제 복원해 행 수를 대조했다.
    users 387 / clans 10 / rooms 4 / chat 1842 / 내전매치 19 / 내전참가자 10 전부 일치.
    절차는 [RECOVERY_PLAYBOOK.md](../setup/RECOVERY_PLAYBOOK.md) §2-1.
  - ⚠️ **남은 구멍 2가지**
    1. `NEXUS_BACKUP_RSYNC_TARGET` 미설정 → 백업이 이 호스트에만 있다. 볼륨 손상에는
       대응하지만 호스트 전손에는 대응하지 못한다. 외부 목적지 결정 필요.
    2. **R2 버킷은 이 백업에 포함되지 않는다.** 클랜 로고·배너 등 사용자 업로드 원본이
       거기 있다. 버킷 버저닝을 켜거나 rclone 주기 동기화가 필요하다.
