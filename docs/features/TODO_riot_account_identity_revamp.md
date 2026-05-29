# 전적/계정 식별 개선 + Lab 보류 TODO

> 작성일: 2026-05-29
> 목적: 시즌 전적·승률·숙련도를 Riot API에서 정확히 받아오고, Lab을 보류해 매치 대량 ingest 호출을 줄인다.
> 연계 메모리: Lab 기능 보류 (2026-05), Ranked 매치 저장 전략

---

## 배경

계정 식별이 부실하다고 느끼는 두 가지 실제 원인:

1. **시즌 솔로랭크 승/패를 `entries`에서 받고도 버린다.** `getRankedInfoByPuuid`(`riot.service.ts:340`)는 `wins/losses`를 받아오지만 `RiotAccount` 스키마에 컬럼이 없어 저장 안 됨. 자유랭크(`RANKED_FLEX_SR`)는 아예 무시.
2. **프로필 승률이 부정확.** `stats.service.ts:1035`가 "우리가 ingest한 매치 표본"으로 승률을 계산 → 실제 시즌 판수/승률과 불일치.
3. **챔피언 숙련도(`champion-mastery-v4`) 미사용.** stats의 `masteryScore`는 매치 기반 내부 점수일 뿐, 실제 숙련 포인트/레벨이 아님.

### 핵심 통찰 (방향 전환)

시즌 승/패를 `entries`에서 직접 받으면 **승률 집계용 매치 대량 ingest가 불필요**해진다. 그 ingest의 사실상 유일한 소비자는 Lab인데, Lab은 밴율 통계 미작동 등 문제가 많아 **일단 보류(크론만 끄고 UI 유지)**. 따라서:

- 시즌 전적/승률 → `entries`에서 직접 (MATCH 호출 0)
- 프로필 최근 전적 → 진입 시 10~20판만 on-demand 로드
- 백그라운드 상시 매치 ingest 크론 → 중단

---

## 결정 사항 (2026-05-29 확정)

- **시즌 전적**: 솔로 + 자유랭크 둘 다 저장.
- **숙련도**: `champion-mastery-v4`로 전체 숙련도 동기화·저장.
- **Lab**: 크론(백그라운드 ingest·snapshot·recompute)만 끄고 **UI 페이지는 유지** (기존 정규화 데이터로 계속 표시).
- 진행: 본 문서로 정리만, 구현은 추후.

---

## 작업 목록

### A. 스키마

- [ ] Task 1: `RiotAccount`에 시즌 전적 컬럼 추가 — `soloWins`, `soloLosses`, `flexTier`, `flexRank`, `flexLp`, `flexWins`, `flexLosses` (기존 `tier/rank/lp`는 솔로 기준 유지)
- [ ] Task 2: `ChampionMastery` 테이블 신설 — `riotAccountId`, `championId`(Int), `championPoints`, `championLevel`, `lastPlayTime`, `@@unique([riotAccountId, championId])`, `onDelete: Cascade`
- [ ] Task 3: 스키마 반영 — 운영 호스트이므로 `migrate deploy` 사용 (dev compose 금지)

### B. 백엔드 — 수집

- [ ] Task 4: `getRankedInfoByPuuid`(`riot.service.ts:340`)가 솔로 + 자유랭크를 함께 반환하도록 확장
- [ ] Task 5: `registerRiotAccount` / `syncRankedInfo`에서 solo+flex 승/패 persist
- [ ] Task 6: 챔피언 숙련도 fetch 메서드 추가 — `GET /lol/champion-mastery/v4/champion-masteries/by-puuid/{puuid}` (kr 라우팅, HIGH 그룹). 등록·수동 sync 시 `ChampionMastery` upsert
- [ ] Task 7: 새벽 3시 티어 갱신 크론(`lab-tasks.service.ts:138`) 인라인 fetch에 flex·wins/losses persist + 숙련도 갱신 추가 (entries는 이미 호출 중 → 추가 호출 0)

### C. 백엔드 — Lab/ingest 크론 중단

- [ ] Task 8: `tasks.service.ts` `matchFetchConfigs` 백그라운드 ingest 크론 비활성화 (env 플래그 또는 크론 데코레이터 제거)
- [ ] Task 9: `lab-tasks.service.ts` LabSnapshot·recompute 크론 비활성화
- [ ] Task 10: `StatsRecomputeQueue` 기반 시간당 재계산 크론 중단 검토
- [ ] Task 11: Lab UI 페이지·라우트는 그대로 유지 (제거하지 않음). 데이터가 멈춰도 기존 스냅샷 표시

### D. 프론트 — 표시

- [ ] Task 12: 프로필 시즌 전적 블록을 `RiotAccount.soloWins/soloLosses`(+flex) 기반으로 교체 — Riot 공식 수치와 일치
- [ ] Task 13: 기존 ingest 집계 승률은 "최근 N판" 맥락으로 라벨 분리
- [ ] Task 14: 프로필 최근 전적을 10~20판 on-demand 로드 + 더보기 페이지네이션
- [ ] Task 15: 챔프 카드에 실제 숙련 포인트/레벨 배지 추가 (`championId` → 한글명은 `@nexus/types` lol-mappings)

---

## 미결 디테일

- 숙련도 저장 범위: 전체 챔프 vs 포인트 있는 것만 vs Top N (DB 행 수 트레이드오프)
- 자유랭크 표시 위치: 솔로 옆 나란히 vs 탭 분리
- 숙련도 동기화 주기: 매일 크론 전 계정 vs 등록·수동 sync 때만
- Lab 크론 중단 방식: env 플래그 vs 데코레이터 제거 (되살리기 쉬운 쪽 선호)
