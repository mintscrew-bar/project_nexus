# Lab 랭크/내전 분리 통계 대시보드 TODO

> 작성일: 2026-04-28
> 목적: 랩 대시보드를 "랭크 vs 내전 챔피언 흐름 차이를 학습할 수 있는" 비교 도구로 확장
> 연계 문서: [Lab 대시보드 리팩터 TODO](./TODO_lab_dashboard_refactor.md)

---

## 배경

현재 랩은 "내전 분석기에 랭크가 외부 참고 카드로만 붙은" 비대칭 구조. 유저가 두 모드의 게임 흐름 차이(예: 아지르가 랭크에서와 내전에서 풀어가는 방식이 다름)를 데이터로 보고 새로운 시도/대처를 학습할 수 있게 하는 게 목표.

핵심 자산: **같은 사람이 랭크와 내전을 둘 다 함**. OP.GG/u.gg가 절대 못 가지는 데이터.

---

## 데이터 비대칭 진단

| 항목 | 내전 | 랭크 (LabRankedChampionSnapshot) |
|---|---|---|
| 표본 | 전체 내전 매치 raw | priority=7 시딩 유저만 (챌/그마 일부) |
| 포지션별 | 있음 | `position` 컬럼만 있고 null만 채워짐 |
| 아이템 빌드 | 2아이템 조합 | 없음 |
| 룬 | primaryStyle/subStyle/keystone | 없음 |
| 장인 (유저 단위) | 내전 게임 기준 | 개념 자체 없음 |
| 기간 옵션 | 30d/90d/all | 7d/30d/current_patch (다름) |

→ 랭크 쪽은 "메타 챔피언 통계 수준"에서 멈춰 있음. UI에 source 토글만 붙여도 빌드/룬/장인 카드는 빈 상태. 따라서 **랭크 데이터 깊이부터 맞추는 게 선결 과제**.

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

## Step 2: RankedMatchParticipant 스키마 + 마이그레이션

- [ ] Step 2-1: Prisma 스키마 추가
  - `packages/database/prisma/schema.prisma`에 `RankedMatchParticipant` 모델 추가
  - 필드: matchId, puuid, championId, position, items[6], runes(prim/sub/keystone), spells[2], kda, win, patchVersion, gameEndAt, queueId
  - 인덱스: (puuid, championId), (championId, patchVersion), (matchId)
  - 합성 unique key: (matchId, puuid)

- [ ] Step 2-2: `pnpm db:push` 후 client regenerate
  - `pnpm db:generate`

---

## Step 3: 추출 파이프라인 + ingest 범위 확장

- [ ] Step 3-1: `RankedMatchExtractor` 서비스 신설
  - 입력: RiotMatchCache 행 (또는 fresh match-v5 응답)
  - 출력: 10개 RankedMatchParticipant 행 upsert
  - 핵심 로직: participants 배열 파싱, 아이템/룬/스펠 추출
  - 위치: `apps/api/src/modules/stats/utils/ranked-match-extractor.ts`

- [ ] Step 3-2: ingest 워커 수정
  - `RiotMatchService` 또는 `LabTasksService`에서 fetch 후 즉시 extractor 호출
  - 추출 성공 시 raw JSON은 단기 보존 (TTL 정책 결정 필요)

- [ ] Step 3-3: `KnownPuuid.priority` 범위 확장
  - 현재 priority=7만 ingest → priority>=1 (등록 유저 전체)로 확장
  - 점진 백필을 위한 워커 일정 조정 (rate limit 고려)

- [ ] Step 3-4: 백필 잡
  - 기존 `RiotMatchCache`에 들어있는 raw에서 `RankedMatchParticipant` 일괄 추출
  - 어드민 트리거 endpoint 신설

- [ ] Step 3-5: 단기 raw TTL 정책
  - `RiotMatchCache` 7~14일 자동 정리 (cron task)
  - 이미 추출 완료 행만 삭제 (안전장치)

---

## Step 4: API source 파라미터 통일

- [ ] Step 4-1: 백엔드 endpoint에 `source` 파라미터 추가
  - 대상: `GET /champions`, `GET /champions/:id`, `GET /champions/:id/mastery`
  - source: `custom` (default) | `ranked-community` | `ranked-meta`
  - LabStatsService에 source별 분기 로직

- [ ] Step 4-2: React Query 키에 source 포함
  - `apps/web/src/lib/lab-queries.ts`의 키 정의에 source 추가

- [ ] Step 4-3: `statsApi.getLab*` 시그니처 확장

---

## Step 5: 챔피언 상세 "내전 ↔ 랭크" 비교 UI

- [ ] Step 5-1: source 토글/탭 추가
  - 위치: `apps/web/src/app/lab/champions/[championId]/page.tsx`
  - 옵션: 내전 / 랭크(커뮤니티) / 랭크(메타) 3개

- [ ] Step 5-2: 비교 모드 ("나란히 보기")
  - 두 source 동시 fetch → 같은 카드 안에 좌/우 배치

- [ ] Step 5-3: 신뢰도/표본 뱃지 통일

---

## Step 6: 장인 토글 + "양쪽 장인" 파생 뱃지

- [ ] Step 6-1: `getChampionMastery`에 source 파라미터
  - 같은 스코어 공식 (volume × wilsonLower × KDA × recency)
  - source별 별도 집계

- [ ] Step 6-2: 두 소스 교집합 = "양쪽 장인" 자동 뱃지
  - 백엔드에서 derived 필드로 부여

- [ ] Step 6-3: UI에서 source 토글 + 뱃지 표시

---

## Step 7: 빌드 정의 → 코어 빌드 시퀀스

- [ ] Step 7-1: 빌드 row 구조 확장
  - 현재: 2아이템 조합
  - 신규: coreItems(1코어→2코어→3코어), boots, runes(full), spells, skillOrder

- [ ] Step 7-2: 집계 로직
  - participant 행에서 빌드 시퀀스 추출 (timeline 없이도 최종 인벤토리 + 구매 순서 일부 가능)

- [ ] Step 7-3: UI 카드 재디자인

---

## Step 8: /lab/compositions, /lab/oracle 페이지 구현

- [ ] Step 8-1: `/lab/compositions` 페이지
  - 백엔드 endpoint(`GET /compositions`, `/synergy`, `/counter`)는 이미 존재
  - 프론트 페이지만 작성

- [ ] Step 8-2: `/lab/oracle` 페이지
  - 이미 일부 sub-route는 존재 (balance/ban/h2h)
  - 메인 페이지(경매 효율) 작성

---

## 진행 상황

- 전체: 1 / 24
- Step 1: 1 / 1 ✓
- Step 2: 0 / 2
- Step 3: 0 / 5
- Step 4: 0 / 3
- Step 5: 0 / 3
- Step 6: 0 / 3
- Step 7: 0 / 3
- Step 8: 0 / 2
