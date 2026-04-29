# Lab 랭크/내전 분리 통계 대시보드 TODO

> 작성일: 2026-04-28
> 목적: 랩 대시보드를 "랭크 vs 내전 챔피언 흐름 차이를 학습할 수 있는" 비교 도구로 확장
> 연계 문서: [Lab 대시보드 리팩터 TODO](./TODO_lab_dashboard_refactor.md)

---

## 배경

현재 랩은 "내전 분석기에 랭크가 외부 참고 카드로만 붙은" 비대칭 구조. 유저가 두 모드의 게임 흐름 차이(예: 아지르가 랭크에서와 내전에서 풀어가는 방식이 다름)를 데이터로 보고 새로운 시도/대처를 학습할 수 있게 하는 게 목표.

핵심 자산: **같은 사람이 랭크와 내전을 둘 다 함**. OP.GG/u.gg가 절대 못 가지는 데이터.

---

## 데이터 비대칭 진단 (2026-04-28 코드 검증 후 수정)

**진짜 문제는 데이터 ingest가 아니라 집계 로직에 있음.**

| 항목 | 추정 | 실제 |
|---|---|---|
| 등록 유저 ranked 매치 ingest | "확장 필요" | **이미 동작 중** (`tasks.service.ts:74`, `includeNexusUsers: true`, queue 420/440, 6h catch up) |
| Raw → 정규화 추출 | "신설 필요" | **이미 동작 중** (`riot-match-cache-ingest.service.ts`, 이벤트+5분 cron) |
| MatchParticipant 외부 puuid 지원 | "미지원" | **이미 지원** (puuid, userId nullable, riotTeamId) |
| Match 외부 매치 지원 | "미지원" | **이미 지원** (roomId nullable, riotMatchId) |
| 집계 시 내전/랭크 분리 | "분리됨" | ❌ **섞여 있음** (`aggregateCustomMatchStats`가 roomId 필터 안 함) |

### 핵심 버그

`aggregateCustomMatchStats` (`utils/custom-match-aggregator.ts:45-62`)의 WHERE절에 `m."roomId" IS NOT NULL` 같은 내전 필터가 없음. 외부 ranked 매치(roomId=NULL)도 다 같이 집계됨. 즉 "**내전 메타**"라는 라벨로 표시되는 `LabChampionSnapshot`은 사실상 **내전+외부ranked 혼합** 데이터.

### 따라서 진짜 작업

| 원래 계획 | 실제 필요 |
|---|---|
| Step 2 (RankedMatchParticipant 신설) | ❌ 불필요 — MatchParticipant가 이미 양쪽 다 지원 |
| Step 3 (ingest 범위 확장) | ❌ 거의 불필요 — 이미 등록 유저까지 ingest 중 |
| Step 4 (API source 파라미터) | ✅ 그대로 핵심 |
| **NEW: 집계 로직 source 분리** | ✅ 가장 시급 |
| **NEW: LabChampionSnapshot.source 컬럼** | ✅ 분리 저장 |

---

## 핵심 설계 결정

- **랭크 표본**: 등록 유저 ingest 우선(`ranked-community`), 시딩 고티어는 별도 `ranked-meta`로 유지.
- **장인 정의**: 데이터 소스만 토글, 같은 스코어 공식 양쪽 동일. 두 리스트 교집합 자동 "양쪽 장인" 뱃지.
- **권한**: 등록 유저까지 단계별 해금 (운영 작업만 ADMIN).
- **저장 전략 (Extract-and-Discard 3-tier)**:
  | Layer | 데이터 | 보존 |
  |---|---|---|
  | 1. 휘발성 메모리 | Timeline (1MB×다수) | 메모리 LRU only |
  | 2. 단기 raw 캐시 | RiotMatchCache match summary (~50KB) | TTL 7~14일 |
  | 3. 영구 정형 데이터 | RankedMatchParticipant (~250B/행) | 영구 |

---

## 작업 순서

```
Step 1 (권한 오픈) ──┐
                     ├─ Step 4 (API source) ── Step 5 (UI 비교) ── Step 6 (장인) ── Step 7 (빌드)
Step 2 (스키마)      │
Step 3 (추출+ingest)─┘                                                              └─ Step 8 (오라클 등)
```

> **⚠️ 순서 주의**: Step 2 (RankedMatchParticipant 스키마) → Step 3 (추출 + ingest 확장) 순으로 진행. 정형 테이블이 먼저 있어야 raw fetch 즉시 추출 → raw blob 누적 방지.

---

## Step 1: 랩 권한 오픈 (admin → 등록 유저) ✅

- [x] Step 1: 랩 권한 오픈
  - LabController class-level `@Roles(ADMIN)` 제거
  - `GET /stats/lab/data-phase` 신규 (등록 유저 조회 가능)
  - `/admin/lab/data-phase` 제거 (lab 쪽으로 이전)
  - LabLayoutClient: 비로그인만 차단, 재계산 버튼은 어드민 전용
  - **완료**: 2026-04-28 (`a852652`)

---

## Step 2: LabChampionSnapshot에 source 컬럼 추가 ✅

- [x] Step 2-1: Prisma 스키마 변경
  - `LabChampionSnapshot.source: String` 컬럼 추가 (`'custom'` | `'ranked-community'`)
  - unique key 확장: `(source, period, patchVersion, championId, position)`
  - index 확장: `(source, period, championId)`, `(source, period, position, wilsonLower)`
  - 기본값 `"custom"`로 두되, 마이그레이션 후 truncate (캐시 성격이라 안전)

- [x] Step 2-2: `pnpm db:push` + `db:generate`
  - 로컬 DB는 기존 `_prisma_migrations` 상태 불일치로 `migrate deploy` 대신 `db:push:accept` 적용.
  - 배포용 마이그레이션 파일 추가: `20260428_add_lab_champion_snapshot_source`.

- [x] Step 2-3: 운영 절차 — 마이그레이션 직후 admin recompute 1회 트리거
  - 야간 cron(새벽 4시)도 자동으로 새 source 컬럼으로 채움
  - 로컬에서는 기존 혼합 캐시 `lab_champion_snapshots` TRUNCATE 완료. 어드민 UI의 "지금 새로고침" 또는 야간 cron으로 재계산 필요.

---

## Step 3: 집계 로직 source 분리

- [x] Step 3-1: `aggregateCustomMatchStats`에 `source` 옵션 추가
  - `'custom'`: `m."roomId" IS NOT NULL` (내전)
  - `'ranked-community'`: `m."roomId" IS NULL AND m."riotMatchId" IS NOT NULL` (외부 랭크 매치 일반화)
  - 향후 queueId 필터 옵션도 추가 가능 (420/440만)
  - 함수명도 변경 검토 (`aggregateMatchParticipantStats` 같은 중립 이름)

- [x] Step 3-2: `LabStatsService.computeChampionSnapshots` source별 루프
  - `for (source of ['custom', 'ranked-community']) { ... }`
  - 각 source별로 LabChampionSnapshot 행 upsert

- [x] Step 3-3: synergy/counter snapshot도 source 필터
  - 단, synergy/counter는 외부 랭크에서 의미가 약함 (모르는 사람과의 한팀)
  - 일단 custom만 유지하고 ranked는 후속 결정

- [x] Step 3-4: raw TTL 정책 (선택, 후속)
  - `RiotMatchCache` 7~14일 자동 정리 cron (지금 당장 안 해도 됨)
  - 기본 비활성화: `RIOT_MATCH_CACHE_CLEANUP_ENABLED=true`일 때만 실행
  - 삭제 대상: 정규화 완료(`matches.riotMatchId` 존재) + TTL 초과 raw cache
  - 주의: 개인 ranked/normal/aram 재계산이 아직 raw cache를 일부 사용하므로 정형 테이블 기반 전환 후 활성화 권장

---

## Step 4: API source 파라미터 통일

- [x] Step 4-1: 백엔드 endpoint에 `source` 파라미터 추가
  - 대상: `GET /champions`, `GET /champions/:id`, `GET /champions/:id/mastery`
  - source: `custom` (default) | `ranked-community` | `ranked-meta`
  - LabStatsService에 source별 분기 로직

- [x] Step 4-2: React Query 키에 source 포함
  - `apps/web/src/lib/lab-queries.ts`의 키 정의에 source 추가

- [x] Step 4-3: `statsApi.getLab*` 시그니처 확장

---

## Step 5: 챔피언 상세 "내전 ↔ 랭크" 비교 UI

- [x] Step 5-1: source 토글/탭 추가
  - 위치: `apps/web/src/app/lab/champions/[championId]/page.tsx`
  - 옵션: 내전 / 랭크(커뮤니티) / 랭크(메타) 3개

- [x] Step 5-2: 비교 모드 ("나란히 보기")
  - 두 source 동시 fetch → 같은 카드 안에 좌/우 배치

- [x] Step 5-3: 신뢰도/표본 뱃지 통일

---

## Step 6: 장인 토글 + "양쪽 장인" 파생 뱃지

- [x] Step 6-1: `getChampionMastery`에 source 파라미터
  - 같은 스코어 공식 (volume × wilsonLower × KDA × recency)
  - source별 별도 집계

- [x] Step 6-2: 두 소스 교집합 = "양쪽 장인" 자동 뱃지
  - 백엔드에서 derived 필드로 부여

- [x] Step 6-3: UI에서 source 토글 + 뱃지 표시

---

## Step 7: 빌드 정의 → 코어 빌드 시퀀스

- [x] Step 7-1: 빌드 row 구조 확장
  - 현재: 2아이템 조합
  - MVP 추가: `topBuilds` = coreItems(타임라인 구매 순서 우선, 없으면 최종 인벤토리 기반 최대 3개), boots, keystone/primary/sub rune, spells
  - 후속: full rune page UI, skillOrder UI/집계

- [x] Step 7-2: 집계 로직
  - participant 행에서 최종 인벤토리 기반 코어 빌드 묶음 집계
  - timeline 기반 구매 순서가 저장된 participant는 해당 순서를 우선 사용

- [x] Step 7-3: UI 카드 재디자인
  - 챔피언 상세에 코어 빌드 TOP 5 카드 추가

- [x] Step 7-4: timeline 요약 영구 저장
  - `MatchParticipant.itemPurchaseOrder`, `skillOrder`, `timelineExtractedAt` 추가
  - `/stats/match/:matchId/timeline` 조회 시 Riot timeline에서 참가자별 아이템 구매/스킬 레벨업 이벤트를 추출해 정규화 테이블에 저장
  - 대량 backfill은 아직 없음. 조회되거나 수집 루틴에 연결된 매치부터 순차적으로 채워짐.

---

## Step 8: /lab/compositions, /lab/oracle 페이지 구현

- [x] Step 8-1: `/lab/compositions` 페이지
  - 백엔드 endpoint(`GET /compositions`, `/synergy`, `/counter`)는 이미 존재
  - 프론트 페이지만 작성

- [x] Step 8-2: `/lab/oracle` 페이지
  - 이미 일부 sub-route는 존재 (balance/ban/h2h)
  - 메인 페이지(경매 효율) 작성
  - Lab 조회 권한 오픈에 맞춰 하위 페이지 fetch 조건도 등록 유저 기준으로 정리.

---

## 진행 상황

- 전체: 22 / 22
- Step 1: 1 / 1 ✓
- Step 2: 3 / 3 ✓
- Step 3: 4 / 4 ✓
- Step 4: 3 / 3 ✓
- Step 5: 3 / 3 ✓
- Step 6: 3 / 3 ✓
- Step 7: 4 / 4 ✓
- Step 8: 2 / 2 ✓
