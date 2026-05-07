# 개선 TODO

> 작성일: 2026-05-07
> 우선순위별 개선 항목 목록

---

## 즉시 효과 (작업량 작음)

- [ ] Task 1: 소켓 네임스페이스 Lazy Connect
  - 현재 앱 진입 시 `/room`, `/clan`, `/dm`, `/notification`, `/presence` 등 9개 네임스페이스를 한꺼번에 연결
  - 게임 단계별 필요한 시점에만 connect/disconnect 하도록 변경
  - **위치**: `apps/web/src/lib/socket-client.ts`
  - **효과**: 초기 연결 비용 감소, 불필요한 TCP 오버헤드 제거

- [ ] Task 2: 방 목록 Delta Update
  - 현재 join/leave 이벤트마다 전체 방 목록 DB 쿼리 후 전체 구독자에게 브로드캐스트
  - 변경된 방 정보만 전송하도록 변경
  - **위치**: `apps/api/src/modules/room/room.gateway.ts`
  - **효과**: DB 부하 감소, 브로드캐스트 페이로드 축소

---

## UX 개선 (중간 작업량)

- [ ] Task 3: 알림 end-to-end 점검
  - 실시간 알림 수신 여부, 읽음 처리, 클릭 시 해당 페이지 이동 전체 플로우 검증
  - 알림 드로어/페이지 완성도 확인

- [ ] Task 4: Lab 대시보드 리팩터
  - `TODO_lab_dashboard_refactor.md` 참조
  - 색상 토큰 미사용 → design system 토큰으로 교체
  - 챔피언 상세 모달 → URL 기반 페이지로 전환 (공유/뒤로가기 지원)
  - 오라클 입력 자동완성 (방/경기에서 자동 채우기)
  - **위치**: `apps/web/src/app/lab/`

- [ ] Task 5: 매치 히스토리 시각화 개선
  - 팀원별 기여도 차트 (딜량, 힐량, 탱킹)
  - MVP/ACE 배지를 전적 카드에 연동

---

## 인프라/안정성

- [ ] Task 6: DB 자동 백업
  - 현재 Postgres 볼륨이 컨테이너에만 존재 → 서버 장애 시 데이터 손실 위험
  - 주기적 `pg_dump` → 로컬 경로 또는 외부 스토리지 저장 cron 추가
  - **위치**: `docker-compose.prod.yml` 또는 별도 백업 스크립트
