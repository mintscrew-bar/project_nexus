# 행동 이벤트 로그 설계 (구현 보류)

> 상태: **설계만.** 트래픽이 늘면 구현을 다시 결정한다. 관리자 개선안 Task 12.

## 왜 필요한가

지금 알 수 있는 건 방이 끝난 뒤의 결과(`RoomOutcome`)와 유저의 마지막 접속 시각뿐이다.
"누가 어느 단계에서 나갔나"는 모른다. 내전이 안 이뤄지는 병목(메모리 `conversion_baseline_2026_05`)이
정원 미달인지, 경매 도중 이탈인지, 대기 중 포기인지 구분할 수 없다. 방과 참가 이력은 방과 함께 지워지므로
**나중에 되살릴 수 없고, 쌓아 둔 만큼만 분석할 수 있다.**

## 기록할 이벤트 (서버 이벤트만, 클릭·페이지뷰는 제외)

| 이벤트 | 시점 | 담는 값 |
| --- | --- | --- |
| `room.created` | 방 생성 | roomId, game, 예약 여부 |
| `room.joined` / `room.left` | 입장·퇴장 | roomId, 그 시점 인원, 퇴장 사유(직접·강퇴·연결 끊김) |
| `room.ready` | 준비 토글 | roomId, 준비 인원 |
| `room.started` | 시작 | roomId, 인원 |
| `phase.entered` | 팀 구성·경매·역할 선택 진입 | roomId, phase |
| `phase.abandoned` | 단계 중 인원 이탈로 중단 | roomId, phase, 남은 인원 |
| `match.completed` | 결과 확정 | roomId, matchId 또는 scrimId |

개인 식별은 `userId` 하나만 쓴다. 닉네임·IP·UA·채팅 내용은 담지 않는다.

## 저장

```
model UserEvent {
  id        BigInt   @id @default(autoincrement())
  at        DateTime @default(now())
  userId    String?          // 시스템 이벤트는 null, 유저 삭제 시 SetNull
  roomId    String?          // FK 아님 — 방은 지워진다
  game      GameTitle?
  type      String           // 위 표의 이름
  data      Json?            // 작은 부가 값 (길이 제한)
  @@index([type, at])
  @@index([userId, at])
}
```

- 쓰기는 **요청을 막지 않는다.** 메모리 큐에 모아 1~2초마다 `createMany`. 실패는 로그만 남기고 버린다(분석용 부가 기록).
- 소켓 핸들러가 이미 한 일(입장·준비)을 기록만 하므로 게임 흐름에는 손대지 않는다.

## 용량 추정

내전 1판당 대략 10명 × (입장·준비·퇴장) + 단계 이벤트 ≈ **50~80행**. 하루 50판이면 하루 3~4천 행,
1년 약 130만 행, 행당 약 100바이트면 **약 130MB**. 현재 운영 DB 실데이터가 2MB 수준이라
(메모리 `prod_db_composition_and_backup`) 부담이지만 감당 가능한 크기다. 백업은 core 범위에 넣지 않는다.

## 보존

- 원본: **90일**. 그 뒤 일별 집계(`AdminDailyStat` 같은 요약 테이블)만 남기고 삭제.
- 삭제는 일 1회 배치, `RiotMatchCache` TTL 정리와 같은 방식(락, 한 번에 N천 행).

## 개인정보

- 유저 삭제·탈퇴 시 `userId` 를 null 로 끊는다(SetNull). 이벤트 자체는 통계로 남는다.
- 약관의 수집 항목에 "서비스 이용 기록(방 참가·이탈 시각)"이 있는지 구현 전에 확인한다. 없으면 먼저 개정한다.

## 구현 시작 조건

- 주간 활성 유저가 의미 있게 늘어(현재는 한 자릿수) 퍼널 비율이 통계적으로 읽힐 때.
- 그 전에는 `RoomOutcome` 의 "빈 방으로 종료 / 정원 찬 채 종료" 비율로 병목의 위치를 먼저 본다.

## 열린 결정

- 퇴장 사유를 어디서 구분할 것인가(소켓 disconnect 와 명시적 leave 를 갈라야 한다).
- 이벤트 이름을 `@nexus/types` 에 상수로 둘 것인가(프런트 이벤트와 섞이지 않게).
