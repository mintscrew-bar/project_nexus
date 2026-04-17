# Lab 대시보드 구현 계획

> 진행 기준일: 2026-04-16
> 완료: 8 / 전체: Task 1~42
> 연계 문서: [전적 페이지 크롤링/배치 TODO](./TODO_matches_crawling.md)

---

## 구현 스케줄 (권장)

Lab은 단독으로 먼저 들어가면 다시 흔들린다. **Matches 쪽 유저별 캐시/배치가 닫힌 뒤** Lab 스냅샷과 API를 올리는 순서로 고정한다.

### Sprint 3 — Lab 데이터 기반 구축

**선행 조건**: [전적 페이지 크롤링/배치 TODO](./TODO_matches_crawling.md)의 Sprint 1~2 완료

- 포함 범위:
  - Task 1 `Match.patchVersion`
  - Task 2 `LabChampionSnapshot`
  - Task 3 `LabSynergySnapshot`
  - Task 4 `LabCounterSnapshot`
  - Task 5 Prisma 반영
  - Task 6 `LabStatsService`
  - Task 7 `RiotTierRefreshTask`
  - Task 8 `LabSnapshotTask`
- 완료 기준:
  - Lab 스냅샷 테이블이 채워짐
  - 티어 갱신 → 스냅샷 집계 순서가 고정됨
  - `MatchStatsCache`와 Lab 스냅샷이 동시에 참조 가능함

### Sprint 4 — Lab 핵심 API

**목표**: `/lab` 메인 화면과 챔피언 분석에 필요한 API부터 연다.

- 포함 범위:
  - Task 9 `meta/radar`
  - Task 10 `meta/patch-impact`
  - Task 11 `meta/ban-rates`
  - Task 12 `champions`
  - Task 13 `champions/:championId`
  - Task 21 `/lab` 레이아웃
  - Task 22 `lab-store`
  - Task 23 메타 레이더 UI
  - Task 24 챔피언 목록
  - Task 25 챔피언 상세
- 완료 기준:
  - `/lab` 첫 진입 화면이 비어 있지 않음
  - 메타/챔피언 분석이 스냅샷 기반으로 정상 응답함
  - 콜드스타트/빈 데이터 상태가 처리됨

### Sprint 5 — 고급 분석

**목표**: 장인, 시너지, 카운터, 오라클까지 확장한다.

- 포함 범위:
  - Task 14 장인 API
  - Task 15 시너지 API
  - Task 16 카운터 API
  - Task 17 조합 유형 API
  - Task 18 경매 효율 API
  - Task 19 팀 밸런스 예측 API
  - Task 20 밴픽 추천 API
  - Task 26~31 관련 UI
  - Task 32~38 마무리/확장 과제
- 완료 기준:
  - `/lab` 4개 탭이 모두 동작
  - 장인/시너지/오라클까지 사용자 가치가 분명한 기능 제공
  - 운영 중 병목 지점이 드러나면 snapshot/query 최적화로 이어갈 수 있음

### 착수 순서 고정

1. `patchVersion` + Lab 스냅샷 스키마
2. `RiotTierRefreshTask`
3. `LabSnapshotTask`
4. 메타/챔피언 API
5. `/lab` 메인 UI
6. 장인/시너지/카운터
7. 오라클

## 개요

**목표**: 내전 전용 분석 도구 (`/lab`). 외부 통계 사이트와의 차별점은 내전 맥락 데이터 (경매 낙찰가, 팀 구성 과정, 커뮤니티 내 유저 간 상성 등)를 활용한다는 점.

**탭 구조**:
```
/lab
├── 메타 레이더   — 지금 뭐가 강한지, 트렌딩 챔피언, 패치 임팩트
├── 챔피언 분석   — 챔피언별 상세 통계, 빌드/룬 승률, 장인
├── 조합 분석     — 시너지, 카운터, 팀 유형별 승률
└── 오라클        — 경매 효율, 팀 밸런스 예측, 밴픽 추천
```

**명예의 전당 (C안)**: 별도 작업 — 메인 페이지 랭킹 섹션으로 추후 추가

### 소표본 환경 대응 원칙

내전 데이터는 구조적으로 소표본(small sample)이다. op.gg나 lolalytics 같은 외부 사이트는 수십만~수백만 게임을 기반으로 하지만, 커뮤니티 내전은 수백~수천 게임 단위다. 따라서 아래 원칙을 모든 통계에 일관 적용한다.

1. **Wilson Score Interval 사용**: 단순 승률(`wins / games`) 대신 Wilson score의 하한(lower bound)을 정렬 기준으로 사용하여 소표본에서의 우연한 고승률이 과대평가되는 것을 방지한다.

```
Wilson lower bound (95% 신뢰구간):
  p̂ = wins / games
  z = 1.96 (95% CI)
  lower = (p̂ + z²/2n - z × √(p̂(1-p̂)/n + z²/4n²)) / (1 + z²/n)
```

2. **신뢰도 등급 표시**: 모든 통계에 게임 수 기반 신뢰도 뱃지를 부여하여 사용자가 데이터의 신뢰 수준을 직관적으로 파악할 수 있게 한다.

| 게임 수 | 신뢰도 등급 | UI 표시 |
|---------|-----------|--------|
| < 5 | 비표시(insufficient) | 통계 노출하지 않음 |
| 5~14 | 낮음(low) | 회색 텍스트 + "참고용" 뱃지 |
| 15~29 | 보통(moderate) | 일반 표시 |
| 30+ | 높음(high) | 굵은 표시 |

3. **최소 게임 수 임계값 근거**: 이항분포(binomial distribution) 기반. 실제 승률 50%인 챔피언이 우연히 80%+ 관측될 확률이 5% 미만이 되려면 최소 10게임이 필요하다. 시너지/카운터처럼 조합 폭발이 발생하는 경우는 임계값을 낮추되 신뢰도 등급으로 보완한다.

---

## 콜드스타트 전략

Lab 대시보드는 누적 내전 데이터에 의존하므로, **서비스 초기(데이터 0~50게임 구간)** 에서의 동작을 명확히 정의해야 한다.

### 데이터 축적 단계 정의

| 단계 | 누적 게임 수 | 상태 | 활성화되는 기능 |
|------|------------|------|----------------|
| 0단계 (콜드) | 0~9 | 수집 중 | Lab 페이지 자체를 "준비 중" 배너로 표시 |
| 1단계 (워밍업) | 10~29 | 부분 활성 | 메타 레이더 기본 통계, 챔피언 목록 (low 신뢰도) |
| 2단계 (기본) | 30~99 | 대부분 활성 | 챔피언 상세, 경매 효율 기본 버전 |
| 3단계 (안정) | 100~299 | 전체 활성 | 조합 분석, 시너지/카운터, 팀 밸런스 예측 |
| 4단계 (성숙) | 300+ | 신뢰도 높음 | 패치 임팩트 비교, 트렌딩 알고리즘 정확도 확보 |

### 단계별 fallback 동작

> 연계: [Matches Task 2 (MatchStatsCache)](./TODO_matches_crawling.md), [Matches Task 22 (콜드스타트 보완)](./TODO_matches_crawling.md)

```
API 요청 시 fallback 우선순위:
  1. LabChampionSnapshot 캐시 조회 (스냅샷 있으면 즉시 반환)
  2. 없으면 match_participants 실시간 집계 (소량이므로 빠름)
  3. 데이터 자체가 없으면 → { data: [], meta: { phase: 0, message: "수집 중" } }
  4. [0단계 전용] MatchStatsCache(ranked) 참고 데이터 표시:
     → "랭크 전적 기반 성향 참고" 배너 + 해당 유저의 랭크 챔피언 풀/승률
     → 내전 데이터와 혼동되지 않도록 별도 섹션으로 분리, 색상/아이콘 차별화

각 API별 최소 게임 수 게이팅:
  /meta/radar          → 10게임 미만 시 전체 섹션 숨김
  /meta/patch-impact   → 300게임 미만 + 패치 2종 이상 없으면 비활성
  /meta/trending       → 20게임 미만 시 트렌딩 섹션 숨김
  /champions           → 5게임 미만 챔피언은 목록 노출 안 함 (토글 없음)
  /synergy             → 3단계 미만(30게임) 탭 자체 잠금
  /counter             → 3단계 미만(30게임) 탭 자체 잠금
  /oracle/auction-efficiency → 10게임 + 경매 모드 매치 5개 이상
  /oracle/balance-score      → 유저당 최소 3게임 이상인 참가자만 PSS 계산
  /oracle/ban-recommend      → 게임 수 무관 항상 활성 (메타 스코어 없으면 픽률만으로 추천)
```

### 콜드스타트 시 cron 대신 즉시 집계

```
야간 cron(새벽 4시)을 기다리지 않고 다음 트리거에서 스냅샷을 즉시 생성:
  - 내전 결과가 등록될 때마다 누적 게임 수가 단계 임계값을 넘으면
    → LabSnapshotTask.recompute()를 비동기 큐(Bull)로 즉시 트리거
  - 중복 실행 방지: Bull job에 deduplicate 옵션 (동시에 실행 중인 job이 있으면 skip)
  - 임계값 돌파 체크: Match 저장 후 후킹 — matchCount % 5 === 0 마다 체크 (매 게임마다 체크 불필요)
```

### 콜드스타트 UI 가이드라인

- **"준비 중" 상태**: 챔피언 아이콘 + 승률 자리에 skeleton shimmer 대신 "N게임 더 진행하면 분석이 열립니다" 진행바 표시
- **단계 전환 알림**: 3단계 진입 시 커뮤니티 알림 발송 ("조합 분석이 활성화되었습니다!")
- **데이터 현황 위젯**: Lab 메인 상단에 "현재 분석 기반: N게임 / M명 참여" 항상 노출 — 사용자가 데이터 규모를 인식하게 함

---

## Phase 0: DB 스키마 확장

- [x] Task 1: `Match` 모델에 `patchVersion String?` 필드 추가
  - 패치 임팩트 분석의 전제 조건
  - Riot API 매치 데이터 수집 시 `gameVersion` 파싱하여 저장 (ex: `"14.8"`)
  - **파싱 규칙**: `gameVersion` (ex: `"14.8.616.1234"`)에서 앞 두 자리만 추출 → `"14.8"`
  - **불변성 원칙**: `patchVersion`이 한 번 저장된 `Match` 레코드는 Riot API를 다시 호출하지 않음. `patchVersion IS NULL AND riotMatchId IS NOT NULL` 인 건만 배치 대상.
  - **백필 배치 스크립트** (`scripts/backfill-patch-version.ts`):
    ```
    1. SELECT id, riotMatchId FROM matches WHERE patchVersion IS NULL AND riotMatchId IS NOT NULL
    2. Riot match-v5 API 호출 (match/{matchId}) → info.gameVersion 파싱
    3. UPDATE matches SET patchVersion = '14.8' WHERE id = ?
    4. Rate limit 준수: 100ms 간격, 분당 100건 이내 (Riot API Production 기준)
    5. 실패한 matchId는 별도 로그에 기록 후 다음 배치에서 재시도
    ```
  - 이후 신규 내전 매치 등록 시 Riot API에서 gameVersion을 함께 받아 바로 저장 (별도 배치 불필요)

- [x] Task 2: `LabChampionSnapshot` 모델 추가
  > 연계: [Matches Task 2 (MatchStatsCache)](./TODO_matches_crawling.md) — MatchStatsCache는 유저별 개인 통계(ranked/normal/aram/custom), LabChampionSnapshot은 내전 커뮤니티 전체 챔피언 집계. 집계 단위가 다르므로 중복이 아님
  > 연계: [Matches Task 21 (집계 로직 중복 제거)](./TODO_matches_crawling.md) — 내전 MatchParticipant 집계 공통 함수 활용
  - 챔피언별 기간별(30d/90d/all) 집계 캐시 테이블
  - 필드: `period`, `patchVersion?`, `championId`, `position?`, `games`, `wins`, `avgKda`, `avgDamage`, `avgGold`, `pickRate`, `banRate`, `wilsonLower`, `computedAt`
  - `@@unique([period, patchVersion, championId, position])`
  - **추가 필드 설명**:
    - `pickRate`: 해당 기간 전체 게임 대비 픽률 (Float)
    - `banRate`: 해당 기간 전체 게임 대비 밴률 (Float)
    - `wilsonLower`: Wilson score 하한값 — 정렬/티어 분류의 실제 기준 (Float)
  - **최소 게임 수**: 5게임 미만인 챔피언-포지션 조합은 스냅샷에서 제외

- [x] Task 3: `LabSynergySnapshot` 모델 추가
  - 챔피언 2인 조합 승률 캐시 테이블
  - 필드: `period`, `champ1Id`, `champ2Id` (항상 champ1Id < champ2Id로 정규화), `games`, `wins`, `winRate`, `wilsonLower`, `computedAt`
  - **최소 게임 수: 3게임** (임계값 근거: 2인 조합 경우의 수가 약 C(160,2) ≈ 12,720이므로, 소표본 환경에서 5게임 이상을 요구하면 유의미한 조합이 거의 남지 않는다. 3게임으로 낮추되 신뢰도 등급(낮음)을 반드시 표시)
  - **주의**: `winRate`는 표시용이고, 정렬 기준은 `wilsonLower` 사용

- [x] Task 4: `LabCounterSnapshot` 모델 추가
  - 챔피언 상성 (A가 B를 만났을 때 승률) 캐시 테이블
  - 필드: `period`, `champId`, `vsChampId`, `position?`, `games`, `wins`, `winRate`, `wilsonLower`, `computedAt`
  - **최소 게임 수: 3게임** (근거: 시너지와 동일한 조합 폭발 문제. 같은 포지션 맞라인으로 한정하면 경우의 수가 줄어들지만, 내전 특성상 포지션 유동성이 높아 전체 매치업도 허용)
  - **`position` 필드 추가**: 같은 포지션 맞라인 상성과 전체 상성을 구분하여 저장 (null = 전체)

- [x] Task 5: DB 스키마 푸시 및 Prisma 클라이언트 재생성
  - `pnpm db:push && pnpm db:generate`

---

## Phase 1: 백엔드 — 공통 인프라

- **집계 단위 고정**:
  - Lab의 개인 참조 데이터(`MatchStatsCache`, 콜드스타트 fallback, 오라클 PSS 입력)는 모두 `userId` 기준으로 해석한다.
  - Riot 계정이 여러 개 연결된 경우에도 Lab은 "계정별"이 아니라 "Nexus 유저별" 전적을 사용한다.

- [x] Task 6: `LabStatsService` 분리 생성
  - 기존 `StatsService`에서 Lab 관련 메서드를 `LabStatsService`로 추출
  - Lab 전용 Redis 캐시 키 네임스페이스: `lab:*`
  - 캐시 TTL 전략:

    | 데이터 유형 | TTL | 근거 |
    |-----------|-----|------|
    | 메타 레이더 개요 | 1시간 | 실시간성 중요, 새 경기 반영 속도 |
    | 챔피언 상세 | 30분 | 개별 조회 빈도 높음, DB 부하 분산 |
    | 스냅샷 집계 결과 | 24시간 | 야간 cron 갱신 주기와 동기화 |
    | 오라클 예측 | 캐시 안 함 | 입력 파라미터가 매번 다름 |

  - **증분 업데이트 vs 전체 재계산**:
    - 스냅샷(Task 7): **전체 재계산** 채택. 이유 — 증분 업데이트는 삭제/수정된 매치 반영이 어렵고, 야간 1회 실행이라 전체 재계산의 비용이 충분히 감당 가능. `match_participants` 테이블 기준 수천~수만 행 규모에서는 full scan이 수 초 이내 완료.
    - 실시간 API(메타 레이더, 챔피언 상세): **Redis 캐시 + TTL 만료 시 실시간 집계** 방식. 스냅샷이 있으면 스냅샷 우선, 없으면 원본 쿼리.
    - **전환 시점**: `match_participants`가 10만 행을 넘으면 증분 전략(마지막 `computedAt` 이후 매치만 집계 → UPSERT)으로 전환 검토. 이 경우 `LabChampionSnapshot`에 `lastMatchCreatedAt` 필드 추가 필요.
  - **잡 중복 실행 방지**:
    - `RiotTierRefreshTask`, `LabSnapshotTask`는 Redis lock 또는 DB advisory lock으로 단일 실행 보장
    - 멀티 인스턴스 환경에서도 같은 cron이 중복 집계하지 않도록 job key를 고정

- [x] Task 7: RiotAccount 티어 배치 갱신 Cron Job 작성
  > 연계: [Matches Task 1 (KnownPuuid)](./TODO_matches_crawling.md) — 갱신 대상 선정에 KnownPuuid.isNexusUser 활용 가능 (활성 유저 리스트 = KnownPuuid WHERE isNexusUser=true AND priority>=10)
  > 연계: [Matches Task 23 (배치 실행 순서)](./TODO_matches_crawling.md) — 새벽 3시 실행, LabSnapshotTask(새벽 4시) 이전에 완료되어야 함
  - **목적**: 장인 D2+ 게이트가 항상 최신 티어 기반이어야 함. 유저가 프로필을 열 때만 갱신하면 오래된 데이터로 잘못 필터링될 수 있음.
  - `RiotTierRefreshTask` — `@Cron('0 3 * * *')` (매일 새벽 3시, 스냅샷 cron 1시간 전)
  - **갱신 대상 우선순위**:
    ```
    1순위: 최근 30일 내 내전 참가 기록이 있는 유저 (활성 유저 — 장인 목록에 영향)
    2순위: RiotAccount.lastSyncedAt 기준 가장 오래된 유저 순 (rolling 갱신)
    → 1순위 먼저 갱신 후 남은 API 할당량으로 2순위 갱신
    ```
  - **API 호출 전략 (Rate Limit 준수)**:
    ```
    Riot API Production 기준: 100req/2min, 20req/1sec
    안전 마진 50% 적용: 분당 50건 처리
    유저 1명당 API 호출 수: 1건 (league-v4 /by-summoner/{summonerId}/entries)
    새벽 3시~4시 1시간 = 최대 3,000건 처리 가능

    배치 처리 흐름:
    1. 활성 유저 리스트 조회 (최근 30일 내 MatchParticipant 기록)
    2. 50명씩 청크로 나눠 1분 간격으로 처리 (Promise.allSettled 병렬)
    3. 응답 받은 즉시 RiotAccount.tier / rank / lp / lastSyncedAt UPDATE
    4. 실패한 PUUID는 다음 배치로 이월 (별도 재시도 큐 불필요, 다음날 자동 재시도)
    ```
  - **불변성 원칙**: 이미 당일 갱신된 계정(`lastSyncedAt >= 오늘 00:00`)은 스킵
  - **SummonerSeasonTier 동기화**: 시즌 변경 감지 시 (tier가 크게 하락하면) SummonerSeasonTier에 이전 시즌 기록 스냅샷 저장

- [x] Task 8: 스냅샷 야간 집계 Cron Job 작성
  > 연계: [Matches Task 7 (MatchStatsComputeTask)](./TODO_matches_crawling.md) — MatchStatsComputeTask(매 정시)가 MatchStatsCache를 갱신한 후, LabSnapshotTask(새벽 4시)가 이를 참조. 실행 순서 의존성 있음
  > 연계: [Matches Task 21 (집계 로직 중복 제거)](./TODO_matches_crawling.md) — 내전 MatchParticipant 집계 시 공통 함수 `aggregateCustomMatchStats()` 사용
  > 연계: [Matches Task 23 (배치 실행 순서)](./TODO_matches_crawling.md) — 전체 배치 파이프라인 순서 참조
  - **"한 번 계산, 항상 DB 조회" 원칙**: 유저 요청마다 수백 판을 집계하면 DB 부하가 폭발함.
    모든 Lab API는 Pre-calculated 스냅샷을 우선 조회하고, 없을 때만 실시간 집계로 fallback.
    즉, 유저는 항상 이미 계산된 결과값만 조회하게 됨.
  - `LabSnapshotTask` — `@Cron('0 4 * * *')` (매일 새벽 4시 KST, 티어 갱신 cron 1시간 후)
  - `computeChampionSnapshots()`:
    - period 3종(`30d`, `90d`, `all`) × 포지션 6종(`TOP`, `JUNGLE`, `MID`, `ADC`, `SUPPORT`, `null(전체)`) = 18 조합
    - 각 조합에서 `wilsonLower` 계산하여 저장
    - **픽률 분모 규칙**:
      - `position = null(전체)`일 때: `pickRate = 해당 챔피언 게임 수 / (해당 기간 전체 매치 수 × 10)`
      - 포지션별일 때: `pickRate = 해당 챔피언-포지션 게임 수 / 해당 기간 해당 포지션 슬롯 수`
        (`5v5` 고정 내전이면 사실상 기간 내 전체 매치 수와 동일)
    - `banRate = 해당 챔피언 밴 횟수 / 해당 기간 전체 매치 수`
  - `computeSynergySnapshots()`:
    - 같은 matchId + teamId인 participant를 셀프 조인 (champ1Id < champ2Id로 정규화)
    - SQL 예시:
    ```sql
    SELECT LEAST(a."championId", b."championId") AS champ1_id,
           GREATEST(a."championId", b."championId") AS champ2_id,
           COUNT(*) AS games,
           SUM(CASE WHEN a."win" THEN 1 ELSE 0 END) AS wins
    FROM match_participants a
    JOIN match_participants b
      ON a."matchId" = b."matchId"
     AND a."teamId" = b."teamId"
     AND a."id" < b."id"
    JOIN matches m ON m."id" = a."matchId"
    WHERE m."completedAt" >= NOW() - INTERVAL '30 days'
    GROUP BY 1, 2
    HAVING COUNT(*) >= 3
    ```
  - `computeCounterSnapshots()`:
    - 다른 teamId인 participant 크로스 조인 (같은 position 필터 선택적)
    - **주의**: 크로스 조인 결과가 5×5=25 쌍/매치이므로, 같은 포지션 필터 적용 시 5쌍/매치로 축소. 전체 매치업도 별도 저장.
  - **기간 기준 시점**:
    - 30d/90d/all 필터는 `MatchParticipant.createdAt`이 아니라 실제 경기 시점을 뜻하는 `Match.completedAt` 기준으로 계산
    - `completedAt`이 null인 비정상 레코드는 집계에서 제외
  - 스냅샷 계산 완료 후 Redis `lab:*` 키 일괄 삭제
  - **에러 처리**: 개별 스냅샷 계산 실패 시 나머지 계속 진행, 실패 건 로깅

---

## Phase 2: 백엔드 — 메타 레이더 API

- [ ] Task 9: `GET /stats/lab/meta/radar` — 메타 레이더 개요 API
  - **트렌딩 챔피언 TOP 5** — 아래 알고리즘으로 감지:

    ```
    트렌딩 스코어 계산:
    1. recent_pick_rate  = 최근 7일 해당 챔피언 픽 수 / 최근 7일 전체 픽 수
    2. previous_pick_rate = 8~21일 전 해당 챔피언 픽 수 / 8~21일 전 전체 픽 수
    3. pick_rate_delta  = recent_pick_rate - previous_pick_rate

    4. 트렌딩 조건: pick_rate_delta > 0 AND recent_games >= 3
    5. 정렬 기준: pick_rate_delta DESC (픽률 절대 변화량 기준)

    대안으로 비율 변화(relative change)도 가능하지만,
    내전 환경에서는 기저 픽률이 매우 낮아 비율 변화가 극단적으로 튀기 쉬움.
    절대 변화량이 해석 가능성(interpretability) 측면에서 더 적합.
    ```

    **주의**: 7일/14일 이전 데이터가 충분하지 않으면(기간 내 전체 게임 < 20), 트렌딩 섹션 자체를 숨기고 "데이터 수집 중" 메시지 표시.

  - **포지션별 챔피언 티어 분류** — S/A/B/C/D 5단계:

    ```
    티어 스코어 공식:
      tier_score = 0.6 × wilson_lower_norm + 0.4 × pick_rate_norm

    정규화(normalization):
      wilson_lower_norm = (wilson_lower - min) / (max - min)   // 해당 포지션 내
      pick_rate_norm    = (pick_rate - min) / (max - min)      // 해당 포지션 내

    가중치 근거:
      - 승률(wilson_lower) 60%: 실력 지표의 본질적 중요성
      - 픽률 40%: 메타 반영도. 픽률이 너무 낮으면 우연의 영향이 큼
      - 밴률은 tier_score에 직접 포함하지 않음 (밴률이 높으면 픽률이 떨어져
        tier_score가 왜곡될 수 있음). 대신 "높은 밴률" 뱃지로 별도 표시.

    티어 구간 (tier_score 기준, 해당 포지션 내 상대 평가):
      S: 상위 10%
      A: 상위 10~30%
      B: 상위 30~60%
      C: 상위 60~85%
      D: 하위 15%

    최소 조건: 해당 포지션에서 5게임 이상 플레이된 챔피언만 티어 대상
    ```

  - 데이터 샘플 현황 (총 게임 수, 기간, 참여 유저 수)

- [ ] Task 10: `GET /stats/lab/meta/patch-impact` — 패치 임팩트 API
  - `patchVersion` 기준 이전/이후 챔피언 승률 비교
  - 상위 5 수혜 챔피언 / 상위 5 피해 챔피언
  - **비교 방법**:
    ```
    delta_win_rate = 현재 패치 승률 - 이전 패치 승률
    정렬: delta_win_rate DESC (수혜) / ASC (피해)
    최소 조건: 두 패치 모두에서 3게임 이상 플레이
    ```
  - **주의(caveat)**: 내전 데이터로 패치 임팩트를 측정하면, 실제 패치 효과 + 메타 인식 변화(밴률 변화에 따른 간접 효과) + 표본 노이즈가 혼재. UI에 "내전 데이터 기반 — 패치 노트와 결과가 다를 수 있습니다" 면책 문구 필요.
  - `patchVersion` 데이터 부족 시 graceful fallback: 패치 구분 없는 전체 기간 통계 표시

- [ ] Task 11: `GET /stats/lab/meta/ban-rates` — 밴률 통계 API
  - `MatchTeamStats.bans` JSON 파싱 집계
  - 챔피언별 밴률 + 밴 시 팀 승률 연관성
  - **밴률 계산**: `ban_rate = 해당 챔피언 밴 횟수 / 전체 매치 수` (매치당 최대 10밴이므로 100%를 초과할 수 없으나, 분모를 전체 매치 수로 통일하여 직관적 해석 유지)

---

## Phase 3: 백엔드 — 챔피언 분석 API

- [ ] Task 12: `GET /stats/lab/champions` — 챔피언 목록 통계 API
  - 픽률 / 밴률 / 승률 삼각지표 전체 목록
  - 필터: `period` (30d/90d/all), `position` (포지션별)
  - `LabChampionSnapshot` 캐시 우선 조회, 없으면 실시간 집계
  - **정렬 기본값**: `wilsonLower` DESC (소표본 보정된 승률 기준)
  - 응답에 `confidenceLevel` (`low` / `moderate` / `high`) 포함

- [ ] Task 13: `GET /stats/lab/champions/:championId` — 챔피언 상세 API
  - 기간별 승률 추이 (라인 차트용 시계열 데이터)
    - **집계 단위**: 7일 윈도우(weekly rolling) — 일별로 하면 내전 특성상 빈 날이 많아 차트가 들쭉날쭉해짐
    - 데이터 포인트가 3개 미만이면 차트 대신 "데이터 부족" 표시
  - 포지션별 픽률/승률 분포
  - 최고 성과 아이템 조합 TOP 5 (item0~6 중 완성 아이템 기준 2코어 조합)
    - **완성 아이템 판별**: Riot Data Dragon의 아이템 JSON에서 `"into"` 필드가 없는 아이템을 완성 아이템으로 간주. 부츠(itemId 3xxx 계열) 제외.
  - 최고 성과 룬 조합 TOP 3 (`perks` JSON에서 primaryStyle + subStyle 키스톤 조합 기준)

- [ ] Task 14: `GET /stats/lab/champions/:championId/mastery` — 장인 API

  **설계 배경**: op.gg/deeplol처럼 "티어 컷 + 표본 수 + 승률"을 조건으로 잡되, 내전 특성에 맞게 조정한다.
  Riot 계정 `RiotAccount.tier` / `RiotAccount.rank` 필드가 이미 존재하므로 이를 게이트로 활용.
  장인 순위는 최대 **50위**까지 표시.

  **티어 서열 정의**:
  ```
  서열 (낮음 → 높음):
  IRON < BRONZE < SILVER < GOLD < PLATINUM < EMERALD < DIAMOND < MASTER < GRANDMASTER < CHALLENGER
  랭크: IV < III < II < I  (DIAMOND 이하만 해당, MASTER+ 는 랭크 없음)

  D2 이상 = DIAMOND II, DIAMOND I, MASTER, GRANDMASTER, CHALLENGER
  티어 비교 함수: tierScore(tier, rank) = tierIndex × 4 + rankIndex
    → DIAMOND II = 6×4+2 = 26, MASTER = 7×4+0 = 28 (기준)
  ```

  **자격 조건 — 3단계 AND 조건**:
  ```
  조건 A. 솔로랭크 티어: D2 이상
    - RiotAccount (isPrimary=true) 기준.
      isPrimary 없으면 해당 유저의 RiotAccount 중 가장 높은 티어 사용.
    - RiotAccount 미연동 유저: 장인 목록 제외 (조건 미충족으로 처리)
    - 현시즌 배치 미완료자(UNRANKED): 제외
    - SummonerSeasonTier에 현시즌 기록 있으면 그것 우선 사용

  조건 B. 해당 챔피언 내전 게임 수: 10게임 이상
    - 기간 제한 없음(all-time). 장인은 누적 플레이로 인정.
    - 단, 최근성은 masteryScore에 반영.

  조건 C. 해당 챔피언 내전 승률: 40% 이상 (최소 컷)
    - 단순 winRate 기준 (Wilson 아님). 극단적 패배 플레이어 필터링 목적.
    - 10게임 이상이므로 40% = 4승 이상 → 충분히 의미있는 기준.
  ```

  **동적 기준 완화 (저픽률 챔피언 처리)**:
  ```
  탐켄치처럼 내전에서 픽률이 낮은 챔피언은 D2+ + 10게임 기준을 충족하는
  유저가 거의 없을 수 있음. 자격 통과자 수에 따라 단계적으로 완화:

  1차 (기본 기준):   D2+ AND 10게임 AND 40%승률  → 통과자 수 확인
  2차 완화 트리거:   통과자 < 10명 이면
                     → P1+ AND 7게임 AND 40%승률 로 완화
  3차 완화 트리거:   통과자 < 5명 이면
                     → P2+ AND 5게임 AND 35%승률 로 완화
  최종 fallback:     통과자 < 3명 이면
                     → 기준 더 이상 완화하지 않음. "장인 데이터 부족" 표시.

  완화된 경우 UI에 적용 기준 명시:
    "다이아 2 이상 기준 적용 중"
    "플래티넘 1 이상 기준으로 표시 중 — 다이아 2 이상 표본 부족"
  ```

  **masteryScore 공식 (자격 통과자 정렬 기준)**:
  ```
  masteryScore = 볼륨 × 0.30 + 실력 × 0.40 + 임팩트 × 0.20 + 최근성 × 0.10

  ─ 볼륨 스코어 (0~100):
    volume = min(log2(games + 1) / log2(51), 1.0) × 100
    → 50게임을 사실상 만점 기준으로 정규화.
    → log 스케일: 10→20게임 차이가 40→50게임 차이보다 장인 판별에 더 의미있음.

  ─ 실력 스코어 (0~100):
    skill = wilsonLower(wins, games, z=1.96) × 100
    → Wilson lower bound (95% CI). 단순 winRate 대신 사용.
    → 10게임 60% 승률 ≈ 42점 / 30게임 60% 승률 ≈ 55점 / 50게임 60% 승률 ≈ 60점

  ─ 임팩트 스코어 (0~100):
    impact = kda_pct × 0.4 + damage_share_pct × 0.4 + vision_pct × 0.2
    → 각 지표는 해당 챔피언을 플레이한 자격 통과자들 대비 percentile rank.
    → 같은 챔피언 플레이어끼리만 비교하므로 역할 특성 차이 자동 중립화.
    → vision_pct: 서포터 장인 보정 역할 (서포터 챔피언 특화).

  ─ 최근성 스코어 (0~100):
    마지막 플레이 < 30일   → 100
    마지막 플레이 < 60일   → 60
    마지막 플레이 < 90일   → 30
    마지막 플레이 >= 90일  → 0
    → "전 시즌 장인"과 "현재 활동 장인"을 구분. 0점이어도 자격 박탈은 아님.

  ※ 랭크 티어는 masteryScore에 포함 안 함.
    이미 D2+ 게이트를 통과했으므로 점수에 추가하면
    챌린저가 내전 성과 무관 상위 점령하는 문제 발생.
  ```

  **부가 정보 표시 (점수 외)**:
  ```
  NexusRanking 연계:
    - 각 장인의 내전 전체 승률(NexusRanking.winRate) + 내전 전체 랭킹(globalRank) 표시
    - "이 챔피언 승률 vs 내전 전체 승률" 비교: 챔피언 특화인지 판단 가능
      예: 내전 전체 45% 승률 유저가 탐켄치로 70% → 진짜 탐켄치 장인

  경매 낙찰가 뱃지 (AUCTION 모드 매치가 있는 경우만):
    - 해당 챔피언 평균 낙찰가 상위 25% + masteryScore 상위 25% 동시 만족
      → "커뮤니티 인증" 뱃지: 커뮤니티가 이 유저를 이 챔피언 장인으로 인정했음을 의미
    - 해당 챔피언 평균 낙찰가만 상위 25%
      → "고평가" 뱃지
  ```

  **API 응답 구조**:
  ```typescript
  {
    championId: number,
    appliedCriteria: {           // 실제 적용된 자격 기준 (완화 여부 포함)
      minTier: string,           // ex: "DIAMOND", "PLATINUM"
      minRank: string,           // ex: "II", "I"
      minGames: number,
      minWinRate: number,
      isRelaxed: boolean,        // 완화 적용 여부
    },
    totalUniquePlayersOnChamp: number,  // 이 챔피언 플레이한 전체 유저 수
    qualifiedCount: number,             // 자격 통과 유저 수
    masteries: Array<{
      rank: number,              // 1~50
      userId: string,
      username: string,
      riotTier: string,          // ex: "DIAMOND"
      riotRank: string,          // ex: "I"
      champGames: number,        // 해당 챔피언 내전 게임 수
      champWins: number,
      champWinRate: number,      // 표시용 (단순 winRate)
      wilsonLower: number,
      avgKda: number,
      masteryScore: number,      // 0~100
      scoreBreakdown: { volume: number, skill: number, impact: number, recency: number },
      lastPlayedAt: string,
      nexusWinRate: number,      // 내전 전체 승률 (NexusRanking)
      nexusGlobalRank: number | null,
      avgSoldPrice: number | null,  // AUCTION 모드 매치 있는 경우만
      badges: Array<'커뮤니티 인증' | '고평가' | '기준 완화'>,
    }>
  }
  ```

  **주의(caveat)**: 커뮤니티 규모가 작아 D2+ 유저 자체가 적은 경우, 동적 완화가 자주 발동될 수 있음. 장기적으로는 커뮤니티가 성장할수록 기준이 의미를 가지므로, 초기에는 완화 기준 적용 사실을 UI에 투명하게 노출하는 것이 핵심.

---

## Phase 4: 백엔드 — 조합 분석 API

- [ ] Task 15: `GET /stats/lab/synergy` — 시너지 조합 API
  - 챔피언 2인 동반 픽 시 승률 목록
  - `LabSynergySnapshot` 기반 조회
  - 필터: 특정 챔피언 기준 시너지 파트너 조회
  - **정렬 기준**: `wilsonLower` DESC (단순 winRate 정렬 금지 — 2게임 2승 100%가 상위에 오는 문제 방지)
  - **시너지 유의성 표시**: `expected_win_rate = champA_winRate × champB_winRate / 0.5` 대비 실제 조합 승률이 유의하게 높은 경우만 "시너지 효과 있음" 뱃지 부여 (독립 가정 대비 초과 승률)

- [ ] Task 16: `GET /stats/lab/counter` — 카운터 상성 API
  - 챔피언 A vs 챔피언 B 매치업 승률
  - `LabCounterSnapshot` 기반 조회
  - 포지션 기준 필터 (같은 포지션 맞라인 상성)
  - **표시 기준**:
    - 유리(favorable): `wilsonLower > 0.55`
    - 불리(unfavorable): `wilsonUpper < 0.45` (Wilson score 상한이 45% 미만)
    - 무난(even): 그 외

- [ ] Task 17: `GET /stats/lab/compositions` — 팀 구성 유형 분석 API
  - 팀 조합을 유형 분류 (한타/스플릿/포킹/속공/탱커라인)
  - **분류 알고리즘**:
    ```
    챔피언 태그 매핑 (Data Dragon champion.json 기반):
    - 한타(Teamfight): tags에 "Mage" 또는 "Tank" 3명 이상
    - 스플릿(Split push): tags에 "Fighter" + 듀얼러 2명 이상
    - 포킹(Poke): tags에 "Mage" 2명 이상 + 장거리 챔피언
    - 속공(Early aggro): 평균 게임 시간 25분 미만 승률이 높은 챔피언 위주
    - 탱커라인(Tank line): tags에 "Tank" 3명 이상

    분류 우선순위: 복수 유형 해당 시 가장 높은 태그 매칭 비율 유형으로 분류
    ```
  - **주의(caveat)**: 태그 기반 분류는 근사치(approximation)이며, 실제 팀 전략과 괴리가 있을 수 있음. "참고용" 뱃지 상시 표시.
  - 유형별 승률 집계 + 현재 내전에서 가장 강한 팀 구성 유형 TOP 3

---

## Phase 5: 백엔드 — 오라클 API

- [ ] Task 18: `GET /stats/lab/oracle/auction-efficiency` — 경매 효율 분석 API
  - **독점 콘텐츠**: `TeamMember.soldPrice` ↔ `MatchParticipant` 성과 조인
  - **조인 경로**: `TeamMember(teamId, userId)` → `Team(id, roomId)` → `Match(roomId)` → `MatchParticipant(matchId, userId)`
  - 낙찰가 구간별 평균 KDA, 데미지, 승률
    - 구간: 0~99 / 100~199 / 200~399 / 400~599 / 600+ (경매 포인트 단위)
  - **효율 스코어(Efficiency Score) 산출**:
    ```
    1. 성과 복합 점수 계산:
       performance = 0.4 × kda_norm + 0.3 × damage_norm + 0.3 × win_norm
       (각 지표는 전체 참가자 대비 percentile rank로 정규화, 0~1 범위)

    2. 기대 성과 계산 (선형 회귀):
       expected_performance = β₀ + β₁ × soldPrice
       (최소자승법으로 β₀, β₁ 추정. 매 스냅샷 갱신 시 재학습)

    3. 효율 잔차(residual):
       efficiency = performance - expected_performance

    4. 판별 기준:
       가성비왕: efficiency > +1σ (잔차의 표준편차 기준 상위)
       고평가:   efficiency < -1σ (잔차의 표준편차 기준 하위)
    ```
  - **시각화 데이터**: 산점도용 (x=soldPrice, y=performance) 원시 데이터 + 회귀선 계수 응답에 포함
  - **유찰(soldPrice=0 또는 null) 처리**: 경매 모드 경기만 대상 (`Room.teamMode = 'AUCTION'`), 유찰 유저는 별도 "유찰 후 성과" 섹션으로 분리

- [ ] Task 19: `POST /stats/lab/oracle/balance-score` — 팀 밸런스 예측 API
  - 요청: `{ teamA: userId[], teamB: userId[] }`
  - 응답: 양 팀 예상 승률, 신뢰도, 과거 유사 조합 레퍼런스 수
  - **유저 실력 스코어(Player Strength Score) 산출**:
    ```
    개별 유저 PSS 계산 (최근 N게임 기반, N=20):
      base_winrate = Wilson lower bound (최근 20게임)
      kda_factor = avg_kda / median_kda_전체유저   // 1.0이 평균
      damage_factor = avg_damage_share             // 팀 내 데미지 비중

      PSS = base_winrate × 0.6 + kda_factor × 0.1 + damage_factor × 0.1
            + nexus_ranking_winrate × 0.2

    nexus_ranking_winrate: NexusRanking 테이블의 장기 승률 (안정화 지표)
    ```
  - **팀 승률 예측 알고리즘**:
    ```
    1단계: 팀 평균 PSS 계산
      team_pss_A = mean(PSS of teamA members)
      team_pss_B = mean(PSS of teamB members)

    2단계: Bradley-Terry 모델 기반 승률 변환
      P(A wins) = team_pss_A / (team_pss_A + team_pss_B)

    3단계: 과거 직접 대전 보정 (선택적)
      - teamA와 teamB 멤버가 3명 이상 겹치는 과거 매치 검색
      - 해당 매치가 5게임 이상이면 직접 대전 승률을 30% 가중 반영:
        P_final = 0.7 × P(Bradley-Terry) + 0.3 × P(직접 대전)
      - 직접 대전 데이터 부족 시 Bradley-Terry 결과만 사용

    4단계: 신뢰도 산출
      - 참가자 전원의 평균 게임 수 기반
      - 전원 10게임 이상: "신뢰도 높음"
      - 전원 5게임 이상: "신뢰도 보통"
      - 그 외: "참고용" + "일부 유저의 데이터가 부족합니다" 메시지
    ```
  - **주의(caveat)**: 이 예측은 개인 실력 기반이며, 챔피언 선택/밴픽/컨디션/소통 등 게임 내 변수를 반영하지 않음. UI에 "참고용 예측이며 실제 결과와 다를 수 있습니다" 문구 상시 표시.
  - **ELO/TrueSkill 도입 시점**: 커뮤니티 규모가 충분히 커져 유저당 평균 30게임 이상이 되면, PSS 대신 TrueSkill 레이팅 시스템 도입을 검토. 현재 소표본에서는 수렴이 느려 실용성이 떨어짐.

- [ ] Task 20: `GET /stats/lab/oracle/ban-recommend` — 밴픽 추천 API
  - 요청: `?userIds=...` (오늘 참가자 유저 ID 목록)
  - **추천 우선순위 결정 로직**:
    ```
    각 참가자의 챔피언 풀에서 밴 후보 점수 계산:

    ban_score = Σ (각 상대 유저 u에 대해):
      user_mastery(u, champ) × 0.5     // 해당 유저의 장인 점수 (games × wilsonLower)
      + meta_strength(champ) × 0.3     // 현재 메타 티어 스코어 (S=1.0, A=0.75, B=0.5, C=0.25)
      + threat_score(u, champ) × 0.2   // 해당 유저가 이 챔피언으로 최근 5게임 내 승률

    추천 밴 = ban_score DESC 상위 5개

    추천 결과에 밴 이유(reason) 포함:
    - "user_mastery 기여 높음" → "{유저명}의 주력 챔피언 (N게임 W승률)"
    - "meta_strength 기여 높음" → "현재 S티어 챔피언"
    - "threat_score 기여 높음" → "{유저명}이 최근 높은 승률 기록 중"
    ```
  - **팀 구분 시**: 요청에 `?teamAUserIds=...&teamBUserIds=...`로 팀을 구분하면, 각 팀 시점에서 상대에 대한 밴 추천 제공
  - 현재 메타 강세 챔피언 + 상대 장인 챔피언 교차 분석

---

## Phase 6: 프론트엔드 — 공통 레이아웃

- [ ] Task 21: `/lab` 페이지 탭 레이아웃 재구성
  - 기존 단일 페이지 → 4개 탭 구조로 전환
  - 탭: 메타 레이더 / 챔피언 분석 / 조합 분석 / 오라클
  - URL 쿼리 파라미터로 탭 상태 관리 (`?tab=meta`)
  - 기간 필터 (30일/90일/전체) 글로벌 상태로 공유

- [ ] Task 22: `lab-store.ts` Zustand 스토어 생성
  - 전역 기간 필터, 포지션 필터 상태 관리
  - 탭별 캐시 무효화 처리

---

## Phase 7: 프론트엔드 — 메타 레이더 탭

- [ ] Task 23: 메타 레이더 탭 UI 구현
  - **트렌딩 챔피언 카드** — 챔피언 아이콘 + 픽률 변화 화살표 + 승률
  - **포지션별 티어 그리드** — 5포지션 × 티어 (S/A/B/C/D) 표
  - **내전 vs 랭크 메타 비교 섹션** — 승률 차이 ±N% 강조 (이게 핵심 차별점)
  - 패치 임팩트 카드 (수혜/피해 챔피언 각 3개)
  - 신뢰도 등급 뱃지 (`low` / `moderate` / `high`) 각 지표 옆에 표시

---

## Phase 8: 프론트엔드 — 챔피언 분석 탭

- [ ] Task 24: 챔피언 목록 뷰 구현
  - 챔피언 검색 인풋 (한글/영문 모두 지원)
  - 픽률 / 승률 / 밴률 정렬 가능한 테이블
  - 포지션 필터 칩
  - 티어 뱃지 자동 표시 (tier_score 기반)
  - 게임 수 5 미만 챔피언은 목록에서 기본 숨김 (토글로 표시 가능)

- [ ] Task 25: 챔피언 상세 모달/패널 구현
  - 기간별 승률 추이 라인 차트 (recharts/nivo)
  - 포지션별 분포 파이 차트
  - 최고 성과 빌드 TOP 5 (아이템 아이콘 2개 + 승률/게임 수)
  - 최고 성과 룬 TOP 3
  - 장인 목록 (최대 50위):
    - 1위: 왕관 아이콘 + 티어 배지(D2/마스터 등) + 이름 + 챔피언 게임 수 + 챔피언 승률 + 내전 전체 승률
    - 2~3위: 실버/브론즈 메달 아이콘 + 동일 정보
    - 4~50위: 컴팩트 테이블 (순위/이름/티어/게임수/승률/masteryScore 바)
    - "커뮤니티 인증" / "고평가" 뱃지 표시
    - 완화 기준 적용 시 상단에 "플래티넘1 이상 기준으로 표시 중" 안내 배너
    - 자격 통과자 < 3명 시 "장인 데이터 부족" 안내
    - scoreBreakdown 툴팁: 볼륨/실력/임팩트/최근성 각 점수 세부 표시
  - 신뢰도 등급별 UI 차별화 (low: 흐리게, high: 강조)

---

## Phase 9: 프론트엔드 — 조합 분석 탭

- [ ] Task 26: 시너지 조합 뷰 구현
  - 챔피언 선택 → 시너지 파트너 승률 순위 표시
  - 조합 카드: 챔피언 두 아이콘 + 게임 수 + 승률 + 신뢰도 뱃지
  - 최소 게임 수 미달 조합은 "데이터 부족" 처리

- [ ] Task 27: 카운터 상성 뷰 구현
  - 챔피언 선택 → 상대하기 좋은/나쁜 챔피언 목록
  - 색상 코딩: 빨간(불리) / 초록(유리) — Wilson bound 기반 판별
  - 포지션 기준 필터

- [ ] Task 28: 팀 구성 유형 분석 뷰 구현
  - 유형별 승률 바 차트
  - 각 유형 대표 챔피언 아이콘 예시
  - "참고용" 뱃지 상시 표시

---

## Phase 10: 프론트엔드 — 오라클 탭

- [ ] Task 29: 경매 효율 분석 뷰 구현
  - **핵심 콘텐츠**: 낙찰가 구간별 평균 성과 그래프 (산점도 + 회귀선)
  - 가성비왕 TOP 5 / 고평가 TOP 5 카드
  - 전체 경매 참가자 효율 테이블

- [ ] Task 30: 팀 밸런스 예측기 UI 구현
  - 유저 검색 → 팀 A / 팀 B에 드래그 or 버튼으로 배치
  - "예측" 버튼 → 승률 바 + 신뢰도 + 유사 과거 조합 참고 수 표시
  - 결과: "팀 A 승률 58% — 신뢰도 보통 — 샘플 12게임" 형식
  - "참고용 예측" 면책 문구 상시 표시

- [ ] Task 31: 밴픽 추천기 UI 구현
  - 참가자 선택 (최대 10명)
  - 추천 밴 챔피언 카드 (이유 포함: "A 유저 장인 + 현재 S티어")
  - 포지션별 픽 추천 (현재 OP 챔피언 기준)

---

## Phase 11: 마무리

- [ ] Task 32: React Query 쿼리 키 정의 및 prefetch 설정
  - `lab-queries.ts` 파일에 모든 Lab API 쿼리 키 상수화
  - 메타 레이더 탭은 진입 시 자동 prefetch

- [ ] Task 33: 빈 데이터 상태 처리
  - 데이터 부족 시 각 섹션별 EmptyState 컴포넌트
  - 신뢰도 등급에 따른 차등 메시지:
    - insufficient (< 5게임): "아직 충분한 게임 데이터가 없어요"
    - low (5~14게임): "데이터가 적어 참고용으로만 활용하세요"

- [ ] Task 34: 모바일 반응형 처리
  - 탭 네비게이션 모바일 스크롤 처리
  - 테이블 → 카드 뷰 전환 (모바일)
  - 차트 크기 반응형

- [ ] Task 35: 스냅샷 초기 데이터 시딩 및 콜드스타트 Admin API
  - 배포 후 첫 스냅샷은 cron 대기 없이 수동 트리거 가능하도록 Admin API 추가
  - `POST /admin/lab/recompute-snapshots` — 전체 재계산 강제 실행
  - `GET /admin/lab/data-phase` — 현재 단계(0~4) + 게임 수 + 다음 단계까지 남은 게임 수 반환
  - Match 저장 후 게임 수가 단계 임계값(10/30/100/300)을 돌파하면 Bull 큐로 즉시 스냅샷 재계산 트리거
  - 중복 실행 방지: Bull job `{ jobId: 'lab-snapshot', removeOnComplete: true }` 옵션으로 동시 중복 실행 차단

- [ ] Task 36: 빌드/린트 검증

---

## Phase 12: 추가 분석 기능 (확장)

- [ ] Task 37: 유저 간 상성 분석 API (`GET /stats/lab/oracle/head-to-head`)
  - 내전 독점 기능: 같은 커뮤니티 유저 A vs 유저 B의 직접 대전 전적
  - `MatchParticipant` 기반 — 같은 matchId에서 다른 teamId인 두 유저 조회
  - 응답: 직접 대전 횟수, A 승률, 포지션별 상성, 최근 5경기 결과
  - **의미**: 외부 사이트에서 절대 제공할 수 없는 커뮤니티 내부 데이터. 유저 간 라이벌 관계나 상성을 분석하여 밴픽/팀 구성 전략에 활용 가능.

- [ ] Task 38: 시간대별/요일별 패턴 분석 (`GET /stats/lab/meta/play-patterns`)
  - `Match.completedAt` 기준 요일/시간대별 게임 빈도 및 승률 편차 분석
  - 내전은 보통 저녁~야간에 집중되므로 시간대별 참가자 수/컨디션 차이가 승률에 영향을 줄 수 있음
  - 히트맵 시각화 (요일 × 시간대 매트릭스)

---

## DB 모델링 요약

### 추가 필드 (기존 모델)
```prisma
model Match {
  // ... 기존 필드
  patchVersion String?  // ex: "14.8" — 패치 임팩트 분석용
}
```

### 신규 모델 3개
```prisma
// 챔피언 집계 캐시 — 야간 cron 갱신
model LabChampionSnapshot {
  id           String   @id @default(cuid())
  period       String   // '30d' | '90d' | 'all'
  patchVersion String?
  championId   Int
  position     String?  // null = 전체 포지션
  games        Int
  wins         Int
  avgKda       Float
  avgDamage    Float
  avgGold      Float
  pickRate     Float    // 해당 기간 전체 게임 대비 픽률
  banRate      Float    // 해당 기간 전체 게임 대비 밴률
  wilsonLower  Float    // Wilson score 하한 — 정렬/티어 기준
  computedAt   DateTime @default(now())

  @@unique([period, patchVersion, championId, position])
  @@index([period, championId])
  @@index([period, position, wilsonLower])
  @@map("lab_champion_snapshots")
}

// 챔피언 2인 시너지 캐시
model LabSynergySnapshot {
  id          String   @id @default(cuid())
  period      String
  champ1Id    Int      // 항상 champ1Id < champ2Id (정규화)
  champ2Id    Int
  games       Int
  wins        Int
  winRate     Float    // 표시용
  wilsonLower Float    // 정렬 기준
  computedAt  DateTime @default(now())

  @@unique([period, champ1Id, champ2Id])
  @@index([period, champ1Id])
  @@index([period, champ2Id])
  @@map("lab_synergy_snapshots")
}

// 챔피언 상성 캐시
model LabCounterSnapshot {
  id          String   @id @default(cuid())
  period      String
  champId     Int
  vsChampId   Int
  position    String?  // null = 전체 포지션, 값 있으면 맞라인 상성
  games       Int
  wins        Int      // champId 기준 wins
  winRate     Float    // 표시용
  wilsonLower Float    // 정렬 기준
  computedAt  DateTime @default(now())

  @@unique([period, champId, vsChampId, position])
  @@index([period, champId])
  @@index([period, champId, position])
  @@map("lab_counter_snapshots")
}
```

### 기존 데이터 활용 정리
- `MatchParticipant` — 챔피언/빌드/룬/성과 모든 원본 데이터
- `TeamMember.soldPrice` — 경매 효율 분석 원본 (독점)
- `MatchTeamStats.bans` — 밴률 집계 (JSON: 챔피언 ID 배열)
- `NexusRanking` — 유저 기본 승률 (팀 밸런스 예측에 활용)
- `Match.completedAt` — 시간대별 패턴 분석

### Wilson Score Interval 구현 참고

```typescript
/**
 * Wilson score interval 하한 계산
 * @param wins - 승리 수
 * @param total - 전체 게임 수
 * @param z - 신뢰 수준 (기본 1.96 = 95% CI)
 * @returns Wilson lower bound (0~1)
 */
function wilsonLower(wins: number, total: number, z = 1.96): number {
  if (total === 0) return 0;
  const p = wins / total;
  const denominator = 1 + (z * z) / total;
  const centre = p + (z * z) / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);
  return (centre - spread) / denominator;
}
```

---

**Last Updated**: 2026-04-16
