# 전적 기능 최적화 TODO (퍼스널 키 제약)

> 작성일: 2026-05-29
> 목적: 퍼스널 키(앱 전체 100 req/2분) 한도 안에서 전적 기능을 정확·효율적으로 재설계한다.
> 전제: 프로덕션 키 승인이 한 달째 지연 → 퍼스널 키를 영구 조건으로 가정.

---

## 문제 진단

1. **시즌 승/패·승률 부정확** — `entries`에서 받은 솔로 wins/losses를 저장 안 함(`RiotAccount`에 컬럼 없음). 프로필·전적 승률은 ingest 표본(`stats.service.ts:1035`)으로 계산해 실제 시즌과 불일치.
2. **챔피언 통계 불완전** — 등록 유저는 ingest된 매치만 집계(부분), 미등록 외부인은 `findUserByRiotAccount` 404로 **빈 화면**. 컨트롤러 주석(`stats.controller.ts:143`)이 말하는 "시즌 풀스캔"은 실제 코드에 없음.
3. **숙련도 미수집** — `champion-mastery-v4` 호출 자체가 없음.
4. **레이트 한도 미스매치** — `RIOT_RATE_LIMITS`(`riot.service.ts:26`)가 프로덕션 키 기준(MATCH 2000/10s 등). 전역 100/2분 합산 캡이 코드에 없어 누적 스캔 붙이면 429 위험.

## 핵심 원칙 (퍼스널 키)

- **전체 승률/티어 = `entries`에서 직접** (챔피언 분해 불가하지만 큐 총합은 정확, 호출 0~1).
- **챔피언별 승/패 = `match-v5` 스캔만 가능** (entries·mastery엔 없음). 풀스캔 금지, **캐시+증분 누적**이 생존 조건.
- 100/2분은 앱 전체 공유 예산 → 임의 소환사 완전 통계는 물리적으로 불가. 외부인은 "부분 통계"로 솔직히 표기.

---

## 작업 목록

### A. 선결 — 전역 레이트 캡 (0순위)

- [x] Task 1: 모든 Riot 호출(account/summoner/league/match/spectator)이 공유하는 **전역 토큰버킷(100/2분, 20/1초)** 구현. `RiotRateLimiterService` + Redis Lua 듀얼 윈도우. 인터랙티브는 짧게 대기 후 429, 매치 fetch는 예산 생길 때까지 대기.
- [x] Task 2: `RiotService.request`의 프로덕션 키 기준 `RIOT_RATE_LIMITS`/그룹 매핑 제거 → 전역 캡으로 단일화

### B. 전체 승률/티어 — entries 기반

- [x] Task 3: `getRankedInfoByPuuid`가 솔로(평면 유지) + 자유랭크(`flex`)를 함께 반환
- [x] Task 4: `RiotAccount`에 `soloWins/soloLosses/flexTier/flexRank/flexLp/flexWins/flexLosses` 추가 + 마이그레이션(`20260529_add_riot_account_season_records`) — 운영 DB 반영 완료(2026-09-03 확인)
- [x] Task 5: 등록(`registerRiotAccount`)·동기화(`syncRankedInfo`)·3시 크론(`lab-tasks.service.ts`)에서 solo+flex 승/패 저장 — 추가 호출 0
- [x] Task 6: 전적 검색 헤더 솔로 승률은 이미 entries 기반(정확) + 자유랭크 카드 추가 표시. (RecentStatsSummary 도넛은 "최근 N판" 폼 지표로 유지 — Task 12에서 라벨 명시 예정. 자기 `/profile` 페이지 내전 통계는 별개)

### C. 챔피언 숙련도 — champion-mastery-v4

- [x] Task 7: `champion-masteries/by-puuid/{puuid}` fetch(전역 캡 적용) + `ChampionMastery` 테이블 신설(마이그레이션 `20260529_add_champion_mastery`). 등록·수동 sync 시 전체 교체 저장. 미등록 소환사는 라이브+Redis 캐시(1h) 조회 엔드포인트(`/riot/summoner/:gameName/:tagLine/mastery`)
- [x] Task 8: 전적 검색 챔피언 통계 카드에 숙련 레벨/포인트 배지 표시 (championId 매칭). (운영 DB 반영 완료 — 2026-09-03 확인)

### D. 챔피언 시즌 통계 — 증분 누적

- [x] Task 9: 새 `champion-season` 엔드포인트는 `findUserByRiotAccount` 의존 없이 **puuid만으로** 동작 (등록 무관). ranked 그룹(type="ranked"=솔로+자유)
- [x] Task 10: 즉시 20판은 기존 RecentStatsSummary가 담당. 사이드바 랭크 탭은 시즌 누적 + 2분 크론 background 스캔(`handleChampionSeasonScan`, 틱당 2건). 프론트 "수집 중" 폴링(5s) 표시
- [x] Task 11: `ChampionSeasonStat`(puuid+시즌+큐+championId)에 누적, 스캔마다 전체 교체(멱등). 매치 DB 캐시 우선이라 재스캔은 신규분만 API 소모. 깊이 최대 100판. 상태는 `ChampionScanState`
- [x] Task 12: 랭크 탭 배너에 "랭크 시즌 누적 통계 (최근 100판 기준)" / 수집 중 메시지 명시
- [x] Task 13: "시즌" 정의를 설정형으로 — `RIOT_SEASON_START`(스플릿 시작일)·`RIOT_SEASON_LABEL`(시즌 키) env. 미설정 시 기존 동작(연도/1월1일) 유지

### E. 동시 검색 대비 (여러 명이 동시에 전적 검색)

> 현재 단일 인스턴스(`ecosystem.config.js` `instances:1`)라 매치 리미터가 동시 요청을 한 줄로 직렬화함 → "동시 429"는 안 나지만, 우선순위·중복제거가 없음.

- [x] Task 14: foreground 비차단 원칙 — 이미 만족돼 있었다(체크박스만 낡음).
      `getChampionSeasonStats`는 DB에 쌓인 누적을 즉시 돌려주고 스캔은 큐에만 넣는다.
      라이브 예산을 쓰는 foreground 경로는 `getRiotMatchHistory`의 최근 N판(기본 20)뿐이다.
- [x] Task 15: 깊은 시즌 스캔 background 큐 — 이미 만족돼 있었다.
      `ChampionScanState` 큐 + 2분 크론 워커(`handleChampionSeasonScan`)가 처리하고,
      foreground는 큐잉만 한다. 접속자가 많으면 배경 백필(음수 우선순위)은 건너뛴다.
- [x] Task 16: single-flight 코얼레싱 — `SingleFlight`(`common/utils/single-flight.ts`) 신설.
      `getSummonerByRiotId`(조회당 3콜)와 `getMatchById`에 적용했다. 캐시는 "이미 끝난
      요청"만 막고 "진행 중인 요청"은 못 막는데, 캐시가 비는 첫 순간의 중복이 전역
      예산을 가장 크게 태운다. 매치 쪽은 우선순위까지 키에 넣어, 사람이 기다리는
      요청이 배경 스캔의 예산 대기에 얹혀 오래 붙잡히지 않게 했다.
      puuid 단위 스캔 중복은 `ChampionScanState.status`가 이미 막고 있다.
      (주의: 재시도는 `fetchMatchById`를 직접 부른다 — 같은 키의 flight를 다시
      기다리면 자기 완료를 기다리는 교착이 된다.)
- [x] Task 17: background 큐 라운드로빈 — 이미 만족돼 있었다.
      스캔은 100판 배치로 끊고 `scannedCount`를 커서로 남기며, 배치가 끝나면
      `status=queued` + `requestedAt` 갱신으로 큐 뒤로 간다. 정렬이
      `priority desc, requestedAt asc`라 같은 우선순위 안에서 자연스럽게 회전한다.
- [ ] Task 18: (확장 대비, 후순위) 매치 리미터 간격을 인메모리(`lastMatchRequestAt`) → Redis로 이전. 현재 `instances:1`이라 미발생, 클러스터 전환 시 필수

### F. 예산 회수 (Lab 보류 후속)

- [x] Task 19: 예산 회수 — **env 게이트가 아니라 코드 제거로 끝났다.**
      Lab을 접으면서 `lab-tasks.service.ts` 자체가 사라졌고, 그 안에 있던
      `handleMatchFetch`(*/30 대량 ingest)·`handleHighTierSeeding`·`runMatchFetch` 와
      `POST /admin/matches/seed-high-tiers` 도 함께 없어졌다. `MATCH_FETCH_ENABLED` env는
      존재하지 않는다 — 되살리려면 게이트를 켜는 게 아니라 다시 구현해야 한다.
      남아 있는 매치 수집 경로는 `riot-match-cache-ingest.service.ts` 의 */5 크론 하나뿐이다.
      스키마(`KnownPuuid`/`MatchStatsCache`/`StatsRecomputeQueue`/`RiotMatchCache`)는 보존.

---

## 미결 디테일

- 첫 검색 즉시 집계 N판 수 (20? 50?)
- background 챔피언 스캔에 줄 예산 비율 (전역 100/2분 중 몇 %)
- 누적 우선순위: 등록 유저 > 자주 검색 puuid > 1회성 외부인
- 챔피언 누적 저장 테이블: 기존 `SummonerSeasonTier`(비어있음) 활용 vs 신규 테이블

---

## 저장 전략 (2026-09-03)

퍼스널 키로 어렵게 모은 매치 데이터는 자산이므로 **버리는 게 아니라 압축해서 전부 들고 간다.**

| 계층 | 데이터 | 크기 | 보존 |
|---|---|---|---|
| 1. 메모리 | Timeline | — | LRU only |
| 2. 원본 JSON | `RiotMatchCache` | 44.5KB/매치 | **TTL 14일** |
| 3-a. 정형 컬럼 | `MatchParticipant` | ~1.5KB/행 | 영구 |
| 3-b. 압축 아카이브 | `RiotMatchArchive` | **11KB/매치** | 영구 |

### 아카이브 설계 근거 (실측)

2000매치로 네 형태를 실제로 만들어 재고 골랐다. 추측과 결과가 달랐다.

| 형태 | 크기 |
|---|---|
| 원본 그대로 | 89 MB |
| 참가자 행마다 객체 | **107 MB** (원본보다 큼) |
| 매치당 통째로 묶기 | 87 MB (절감 없음) |
| **0값 제거 + 매치당 묶기** | **22 MB** ← 채택 |

- **참가자별로 행을 쪼개면 커진다.** Postgres TOAST 압축이 행 단위라 작은 행은
  압축되지 않고, 129개 키 이름이 행마다 반복된다.
- **절감의 핵심은 0값 제거.** `challenges` 129키 중 평균 87키가 0이다
  (`SWARM_*`, `dancedWithRiftHerald` 등). 없으면 0으로 읽으면 되므로 무손실이고
  평균 42키만 남는다.

`payload` 구조: `{ p: [{ id: puuid, c: {challenges}, x: {미보유 루트필드} }], t: [teams] }`

담는 것: challenges 129키 전부 · 참가자 루트 중 컬럼에 없는 것 전부(핑 통계, `lane`,
`killingSprees`, `PlayerScore*` 등) · `info.teams`(밴, 오브젝트 — 종전까지 어디에도 없었다).

### 실적

- 102,822매치 **4,797MB → 1,149MB (4.2배)**
- 정형 컬럼 백필 1,077,246 / 1,077,258 (미추출 12행은 인제스트 중복제거로 puuid 가
  NULL 이라 원본과 짝지을 수 없는 정상 케이스)
- 검증: 무작위 1000매치 키·값 대조 누락 0건. 컬럼 ↔ 아카이브 교차검증
  20,000행 중 진짜 불일치 0건(차이 569건은 전부 "값이 0이라 생략" 규칙대로)

### 삭제 가드

`RiotMatchCache` 삭제는 **세 조건을 모두** 만족해야 한다. TTL 경과 + 정형 인제스트 완료
+ **아카이브 존재**. 세 번째가 없으면 아직 아카이브 안 된 매치가 지워지는데,
실제로 백필 도중 `*/5` 인제스트 크론이 129건을 새로 캐시해 그 구멍이 실재했다.
`TasksService.runRiotMatchCacheCleanup()` 과 `scripts/ops/purge-riot-match-cache.sh`
양쪽에 반영돼 있다.

### 주의

새 지표를 컬럼으로 더 뽑고 싶어지면 **아카이브에서 뽑으면 된다** — 원본이 사라져도
`payload` 에 남아 있다. 다만 아카이브에도 없는 것(예: Timeline 기반 아이템·스킬 순서)은
원본이 TTL 안에 있는 동안에만 가능하다.
