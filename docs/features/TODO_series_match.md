# 내전 다전제 (3판 2선 / 5판 3선)

> 작성일: 2026-08-05
> 상태: 1단계 구현 완료 (API 테스트 238개·전체 린트·프로덕션 빌드 통과)
>
> **남음:** 실제 방으로 Bo3를 끝까지 돌려보는 E2E 확인. 스키마 변경분은 운영 DB에 `migrate deploy` 필요.

---

## 한 줄 정의

지금 내전은 **대진 슬롯 하나 = 게임 하나(단판)** 로 고정돼 있다. 이걸 "4강 3판 2선, 결승 5판 3선" 같은 **라운드별 다전제**로 확장한다.

## 왜 설정 하나로 안 되는가

"1승 = 진출"이 코드에 박혀 있다.

- [`match-bracket.service.ts`](../../apps/api/src/modules/match/match-bracket.service.ts) — 대진 생성기가 슬롯마다 `Match` row를 정확히 하나씩 만든다.
- [`match.service.ts`](../../apps/api/src/modules/match/match.service.ts) `reportMatchResult` — 게임 결과 하나를 받자마자 곧바로 `advanceWinnerToNextRound`를 호출한다. 다전제가 들어갈 자리가 없다.
- [`match-advancement.service.ts`](../../apps/api/src/modules/match/match-advancement.service.ts) `checkBracketCompletion` — 완주 판정이 "모든 Match가 COMPLETED인가". 2-0으로 끝나 3세트를 안 치르면 영원히 안 끝난다.
- [`match.gateway.ts`](../../apps/api/src/modules/match/match.gateway.ts) `emitTournamentCompleted` — 최종 순위가 Match 단위 승수 집계. Bo3에서 2-1로 이긴 팀이 "2승 1패"로 잡혀 순위가 뒤섞인다.
- 진영(블루/레드)은 Match 1개당 가위바위보 1회.

## 결정 사항

- **`MatchSeries` 테이블을 신설한다.** `Match`의 컬럼 대부분(`tournamentCode`, `riotMatchId`, `blueSideTeamId`, `MatchParticipant`, MVP/ACE 투표 등)이 이미 게임 단위라, Match를 게임으로 두고 대진 슬롯을 부모로 올리는 게 자연스럽다.
- **`round` / `matchNumber` / `bracketRound`는 Match에도 미러링해서 남긴다.** 방송 오버레이·관리자 탭·전적 수집처럼 읽기만 하는 경로를 건드리지 않기 위해서다. 진출·완주 판정 같은 쓰기 경로만 시리즈 기준으로 옮긴다.
- **`bestOf`는 대진 생성 시점에 각 시리즈 row에 확정해 써넣는다.** SE는 라운드 번호, DE는 섹션 문자열, 리그전은 전부 `round: 1`이라 런타임에 "이 매치의 bestOf가 뭐지"를 되짚으면 키 체계가 셋 다 달라 지저분해진다. Room에는 프리셋만 저장하고 생성기가 해석한다.
- **포맷은 프리셋으로만 고른다.** 각 프리셋에 예상 경기 수를 같이 보여준다.
- **프리셋 목록은 룸 사이즈(=팀 수)별로 다르다.** 10명 방에는 "결승만 3판 2선" 같은 게 성립하지 않고, 40명 방에 "전 경기 3판 2선"을 열어주면 최대 21게임이 나온다. [`RoomCreationForm`](../../apps/web/src/components/rooms/RoomCreationForm.tsx)의 `PLAYER_OPTIONS`가 이미 `teams` / `supportsDE`를 들고 있으니 같은 테이블에 프리셋을 매단다.
- **2세트부터 진영은 직전 세트 패자가 고른다** (LCK 방식). 기존 RPS의 `side` 페이즈 UI를 패자 팀장에게만 열어주면 되므로 자동 스왑과 비용 차이가 크지 않다. 타임아웃 시 폴백은 자동 스왑.
- **미실시 세트는 아예 만들지 않는다.** 2-0으로 끝난 시리즈의 3세트를 미리 만들어두면 완주 판정에서 빼는 예외 처리가 계속 따라붙고 토너먼트 코드도 낭비된다.
- **1차 범위는 SINGLE_ELIMINATION + 2팀 단판방까지.** 더블 엘리미네이션과 리그전은 기존 단판을 유지한다. 이것만으로 "결승만 3판 2선", "4강 3판 2선 + 결승 5판 3선"이 모두 된다.
- **`bestOf=1`이면 시리즈 = 매치 1:1이라 기존과 완전히 동일하게 동작해야 한다.** 이게 회귀 방지의 기준선이다.

## 룸 사이즈별 프리셋

게임 수는 (최소 ~ 최대). 게임당 30분 기준으로 시간을 같이 적었다.

### 10명 · 2팀 (슬롯 1개)

"결승만" 같은 구분이 없으므로 시리즈 길이만 고른다.

| 프리셋 | 게임 수 | 예상 시간 |
|---|---|---|
| 단판 (기본) | 1 | ~0.5h |
| 3판 2선 | 2~3 | 1~1.5h |
| 5판 3선 | 3~5 | 1.5~2.5h |

### 20명 · 4팀 (준결승 2 + 결승 1)

| 프리셋 | 게임 수 | 예상 시간 |
|---|---|---|
| 전 경기 단판 (기본) | 3 | ~1.5h |
| **결승만 3판 2선** (권장) | 4~5 | 2~2.5h |
| 결승만 5판 3선 | 5~7 | 2.5~3.5h |
| 준결승 3판 2선 + 결승 5판 3선 | 7~11 | 3.5~5.5h |
| 전 경기 3판 2선 | 6~9 | 3~4.5h |

### 40명 · 8팀 (8강 4 + 4강 2 + 결승 1)

| 프리셋 | 게임 수 | 예상 시간 |
|---|---|---|
| 전 경기 단판 (기본) | 7 | ~3.5h |
| **결승만 3판 2선** (권장) | 8~9 | 4~4.5h |
| 결승만 5판 3선 | 9~11 | 4.5~5.5h |
| 4강부터 3판 2선 | 10~13 | 5~6.5h |

"전 경기 3판 2선"(14~21게임, 7~10.5시간)과 "4강 3판 2선 + 결승 5판 3선"(11~17게임)은 **8팀에서 제공하지 않는다.** 완주가 사실상 불가능한 길이다.

### 15명·30명 (리그전)

1차 범위 밖. 프리셋 UI를 숨기고 단판 고정으로 둔다. 리그전 3판 2선은 경기 수가 팀 수 제곱에 비례해 폭증한다(6팀이면 최대 45게임).

### 크기 변경 시

방 만들 때든 대기 중 설정 변경이든 **룸 사이즈를 바꾸면 프리셋 목록이 갈아끼워진다.** 이전 선택이 새 크기에서 유효하지 않으면 "전 경기 단판"으로 리셋한다. 서버도 같은 검증을 해야 한다 — 안 그러면 10명 방에 "4강 3판 2선"이 들어온다.

## 소요 시간 주의

4팀 기준 지금은 3게임(약 1.5시간)인데, "준결승 Bo3 + 결승 Bo5"면 최대 11게임 — 5.5시간이다. 아마추어 내전에서 완주율이 걱정되는 길이라 기본값은 단판, 권장은 "결승만 3판 2선"으로 민다. 프리셋 선택 UI에 예상 시간을 같이 노출해서 호스트가 감을 잡게 한다.

## 작업 목록

### 1단계 — 다전제 동작

- [x] Task 1: `MatchSeries` 스키마 추가 + `Match.seriesId` / `Match.gameNumber` / `Room` 프리셋 컬럼
- [x] Task 2: 룸 사이즈별 프리셋 테이블 정의 (`packages/types`에 두고 웹·API가 공유) — 팀 수 → 프리셋 목록 → 라운드별 `bestOf`, 예상 게임 수
- [x] Task 3: 대진 생성기를 시리즈 기준으로 전환 (`generateSingleMatch`, `generateSingleElimination`, `generatePowerOf2Elimination`) — 시리즈 + 각 시리즈의 1세트 Match 생성, 프리셋 → `bestOf` 해석
- [x] Task 4: `match-series.service.ts` 신설 — 시리즈 집계, 클린치 판정, 다음 세트 생성 (`match.service.ts`가 이미 1481줄이라 분리)
- [x] Task 5: `reportMatchResult` 분기 — 게임 기록 → 시리즈 집계 → 클린치면 진출 / 아니면 다음 세트 준비. 알림 문구도 "N세트 승리"와 "시리즈 승리" 구분
- [x] Task 6: 진출·완주 판정을 시리즈 기준으로 (`advanceWinnerToNextRound`, `checkBracketCompletion`)
- [x] Task 7: 최종 순위 집계를 시리즈 승 기준으로 (`emitTournamentCompleted`)
- [x] Task 8: 2세트부터 직전 세트 패자에게 진영 선택권 — RPS `side` 페이즈 재사용, 타임아웃 시 자동 스왑
- [x] Task 9: 전적 수집 riotMatchId 중복 할당 방지 (아래 "먼저 막아야 할 것" 참고)
- [x] Task 10: 방 생성·설정 UI에 프리셋 선택 — 룸 사이즈에 맞는 목록만 노출, 예상 게임 수·시간 표시, 크기 변경 시 재검증/리셋 (`RoomCreationForm`, `RoomSettingsModal`)
- [x] Task 11: 서버 측 프리셋 검증 — 팀 수와 프리셋 조합이 유효한지 (`create-room.dto.ts`, `room.service.ts`의 방 설정 수정 경로)
- [x] Task 12: 대진표 UI에 시리즈 스코어 — `BracketView`의 `TeamSlot`에 이미 `team.score` 렌더 자리가 있는데 Team 모델엔 `score`가 없어 늘 비어 있다. 그 자리를 그대로 쓴다
- [x] Task 13: `MatchDetailModal`에 세트 목록/탭 + 세트별 결과 보고
- [x] Task 14: `bracket/page.tsx` 통계 카드를 "총 시리즈 / 총 경기"로 분리, `match-store` 시리즈 상태
- [x] Task 15: `bestOf=1` 회귀 검증 — 기존 단판 흐름이 완전히 동일하게 동작하는지

### 2단계 — 운영 편의

- [ ] Task 16: 방송 오버레이에 시리즈 스코어 (`scenes.tsx`, `broadcast-control`)
- [ ] Task 17: 결과 오보고 정정 — Bo5 2세트를 잘못 보고하면 시리즈 전체가 틀어지므로 다전제에서 필요도가 올라간다
- [ ] Task 18: 세트 단위 무효 처리 / 재생성 (리메이크 대응)
- [ ] Task 19: 관리자 매치 탭·`guide/match-flow` 문서 갱신

### 3단계 — 확장

- [ ] Task 20: 더블 엘리미네이션 다전제 (섹션별 bestOf) — 20명·40명 방의 DE 프리셋도 이때 추가
- [ ] Task 21: 그랜드파이널 브래킷 리셋 (승자조 어드밴티지) — 별건, 필요성부터 확인
- [ ] Task 22: 시리즈 MVP (현재 MVP/ACE 투표는 게임 단위)

## 먼저 막아야 할 것 — 전적 수집 오염

Riot 퍼스널 키 상황이라 Tournament API가 아니라 PUUID 크로스레퍼런스로 게임을 찾는다. 탐색 창이 `startedAt - 5분 ~ completedAt + 20분`인데([`match-data-collection.service.ts`](../../apps/api/src/modules/match/match-data-collection.service.ts)), 같은 10명이 연달아 3판을 하면 1세트 게임이 2세트 탐색 창에 그대로 들어온다. 게다가 **이미 다른 Match에 할당된 `riotMatchId`를 제외하는 가드가 없다.**

다전제를 켜기 전에 반드시 넣어야 한다 (Task 9). 안 넣으면 세트 2·3의 전적이 세트 1 게임으로 덮어써질 수 있다.

**처리 완료.** 같은 방의 다른 매치가 이미 가져간 `riotMatchId`는 후보 탐색 단계에서 제외하고(상세 조회도 건너뛰어 API 호출을 아낀다), 저장 직전에 한 번 더 확인한다. 여러 세트의 수집이 동시에 돌 때의 경합까지 막기 위해서다.

## 엣지 케이스 체크리스트

- 2-0 클린치 후 3세트 미실시 → 완주 판정 통과 확인
- 시리즈 중간에 `abortToLobby` → 시리즈 상태도 같이 정리
- 세트 사이 디스코드 음성 — `moveAllToLobby`는 토너먼트 완료 시에만 호출되므로 세트 사이엔 영향 없음
- 세트마다 새 토너먼트 코드 — `autoGenerateCodesForRoom`이 `tournamentCode: null`인 매치를 훑으므로 새 세트 row가 생기면 자동 발급됨

관련: [`TODO_broadcast_overlay.md`](./TODO_broadcast_overlay.md)
