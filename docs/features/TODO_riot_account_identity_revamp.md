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

- [ ] Task 1: 모든 Riot 호출(account/summoner/league/match)이 공유하는 **전역 토큰버킷(100/2분, 20/1초)** 구현. 그룹별 캡 위에 전역 합산 캡을 얹는다.
- [ ] Task 2: `RIOT_RATE_LIMITS` 값을 퍼스널 키 실측 기준으로 재조정 (또는 전역 캡으로 단일화)

### B. 전체 승률/티어 — entries 기반

- [ ] Task 3: `getRankedInfoByPuuid`(`riot.service.ts:340`)가 솔로 + 자유랭크를 함께 반환
- [ ] Task 4: `RiotAccount`에 `soloWins/soloLosses/flexTier/flexRank/flexLp/flexWins/flexLosses` 추가 (스키마는 `migrate deploy`)
- [ ] Task 5: 등록·동기화·3시 크론(`lab-tasks.service.ts:138`, 이미 entries 호출 중)에서 solo+flex 승/패 저장 — 추가 호출 0
- [ ] Task 6: 전적 헤더/프로필 승률을 ingest 표본 대신 `entries` 시즌 누적으로 표시

### C. 챔피언 숙련도 — champion-mastery-v4

- [ ] Task 7: `champion-masteries/by-puuid/{puuid}` fetch + `ChampionMastery` 테이블 신설 (포인트/레벨/lastPlayTime)
- [ ] Task 8: 챔프 통계 카드에 숙련 포인트/레벨 배지 표시

### D. 챔피언 시즌 통계 — 증분 누적

- [ ] Task 9: 챔피언 통계 경로에서 `findUserByRiotAccount` 의존 제거 → **등록 여부 무관** puuid만으로 생성
- [ ] Task 10: 첫 검색 = 매치 ID 1콜 + 최근 N판만 즉시 집계, 나머지 시즌 매치는 **저속 background 큐**로 스캔 ("수집 중" 표시)
- [ ] Task 11: 챔피언 집계 결과를 **영구 테이블에 누적**, `KnownPuuid.rankedLastMatchId` 이후 신규만 증분
- [ ] Task 12: 외부인/부분 집계는 "최근 N판 기준" 임을 UI에 명시 (시즌 전체 아님)
- [ ] Task 13: "시즌" 정의를 달력 연도(`stats.service.ts:269`) → Riot 실제 시즌/스플릿 경계로 교정

### E. 예산 회수 (Lab 보류 후속)

- [ ] Task 14: `tasks.service.ts` `matchFetchConfigs` 백그라운드 대량 ingest 크론 비활성화 → 남은 예산을 전적 검색·챔피언 누적에 할당 (Lab UI는 유지)

---

## 미결 디테일

- 첫 검색 즉시 집계 N판 수 (20? 50?)
- background 챔피언 스캔에 줄 예산 비율 (전역 100/2분 중 몇 %)
- 누적 우선순위: 등록 유저 > 자주 검색 puuid > 1회성 외부인
- 챔피언 누적 저장 테이블: 기존 `SummonerSeasonTier`(비어있음) 활용 vs 신규 테이블
