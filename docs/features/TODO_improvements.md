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

- [ ] Task 6: DB 자동 백업 ★ **현재 남은 항목 중 위험도 1순위**
  - 주기 백업이 **없다**. `scripts/deploy.sh:52` 의 배포 직전 `pg_dump` 가 전부인데,
    배포가 GitHub Actions(`deploy.yml`)로 넘어가서 그 스크립트는 더 이상 돌지 않는다.
  - 즉 지금 Postgres 데이터는 컨테이너 볼륨 한 벌뿐 → 볼륨 손상 = 전손.
  - 주기적 `pg_dump | gzip` → 호스트 경로 + 외부 스토리지 cron 추가
  - **위치**: `scripts/ops/` 에 백업 스크립트 + cron (디스크 정리 스크립트와 같은 방식)
