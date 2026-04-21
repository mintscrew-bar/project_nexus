# 전적 페이지 크롤링/배치 처리 개선 계획

> 진행 기준일: 2026-04-16
> 완료: 28 / 전체: 31개 (Task 1~23 + Task 2-1 + Task 24~27 완료)
> 연계 문서: [Lab 대시보드 TODO](./TODO_lab_dashboard.md)

---

## 구현 스케줄 (권장)

### Sprint 1 — 수집/캐시 기반 확정

**목표**: Riot API 수집 파이프라인과 유저별 캐시 키 구조를 먼저 안정화한다.

- 포함 범위:
  - Task 1 `KnownPuuid`
  - Task 2 `MatchStatsCache`
  - Task 2-1 `StatsRecomputeQueue`
  - Task 4 RiotAccount 등록/수정 시 `KnownPuuid` upsert
  - Task 5 `RiotMatchService.getMatchById()` PUUID 전파
  - Task 6 `MatchFetchTask`
- 완료 기준:
  - Nexus 유저의 연결 계정 목록이 수집 큐에 반영됨
  - `KnownPuuid`가 priority 승격 포함해 정상 전파됨
  - 배치가 pagination 방식으로 누락 없이 `RiotMatchCache`를 채움
  - 스키마/시딩/기초 테스트까지 통과

### Sprint 2 — 개인 통계 API 완성

**목표**: `userId` 기준 개인 통계 캐시와 API를 실제로 닫는다.

- 포함 범위:
  - Task 7 `MatchStatsComputeTask`
  - Task 8 `getChampionStats(userId, queueGroup)`
  - Task 9 `POST /stats/refresh/:userId`
  - Task 10 `GET /stats/fetch-status/:userId`
  - Task 11 챔피언 통계 탭 추가
  - Task 12 `RecentStatsSummary` 탭 구조 개선
  - Task 13 갱신 버튼 및 수집 상태 UX
- 완료 기준:
  - `ranked/normal/aram/custom/all`이 모두 `userId` 기준으로 계산됨
  - 유저 페이지에서 여러 RiotAccount가 하나의 전적으로 보임
  - `isPartial`, `computedAt`, 수동 새로고침이 실제로 동작함

### Sprint 3 — 운영 보강 + Lab 연결 준비

**목표**: 운영 가시성을 추가하고 Lab이 개인 통계를 참조할 준비를 마친다.

- 포함 범위:
  - Task 14 Admin API
  - Task 15 `KnownPuuid` 정리 배치
  - Task 16/17 시딩
  - Task 18 빌드/린트/배포 체크
  - Task 19 통계 유틸 공통화
  - Task 20 MatchStatsCache → Lab PSS 최적화
  - Task 21 custom 집계 로직 공통화
  - Task 22 Lab 콜드스타트 fallback
  - Task 23 배치 순서 문서화
- 완료 기준:
  - 운영자가 수집 상태를 모니터링할 수 있음
  - Lab이 `MatchStatsCache`를 안전하게 재사용할 수 있음
  - 이후 Lab 구현이 독립적으로 진행 가능함

### 착수 순서 고정

1. 스키마 추가: `KnownPuuid`, `MatchStatsCache`, `StatsRecomputeQueue`
2. 수집 로직: RiotAccount upsert, PUUID 전파, `MatchFetchTask`
3. 집계 로직: `MatchStatsComputeTask`
4. API: champion-stats, refresh, fetch-status
5. 프론트: 챔피언 탭/수집 상태 UX
6. 운영/시딩/Lab 연계

### 이번 주 기준 최소 범위

- 이번 주에는 **Sprint 1 전체 완료**를 1차 목표로 둔다.
- Sprint 2는 `MatchStatsComputeTask` 설계와 API 계약 확정까지 선행하고, 프론트 탭 작업은 그 다음에 붙인다.

---

## 현황 및 문제점

### 핵심 결정사항 (2026-04-16 확정)

- **개인 통계 집계 단위는 "PUUID"가 아니라 "Nexus 유저" 기준**으로 통일한다.
  - 랭크/일반/칼바람도 최종 응답은 `userId` 기준으로 합산한다. 여러 RiotAccount를 연결한 유저는 연결된 모든 `puuid`를 묶어 1개의 전적 프로필로 본다.
  - 특히 `custom`/`all`은 반드시 `userId` 기준으로 계산한다. 계정별로 분리 저장하지 않는다.
- `KnownPuuid`는 **수집 큐**이고, `MatchStatsCache`는 **유저별 집계 결과 캐시**다. 둘의 키는 다를 수 있다.
- 재계산 트리거는 `RiotMatchCache.createdAt`만으로 잡지 않고, **dirty user queue** 또는 동등한 대상자 테이블을 별도로 둔다.
- 배치 증분 수집은 `lastMatchId 이후 20개` 같은 고정 상한 방식이 아니라, **마지막 처리 지점을 만날 때까지 pagination** 하는 방식으로 누락 없이 진행한다.

### 지원 큐 타입 (프론트 QUEUE_TABS 기준)

| queueId | 명칭 | 수집 방식 |
|---------|------|---------|
| 420 | 솔로 랭크 | Riot match-v5 API |
| 440 | 자유 랭크 | Riot match-v5 API |
| 400 | 일반 드래프트 | Riot match-v5 API |
| 430 | 일반 블라인드 | Riot match-v5 API |
| 450 | 칼바람 나락 | Riot match-v5 API |
| 0 | 내전(토너먼트) | **내부 DB 우선** (Riot API fallback) |

> **내전(queueId=0)**: 토너먼트 코드로 진행된 경기는 Riot match-v5에서도 `queueId=0`으로 조회 가능하다.
> 단, 우리 플랫폼에서 내전은 자체 `Match`/`MatchParticipant` 테이블에 이미 저장되어 있으므로,
> **Nexus 등록 유저는 내부 DB에서 파생**하고 Riot API는 재호출하지 않는다.
> 미등록 유저(외부에서 전적 검색만 한 경우)는 Riot API의 queueId=0 결과로 내전 전적을 표시한다.

### 큐 그룹 정의 (배치/캐시 단위)

```
RANKED  = [420, 440]        — Riot API 수집
NORMAL  = [400, 430]        — Riot API 수집
ARAM    = [450]             — Riot API 수집
CUSTOM  = [0]               — Nexus 등록 유저: 내부 DB / 미등록 유저: Riot API
ALL     = RANKED + NORMAL + ARAM + CUSTOM  (전체 탭용)
```

### 현재 문제점

**문제 1 — `RankedChampionStats`는 랭크(420+440)만 집계**
- 일반/칼바람/내전 챔피언 통계 API가 없음
- 프론트에서 챔피언 통계 사이드바가 랭크 탭만 있음

**문제 2 — 실시간 집계 병목**
- Redis 만료 시 수백 판을 다시 집계. 미캐시 40개 기준 최대 **48초 대기** 가능.

**문제 3 — PUUID 전파 없음**
- 매치 참가자 9명의 PUUID를 저장하지 않아 유저가 직접 검색해야만 `RiotMatchCache`가 채워짐.

**문제 4 — `RankedStatsCache` DB 없음**
- Redis(10분)만 있어 서버 재시작 시 cold start 발생.

---

## Phase 0: DB 스키마 추가

- [x] Task 1: `KnownPuuid` 모델 추가
  > 연계: [Lab Task 14 (장인 시스템)](./TODO_lab_dashboard.md) — KnownPuuid로 수집된 랭크 전적이 장인 D2+ 티어 게이트 판별에 활용됨
  > 연계: [Lab Task 7 (티어 배치 갱신)](./TODO_lab_dashboard.md) — RiotTierRefreshTask 대상 선정에 KnownPuuid.isNexusUser 활용 가능
  - 매치에서 발견된 PUUID를 저장하는 전파 큐. 큐 타입 무관하게 PUUID 단위로 관리.
  ```prisma
  model KnownPuuid {
    puuid         String    @id
    gameName      String?
    tagLine       String?
    priority      Int       @default(0)
    isNexusUser   Boolean   @default(false)  // Nexus 등록 유저 여부
    // 큐 그룹별 마지막 수집 상태 (CUSTOM은 Nexus 등록 유저에겐 해당 없음)
    rankedFetchedAt  DateTime?
    normalFetchedAt  DateTime?
    aramFetchedAt    DateTime?
    customFetchedAt  DateTime?  // 미등록 유저의 queueId=0 수집용
    // 증분 수집용 마지막 matchId (큐 그룹별)
    rankedLastMatchId  String?
    normalLastMatchId  String?
    aramLastMatchId    String?
    customLastMatchId  String?
    createdAt     DateTime  @default(now())
    updatedAt     DateTime  @updatedAt

    @@index([priority, rankedFetchedAt])
    @@index([priority, normalFetchedAt])
    @@index([priority, aramFetchedAt])
    @@index([isNexusUser, priority])
    @@map("known_puuids")
  }
  ```
  - **우선순위 정책**:
    - Nexus 등록 유저 PUUID → priority=10, isNexusUser=true
    - 고티어 시딩 PUUID → priority=7, isNexusUser=false
    - 내전 유저와 같은 게임 플레이어 → priority=5
    - 일반 전파 → priority=0
  - **Nexus 등록 유저의 CUSTOM 수집 생략**: `isNexusUser=true`인 PUUID는 `customFetchedAt` 갱신 안 함. 내전 통계는 내부 `Match` 테이블에서 파생.

- [x] Task 2: `MatchStatsCache` 모델 추가
  > 연계: [Lab Task 2 (LabChampionSnapshot)](./TODO_lab_dashboard.md) — MatchStatsCache는 유저별 개인 통계, LabChampionSnapshot은 커뮤니티 전체 챔피언 집계. 중복 아님, 집계 단위가 다름
  > 연계: [Lab Task 19 (PSS 계산)](./TODO_lab_dashboard.md) — 오라클 팀 밸런스 예측에서 유저별 최근 20게임 성과를 MatchStatsCache에서 조회 가능 (실시간 집계 불필요)
  > 연계: [Lab 콜드스타트 전략](./TODO_lab_dashboard.md) — 내전 데이터 0~9게임 구간에서 MatchStatsCache의 ranked/normal 전적을 참고 데이터로 표시
  - 유저별 × 큐 그룹별 pre-calculated 챔피언 통계를 DB에 영구 저장
  - 기존 Redis-only `stats:ranked-champ:*` 캐시를 DB로 격상
  ```prisma
  model MatchStatsCache {
    id          String   @id @default(cuid())
    userId      String
    queueGroup  String   // 'ranked' | 'normal' | 'aram' | 'custom' | 'all'
    season      String   // ex: "2026"
    stats       Json     // ChampionStat[] 직렬화
    matchCount  Int      // 집계된 매치 수
    isPartial   Boolean  @default(false)
    computedAt  DateTime @default(now())

    @@unique([userId, queueGroup, season])
    @@index([userId])
    @@map("match_stats_cache")
  }
  ```
  - **집계 키 원칙**:
    - `MatchStatsCache`는 `userId` 기준으로 저장
    - 하나의 유저가 여러 RiotAccount를 연결한 경우, 연결된 모든 `puuid`를 합산하여 하나의 `ranked/normal/aram/all` 캐시로 계산
    - `KnownPuuid`는 수집용이며, 캐시 키로 재사용하지 않음
  - **custom queueGroup 데이터 출처**:
    - Nexus 등록 유저: 내부 `MatchParticipant WHERE userId = ?`
      → KDA/CS/데미지/아이템/룬/비전 등 전체 스탯 + 낙찰가/팀 구성 Nexus 전용 데이터
    - 미등록 유저: `RiotMatchCache` WHERE `queueId = 0` (전적 검색 전용 fallback)
      → KDA/CS/데미지/아이템/룬/비전 등 match-v5 전체 스탯 (낙찰가 등 Nexus 전용 제외)
    - 두 케이스 모두 표시되는 스탯 항목은 동일. 차이는 Nexus 전용 추가 데이터 유무뿐.

- [x] Task 2-1: `StatsRecomputeQueue` 모델 추가
  - 목적: "어떤 유저의 통계를 다시 계산해야 하는가"를 `RiotMatchCache`와 분리해서 추적
  ```prisma
  model StatsRecomputeQueue {
    userId      String   @id
    reason      String?  // 'riot-match-added' | 'custom-match-added' | 'account-linked' | 'manual-refresh'
    queuedAt    DateTime @default(now())
    lastSeenAt  DateTime @updatedAt

    @@index([queuedAt])
    @@map("stats_recompute_queue")
  }
  ```
  - Riot 매치가 새로 저장되었을 때 해당 `puuid`와 연결된 `userId`를 enqueue
  - 내전 매치가 저장/수정되었을 때 참가자 `userId`를 enqueue
  - 수동 새로고침/계정 연결 시도 동일 큐를 사용

- [x] Task 3: DB 스키마 푸시 및 Prisma 클라이언트 재생성
  - `pnpm db:push && pnpm db:generate`

---

## Phase 1: 백엔드 — PUUID 전파 로직

- [x] Task 4: RiotAccount 등록/수정 시 `KnownPuuid` 자동 upsert
  - `RiotService.registerRiotAccount()` 완료 시 해당 PUUID를 priority=10으로 upsert
  - `RiotService.syncRankedInfo()` 완료 시도 동일 (이미 있으면 priority만 올림)

- [x] Task 5: `RiotMatchService.getMatchById()` 에 PUUID 전파 훅 추가
  - 매치 데이터를 **DB에 새로 저장할 때만** 발동 (이미 캐시된 경우 스킵)
  - `match.metadata.participants` 10개 PUUID를 `KnownPuuid`에 upsert
    ```typescript
    // 내전 유저가 포함된 매치라면 함께한 상대방 priority=5, 아니면 priority=0
    const hasNexusUser = await prisma.knownPuuid.findFirst({
      where: { puuid: { in: puuids }, priority: { gte: 10 } }
    });
    const propagatePriority = hasNexusUser ? 5 : 0;
    await Promise.all(
      puuids.map((puuid) =>
        prisma.knownPuuid.upsert({
          where: { puuid },
          create: { puuid, priority: propagatePriority },
          update: {
            priority: { set: Math.max(existing.priority, propagatePriority) }
          }
        })
      )
    );
    ```
  - **주의**: 기존 레코드가 있어도 priority를 더 높은 값으로 승격할 수 있어야 함. `createMany(skipDuplicates)`만으로는 부족.
  - **중요**: 큐 타입별 `*FetchedAt`은 건드리지 않음. 전파만 등록하고, 실제 수집은 배치가 담당.

---

## Phase 2: 백엔드 — 배치 Cron Job

- [x] Task 6: `MatchFetchTask` — 큐 그룹별 매치 사전 수집 배치
  - `@Cron('*/30 * * * *')` (30분마다)
  - **큐 그룹별 수집 주기 및 우선순위**:

    | 큐 그룹 | 수집 주기 | 대상 | 이유 |
    |---------|---------|------|------|
    | RANKED (420+440) | 6시간 | 전체 KnownPuuid | 장인 시스템, 챔피언 통계 핵심 |
    | NORMAL (400+430) | 12시간 | 전체 KnownPuuid | 참고용 |
    | ARAM (450) | 24시간 | 전체 KnownPuuid | 챔피언 풀 참고용 |
    | CUSTOM (0) | 배치 불필요 (Nexus 유저) | isNexusUser=true | 내부 DB에서 파생 |
    | CUSTOM (0) | 24시간 (미등록 유저) | isNexusUser=false | 외부 검색 유저 전적 |

  - **한 번의 배치 실행에서 큐 그룹별 처리 인원 배분 (50명 총량)**:
    ```
    RANKED 미수집/갱신 필요: 최대 25명
    NORMAL 미수집/갱신 필요: 최대 15명
    ARAM   미수집/갱신 필요: 최대  7명
    CUSTOM 미수집/갱신 필요: 최대  3명  (isNexusUser=false만)
    (동일 PUUID가 여러 큐에 걸쳐 처리될 수 있음)
    ```

  - **대상 선정 쿼리 (RANKED 기준, NORMAL/ARAM도 동일 패턴)**:
    ```sql
    SELECT puuid FROM known_puuids
    WHERE ranked_fetched_at IS NULL
       OR ranked_fetched_at < NOW() - INTERVAL '6 hours'
    ORDER BY priority DESC, ranked_fetched_at ASC NULLS FIRST
    LIMIT 25
    ```

  - **증분 수집 전략**:
    ```
    rankedLastMatchId 있음 (기존 수집 유저):
      → match-v5 /by-puuid 최신 순 조회 + pagination
      → rankedLastMatchId를 만날 때까지 계속 페이지 조회
      → 그 사이의 matchId만 신규 처리
      → 마지막으로 확인한 "최신 matchId"로 rankedLastMatchId 업데이트

    rankedLastMatchId 없음 (신규):
      → 시즌 시작일(SEASON_2026_START) 이후 전부 수집
      → 완료 후 rankedLastMatchId = 가장 최신 matchId
    ```
  - **누락 방지 규칙**:
    - PUUID당 "최대 20개만 처리" 같은 고정 상한으로 종료하지 않음
    - 한 배치 실행의 시간 예산을 초과하면 현재 cursor를 저장하고 다음 실행에서 이어서 진행
    - 즉, 처리량 상한은 두되 **정합성 상한은 두지 않는다**

  - **불변성 원칙**: `RiotMatchCache`에 이미 있는 matchId는 Riot API 재호출 안 함
  - **Rate limit**: 페이지/매치 호출 사이 150ms 간격 + 전체 배치 동시성 제한
  - 수집 완료 후 PUUID 전파 (Task 5 로직 재사용)
  - `KnownPuuid.*FetchedAt` 업데이트

- [x] Task 7: `MatchStatsComputeTask` — 전 큐 그룹 통계 pre-calculate 배치
  > 연계: [Lab Task 8 (LabSnapshotTask)](./TODO_lab_dashboard.md) — 실행 순서: MatchFetchTask(매 30분) → MatchStatsComputeTask(매 정시) → LabSnapshotTask(새벽 4시). MatchStatsCache가 갱신된 후 Lab 스냅샷이 이를 참조해야 하므로 순서 준수 필수
  - `@Cron('0 * * * *')` (매 정시, 1시간마다)
  - **대상**: `StatsRecomputeQueue`에 쌓인 `userId`
  - **각 userId마다 queueGroup별 재계산**:
    ```
    ranked: 연결된 RiotAccount.puuid 전체에 대해 RiotMatchCache WHERE queueId IN (420, 440)
    normal: 연결된 RiotAccount.puuid 전체에 대해 RiotMatchCache WHERE queueId IN (400, 430)
    aram:   연결된 RiotAccount.puuid 전체에 대해 RiotMatchCache WHERE queueId IN (450)
    custom: MatchParticipant WHERE userId = ?
    all:    ranked + normal + aram + custom 합산
    ```
  - 결과를 `MatchStatsCache(userId, queueGroup, season)`에 upsert + Redis에도 저장 (TTL=1시간)
  - 재계산 성공 시 `StatsRecomputeQueue`에서 해당 `userId` 제거
  - `isPartial=true` 조건:
    - 연결된 RiotAccount가 1개 이상 있으나 아직 해당 queueGroup fetch가 한 번도 안 된 `puuid`가 있는 경우
    - 또는 수집 중 cursor가 남아 있는 경우

---

## Phase 3: 백엔드 — API 개선

- [x] Task 8: `getChampionStats(userId, queueGroup)` — 통합 챔피언 통계 API
  > 연계: [Lab Task 12 (챔피언 목록 통계)](./TODO_lab_dashboard.md) — Lab 챔피언 API는 커뮤니티 전체 집계, 이 API는 개인별 집계. 동일 `wilsonLower` 함수를 공통 유틸(`@nexus/types` 또는 `packages/stats-utils`)에서 공유해야 함
  - 기존 `getRankedChampionStats(gameName, tagLine)` 를 대체
  - `GET /stats/champion-stats?gameName=&tagLine=&queueGroup=ranked|normal|aram|custom|all`
  - 내부 구현은 `gameName/tagLine → userId` 해석 후 `userId` 기준 캐시를 조회
  - **조회 계층**:
    ```
    Redis (1시간) → MatchStatsCache DB → 실시간 집계 (fallback)
    ```
  - Redis 키: `stats:champ:{queueGroup}:{userId}`
  - 응답에 `computedAt`, `isPartial`, `matchCount`, `queueGroup` 포함
  - **기존 `getRankedChampionStats` 하위 호환**: `queueGroup` 파라미터 없으면 `ranked` 기본값

- [x] Task 9: `POST /stats/refresh/:userId?queueGroup=` — 수동 갱신 트리거
  - 큐 그룹 지정 갱신 (미지정 시 ranked만)
  - Rate limit: 유저당 30분에 1회
  - 지정 userId를 `StatsRecomputeQueue(reason='manual-refresh')`에 enqueue
  - 필요 시 연결된 `KnownPuuid.priority`를 20으로 올려 다음 fetch 배치도 당김
  - 구현: `reason='manual-refresh:{queueGroup}'`로 enqueue, 선택 큐 캐시 무효화, Riot 계정 연결 PUUID priority=20 승격

- [x] Task 10: `GET /stats/fetch-status/:userId` — 수집 상태 조회
  - 연결된 계정 목록 + 각 큐 그룹별 최신 `*FetchedAt`, `isPartial`, `matchCount` 반환
  - 프론트엔드 "마지막 갱신 N분 전" 표시용

---

## Phase 4: 프론트엔드 — 챔피언 통계 탭 확장

- [x] Task 11: 챔피언 통계 사이드바 탭 추가
  > 연계: [Lab Task 24/25 (챔피언 분석 탭)](./TODO_lab_dashboard.md) — 전적 페이지 '내전' 탭과 Lab 챔피언 분석은 동일한 내전 MatchParticipant 데이터를 원본으로 사용. 개인 통계(이쪽)와 커뮤니티 통계(Lab)의 UI 진입 동선이 다를 뿐
  - 현재: 랭크 탭 / Nexus 탭
  - 변경: **랭크 / 일반 / 칼바람 / 내전 / 전체 / Nexus** 6탭
  - 각 탭에서 `GET /stats/champion-stats?queueGroup=ranked|normal|aram|custom|all` 호출
  - 칼바람 탭: CS 컬럼 숨기고 KDA + 데미지 위주로 표시
  - 내전 탭:
    - **공통**: KDA, CS, 데미지, 아이템, 룬, 비전, 게임 시간 등 match-v5 전체 스탯 표시
      (토너먼트 코드 경기는 일반 랭크와 동일한 match-v5 데이터 구조)
    - Nexus 등록 유저: 위 공통 스탯 + **내전 독점 데이터** (낙찰가, 팀 구성 방식, 내전 랭킹 연동)
    - 미등록 유저: 공통 스탯만 표시 (낙찰가 등 Nexus 전용 데이터 없음)
    - 미등록 유저에게 "Nexus에 등록하면 낙찰가·팀 구성 이력 등 추가 통계를 볼 수 있어요" 유도 문구

- [x] Task 12: `RecentStatsSummary` 탭 구조 개선
  - 현재: 전체 / 솔로랭크 / 일반게임
  - 변경: 전체 / 솔로랭크 / 자유랭크 / 일반게임 / 칼바람
  - 각 탭에서 해당 queueId 매치만 필터링
  - 자유랭크(440) 탭 신규 추가

- [x] Task 13: 갱신 버튼 및 수집 상태 UX
  - 챔피언 통계 탭 전환 시 해당 queueGroup의 `isPartial` 상태 확인
  - `isPartial=true` 이면 "수집 중..." 인디케이터 + "새로고침" 버튼 강조
  - "마지막 계산: N분 전" 툴팁 표시 (`computedAt` 기반)
  - 새로고침 버튼 → `POST /stats/refresh/:puuid?queueGroup={현재탭}` 호출

---

## Phase 5: 운영 & 관리

- [x] Task 14: Admin API — 배치 상태 모니터링
  - `GET /admin/matches/queue-stats`:
    ```json
    {
      "knownPuuids": { "total": 12453, "nexusUsers": 48, "seeded": 950 },
      "fetchPending": {
        "ranked": {
          "total": 342,  // rankedFetchedAt IS NULL or stale
          "nexus": 12,
          "seeded": 340
        },
        "normal": 891,
        "aram": 1203,
        "custom": 210
      },
      "riotMatchCacheSize": 98432,
      "matchStatsCacheSize": { "ranked": 4821, "normal": 2341, "aram": 1023, "custom": 211, "all": 4821 }
    }
    ```
  - `POST /admin/matches/trigger-fetch?queueGroup=ranked` — 배치 수동 실행
  - `POST /admin/matches/recompute-stats?puuid=` — 특정 PUUID 통계 강제 재계산
  - 구현: `recompute-stats?userId=` 도 함께 지원 (내부 집계 키가 userId 기반이기 때문)

- [x] Task 15: `KnownPuuid` 크기 관리
  - 보관 정책:
    - priority ≥ 10 (내전 유저): 영구 보관
    - priority 5~9 (내전 동반 + 시딩): 180일 미활동 시 priority=0 강등
    - priority 0~4: 365일 미활동 시 삭제
  - `@Cron('0 2 1 * *')` (매월 1일 새벽 2시) 정리 배치

---

## Phase 6: 마이그레이션 & 시딩

- [x] Task 16: 기존 `RiotAccount` PUUID 시딩
  - `packages/database/prisma/seed-known-puuids.ts`
  - 모든 `RiotAccount.puuid` → `KnownPuuid` priority=10으로 upsert

- [x] Task 17: 기존 `RiotMatchCache` PUUID 역추출 시딩
  - `packages/database/prisma/backfill-known-puuids.ts`
  - 이미 캐시된 매치에서 `metadata.participants` PUUID 추출 → `KnownPuuid` upsert
  - 1,000건씩 배치 처리 (메모리 부하 방지)

- [x] Task 18: 빌드/린트 검증 및 배포 체크리스트
  - `pnpm build && pnpm lint`
  - 배포 순서: DB 마이그레이션 → 시딩 스크립트 → 서버 재시작 → Admin 수동 배치 트리거
  - 검증(2026-04-17): `pnpm lint`, `pnpm build` 모두 통과

---

## Phase 7: Lab 연계 확장

- [x] Task 19: 통계 유틸 공통 패키지 추출
  > 연계: [Lab 공통 인프라 전체](./TODO_lab_dashboard.md) — Lab과 Matches 양쪽에서 동일 로직 사용
  - `packages/stats-utils/` 신규 패키지 생성 (또는 `@nexus/types`에 추가)
  - **공통화 대상 함수/상수**:
    ```typescript
    // Wilson Score Interval 하한 계산
    export function wilsonLower(wins: number, total: number, z?: number): number;

    // Wilson Score Interval 상한 계산 (카운터 상성 판별용)
    export function wilsonUpper(wins: number, total: number, z?: number): number;

    // 신뢰도 등급 판별
    export type ConfidenceLevel = 'insufficient' | 'low' | 'moderate' | 'high';
    export function getConfidenceLevel(games: number): ConfidenceLevel;

    // 신뢰도 임계값 상수
    export const CONFIDENCE_THRESHOLDS = {
      insufficient: 5,  // < 5: 비표시
      low: 15,          // 5~14: 참고용
      moderate: 30,     // 15~29: 일반
      high: Infinity,   // 30+: 높음
    } as const;

    // 티어 비교 유틸 (장인 시스템 + 티어 갱신 공용)
    export function tierScore(tier: string, rank: string): number;
    export function isTierAbove(tier: string, rank: string, minTier: string, minRank: string): boolean;
    ```
  - Lab(`LabStatsService`) 및 Matches(`MatchStatsComputeTask`, `getChampionStats`) 모두 이 패키지에서 import
  - **주의**: 현재 Lab TODO에 인라인으로 정의된 `wilsonLower` 함수 구현체를 이 패키지로 이동
  - 구현: `@nexus/types`에 `stats-utils.ts` 추가, `calculateTierScore/tierScore/isTierAbove/wilsonLower/wilsonUpper/getConfidenceLevel` export

- [x] Task 20: MatchStatsCache → Lab PSS 연계 조회 최적화
  > 연계: [Lab Task 19 (팀 밸런스 PSS)](./TODO_lab_dashboard.md) — PSS 계산에 필요한 유저별 최근 20게임 성과를 MatchStatsCache에서 조회
  - `MatchStatsCache`에 `recentGames Json?` 필드 추가 고려 (최근 20게임 요약 통계)
    ```
    recentGames: {
      last20: { wins: number, games: number, avgKda: number, avgDamageShare: number },
      lastPlayedAt: string
    }
    ```
  - 이렇게 하면 Lab 오라클이 PSS 계산 시 유저별 MatchStatsCache 1건만 조회하면 됨 (매번 MatchParticipant 20행 집계 불필요)
  - `MatchStatsComputeTask` (Task 7)에서 `recentGames` 함께 계산하여 저장
  - 구현: `MatchStatsCache.recentGames` 필드 추가, `ranked/normal/aram/custom/all` 전부 집계 시 최근 20게임 요약(`avgKda`, `avgDamageShare`, `lastPlayedAt`)을 함께 upsert

- [x] Task 21: 내전(custom) 데이터 집계 로직 중복 제거
  > 연계: [Lab Task 8 (LabSnapshotTask)](./TODO_lab_dashboard.md) — 내전 MatchParticipant 집계 로직이 Lab과 Matches 양쪽에 존재
  - **현재 문제**: 내전 데이터 집계가 두 곳에서 발생
    - `MatchStatsComputeTask`: 유저별 custom queueGroup 개인 챔피언 통계
    - `LabSnapshotTask`: 커뮤니티 전체 챔피언 통계 (LabChampionSnapshot)
  - **통합 방안**: 공통 집계 함수 `aggregateCustomMatchStats(filters)` 추출
    ```typescript
    // apps/api/src/modules/stats/utils/custom-match-aggregator.ts
    export async function aggregateCustomMatchStats(prisma: PrismaClient, options: {
      userId?: string;      // 특정 유저 (Matches용) 또는 null (Lab 전체용)
      period?: '30d' | '90d' | 'all';
      position?: string;
      groupBy: 'champion' | 'champion+position' | 'user+champion';
    })
    ```
  - Lab과 Matches 모두 이 함수를 호출하되, `groupBy`와 필터만 다르게 전달
  - 구현: `apps/api/src/modules/stats/utils/custom-match-aggregator.ts` 추가, `StatsService(custom)`와 `LabStatsService.computeChampionSnapshots()`가 동일 집계 유틸 사용

- [x] Task 22: KnownPuuid 기반 Lab 콜드스타트 보완 데이터 제공
  > 연계: [Lab 콜드스타트 전략](./TODO_lab_dashboard.md) — 내전 0~9게임 구간에서 MatchStatsCache 랭크 전적을 참고로 표시
  - Lab 0단계(콜드) 상태에서 유저 프로필 조회 시:
    - `MatchStatsCache(queueGroup='ranked')` 에서 해당 유저의 챔피언 풀/승률/KDA 가져오기
    - "랭크 전적 기반 성향 참고" 배너와 함께 표시 (내전 데이터가 아님을 명확히 구분)
  - 이를 위해 Lab API에 `GET /stats/lab/user-profile/:userId/fallback` 엔드포인트 추가
    - 내전 게임 수 < 10 일 때만 동작, 10게임 이상이면 404
  - 구현: JWT 보호 하에 `GET /stats/lab/user-profile/:userId/fallback` 추가, `showChampionStats` 프라이버시를 존중하고 `custom < 10`일 때 ranked 캐시 요약/챔피언 풀 반환
  - 확장 구현: `GET /stats/lab/user-profile/:userId/compare` 추가, ranked vs custom 요약 및 챔피언별 delta/signal(`scrim-favored`, `ranked-favored`) 반환

- [x] Task 23: 배치 cron 실행 순서 및 의존성 문서화
  > 연계: [Lab Task 7 (티어 갱신), Lab Task 8 (스냅샷)](./TODO_lab_dashboard.md)
  - **전체 배치 실행 순서 (시간순)**:
    ```
    매 30분  MatchFetchTask         — Riot API → RiotMatchCache 저장
    매 정시  MatchStatsComputeTask  — RiotMatchCache/MatchParticipant → MatchStatsCache 갱신
    새벽 2시 KnownPuuid 정리 배치   — 미활동 PUUID 정리 (매월 1일만)
    새벽 3시 RiotTierRefreshTask    — RiotAccount 티어 갱신 (장인 D2+ 판별 전제)
    새벽 4시 LabSnapshotTask        — LabChampionSnapshot/Synergy/Counter 전체 재계산
    ```
  - **의존 관계 다이어그램**:
    ```
    MatchFetchTask ──→ RiotMatchCache ──→ MatchStatsComputeTask ──→ MatchStatsCache
                                              │                          │
                                              │                          ├─→ Lab PSS (Task 19)
                                              │                          └─→ Lab 콜드스타트 fallback
                                              ▼
    내전 매치 등록 ──→ MatchParticipant ──→ LabSnapshotTask ──→ LabChampionSnapshot
                                              │                  LabSynergySnapshot
                                              │                  LabCounterSnapshot
                                              ▼
    RiotTierRefreshTask ──→ RiotAccount.tier ──→ 장인 D2+ 게이트 (Lab Task 14)
    ```
  - **주의**: RiotTierRefreshTask(새벽 3시)가 LabSnapshotTask(새벽 4시)보다 먼저 실행되어야 장인 목록에 최신 티어가 반영됨. 현재 시간 설정 적절함.
  - 구현 기준 문서화:
    - `TasksService.handleMatchFetch()` — `*/30 * * * *`
    - `TasksService.handleMatchStatsCompute()` — `0 * * * *`
    - `TasksService.handleKnownPuuidCleanup()` — `0 2 1 * *`
    - `LabTasksService.handleRiotTierRefresh()` — `0 3 * * *`
    - `LabTasksService.handleLabSnapshot()` — `0 4 * * *`
  - 현재 상태:
    - Match 쪽 파이프라인은 `KnownPuuid -> RiotMatchCache -> MatchStatsCache`로 완성
    - Lab 쪽 파이프라인은 `MatchParticipant -> Lab*Snapshot`으로 별도 완성
    - 문서에 적힌 "Bull 큐 즉시 트리거"는 아직 미구현이며, 현재는 야간 cron 재계산 기준

---

## 아키텍처 요약 (Lab 연계 포함)

```
[수집 대상 큐]
  솔로랭크(420) + 자유랭크(440) → queueGroup: ranked  (6시간 주기, Riot API)
  일반드래프트(400) + 블라인드(430) → queueGroup: normal  (12시간 주기, Riot API)
  칼바람(450) → queueGroup: aram  (24시간 주기, Riot API)
  내전(0, 토너먼트 코드 경기) →
    Nexus 등록 유저: 내부 Match/MatchParticipant 테이블에서 파생 (Riot API 재호출 없음)
                    → KDA/CS/데미지/아이템/룬 + 낙찰가/팀 구성 등 Nexus 전용 데이터 포함
    미등록 유저:     Riot API queueId=0 수집 (24시간 주기)
                    → KDA/CS/데미지/아이템/룬 등 match-v5 전체 스탯 (낙찰가 등 Nexus 전용 제외)

[데이터 수집 흐름]
  RiotAccount 등록 → KnownPuuid upsert (priority=10)
  유저 검색 → KnownPuuid upsert (priority=3)
  매치 신규 저장 → 참가자 10명 PUUID → KnownPuuid upsert

[배치 흐름 — 시간순 전체 파이프라인]
  매 30분   MatchFetchTask          → RiotMatchCache 저장 (Riot API 수집)
  매 정시   MatchStatsComputeTask   → MatchStatsCache upsert + Redis 갱신
  매월 1일  새벽 2시 KnownPuuidCleanup → KnownPuuid 강등/삭제
  새벽 3시  RiotTierRefreshTask     → RiotAccount.tier 갱신 [Lab 장인 전제]
  새벽 4시  LabSnapshotTask         → LabChampion/Synergy/Counter Snapshot [Lab 전용]

  ※ 현재 구현은 cron 기반 재계산이며, 내전 매치 등록 직후 LabSnapshotTask를 Bull로 즉시 트리거하는 경로는 아직 없다.

[조회 흐름]
  유저 요청 (queueGroup 지정)
    → Redis (1시간) → MatchStatsCache DB → 실시간 집계

[Lab 연계 데이터 흐름]
  MatchStatsCache ──→ Lab PSS 계산 (오라클 팀 밸런스 예측)
  MatchStatsCache ──→ Lab 콜드스타트 fallback (내전 0~9게임 시 랭크 성향 참고)
  MatchParticipant ──→ LabChampionSnapshot (내전 챔피언 커뮤니티 통계)
  MatchParticipant ──→ MatchStatsCache custom (내전 개인 통계)
  KnownPuuid ──→ RiotTierRefreshTask 대상 선정 (isNexusUser=true 우선)

[공통 유틸 — packages/stats-utils 또는 @nexus/types]
  wilsonLower(), wilsonUpper(), getConfidenceLevel(), tierScore()
  → Matches API, Lab API 양쪽에서 import
```

---

## Phase 8: 지능형 랭커 시딩 및 데이터 최적화 [우선순위 재정의]

> 기준일: 2026-04-20
> 운영 리스크(할당량/DB 부하) 대비 효과를 기준으로 [즉시 착수], [조건부], [장기 검토]로 분류한다.

### [즉시 착수] 안정성 방어 (선행 필수)

- [x] **Task 26: `MatchFetchTask` 가중치 및 슬롯 제한 (과부하 방지)**
  - 전체 수집 슬롯(50명) 중 시딩 유저(P7) 비중을 **30%(15명) 이내**로 제한
  - Nexus 유저(P10)는 기존 처리 속도 유지, 시딩 유저는 느린 차선 적용
  - 고티어 시딩 유저의 `rankedFetchedAt` 신선도 목표는 **3일 이내**로 설정 (`< now - 72h` 우선 재수집)
  - 완료 기준:
    - `ranked` 대상 선정 시 P7 상한(15)과 비시딩 슬롯(35)이 코드 레벨에서 보장됨
    - 로그에 `seededCount`, `nexusCount`가 분리 출력됨

- [x] **Task 27: 시딩 유저 최초 소급 범위 제한**
  - `rankedLastMatchId`가 없는 신규 시딩 유저는 최초 수집 범위를 **최근 100판(약 5페이지)** 으로 제한
  - 기존 Nexus 유저/기존 수집 유저는 기존 증분 수집 규칙 유지
  - 완료 기준:
    - 신규 시딩 유저 최초 수집에서 누적 신규 `matchId` 수가 100을 넘기면 다음 배치로 이월됨
    - 결과적으로 Riot match-v5 호출은 queue당 1페이지 수준에서 종료됨
    - `rankedLastMatchId` 저장 및 다음 배치 증분 연동이 정상 동작

### [조건부] 운영 도구 (26/27 완료 후)

- [x] **Task 24: `LeagueScanTask` — 최상위 메타 리더 리스트 정기 수집**
  - 주기: **3일마다 1회** (KR 챌린저 + 그마)
  - `league-v4`의 `puuid`를 `KnownPuuid`로 upsert하며, `priority = GREATEST(priority, 7)` 적용
  - 목표: 고티어 표본 변동을 주 단위가 아닌 72시간 단위로 반영
  - 완료 기준:
    - 시딩 실행 시 P10/Nexus 유저 priority가 절대 하락하지 않음
    - 1회 실행당 추가/갱신 건수 및 실패 건수 로그 제공

- [ ] **Task 24-1: 시딩 데이터 활용 경로 확정 (Phase 8 범위 고정)**
  - Phase 8 범위는 **(1) 장인 시스템 보강 전제 데이터 확보**까지만 포함
  - 즉시 적용:
    - D2+ 고티어에서 특정 챔피언을 많이 플레이하는 PUUID 후보를 KnownPuuid + RiotMatchCache로 조회 가능하도록 유지
  - Phase 8 제외 (Lab TODO 분리):
    - (2) 랭크 메타 챔피언 스냅샷 신규 테이블/배치/UI
    - (3) Lab PSS 티어 베이스라인 보정 로직

- [x] **Task 25: `AdminSeedingAPI` — 수동 시딩 트리거**
  - 엔드포인트: `POST /admin/matches/seed-high-tiers`
  - 운영자가 점검 후 특정 시점 즉시 시딩 가능하도록 제공
  - 완료 기준:
    - 관리자 권한 검증 + 호출 rate limit 적용
    - 실행 결과(추가/갱신/실패) 응답 반환

### [장기 검토] 아키텍처 영향 큼

- [ ] **Task 30: 고티어 시딩 단축 주기 확장 (12~24시간)**
  - 현재 목표(3일) 대비 더 짧은 주기(12~24h)로 확장하는 옵션
  - 전제: Riot API quota/서버 부하 모니터링에서 2주 이상 안정성 확인
  - 재검토 조건:
    - 429 비율, 배치 실행 시간, DB write latency가 허용 범위 내일 것

- [ ] **Task 28: 벌크 인서트(Bulk Insert) 최적화**
  - 단순 `createMany(skipDuplicates)` 치환은 보류
  - 이유: 현재 `getMatchById`의 후속 처리(`KnownPuuid` 전파, `StatsRecomputeQueue` enqueue)와 결합되어 있어 부작용 위험이 큼
  - 재검토 조건:
    - 매치 저장과 후처리를 분리한 ingestion pipeline 설계가 먼저 완료될 것

- [ ] **Task 29: 패치 인식형 수집 중단 전략**
  - 목적이 "현재 메타 분석"에 한정될 때만 적용 검토
  - 개인 전적 완결성(히스토리/통계)이 요구되는 기본 파이프라인에는 기본 적용하지 않음
  - 재검토 조건:
    - 메타 분석 전용 시딩 경로(분리 queueGroup 또는 별도 task) 설계 완료

---

**Last Updated**: 2026-04-21
