# Lab 대시보드 리팩터 TODO

> 작성일: 2026-04-24
> 목적: 현재 `/lab` 대시보드의 기능적·시각적 불편함을 단계적으로 해소
> 연계 문서: [Lab 대시보드 구현 계획](./TODO_lab_dashboard.md), [디자인 시스템](./DESIGN_SYSTEM.md)
> 진행 기준: Opus가 분석 → Sonnet이 실행

---

## 배경 — 현재 상태 진단 요약

`apps/web/src/app/lab/page.tsx` **단일 파일 3,507줄**에 4개 탭(메타/챔피언/조합/오라클) + 모달 + SVG 차트가 모두 들어가 있음. 다음 9가지 문제가 있음:

1. **카드 간 사일로** — 트렌딩 챔피언 → 챔피언 분석, 시너지 → 챔피언 풀 등 *분석 점프*가 안 됨. 모든 카드가 막다른 골목.
2. **모달이 페이지를 흉내냄** — 챔피언 상세가 `Modal size="full"`. URL/공유/뒤로가기 다 깨짐.
3. **오라클 입력이 비실용적** — 10명 분석에 검색·클릭 20회. 방/경기에서 자동 채우기 없음.
4. **분석의 "왜?" 부재** — 패치 임팩트 = 텍스트 리스트만, 시각화·맥락(라이엇 패치 노트) 없음. "브리핑"+"상세"로 같은 데이터 두 번.
5. **챔피언 분석에 장인 명단 없음** — `championMastery` API 호출은 하지만 모달엔 카운트만 표시.
6. **데이터 신선도/투명성 없음** — 마지막 갱신 시각, 다음 갱신, 수동 새로고침, "데이터 단계 N" 의미 모두 부재.
7. **필터 URL 지속성 없음** — `tab`+`period`만 URL. 검색·정렬·H2H·오라클 팀은 새로고침 시 휘발.
8. **데이터 일관성 부족** — 같은 챔피언 승률이 카드마다 표시 형식·기간·신뢰도 처리 다름.
9. **색상 과부하 & 토큰 미사용** — `emerald/cyan/violet/amber/rose/sky/fuchsia` raw 색을 *장식적*으로 씀. 사이트 토큰(`accent-*`, `tier-*`) 미사용.

---

## 색상 토큰 매핑 (모든 작업의 전제)

`apps/web/tailwind.config.ts:12-52` + `apps/web/src/app/globals.css` 에 정의된 토큰만 쓴다. raw Tailwind 색(emerald-500, rose-400, cyan-300 등) **금지**.

| 의미 | 사용 토큰 | 16진 |
|---|---|---|
| 메인 강조/포커스/탭 활성 | `accent-primary` | #667EEA (로고 인디고) |
| 부 강조/링크/하이라이트 | `accent-info` | #0bc4e2 (시안) |
| 보조 강조/그라디언트 끝 | `accent-purple` | #764BA2 (로고 끝색) |
| 양수/유리/상승/우호 | `accent-success` | #00c853 |
| 음수/불리/하락/위험 | `accent-danger` | #ff1744 |
| 주의/경고/표본 부족 | `accent-warning` | #ffa726 |
| 등급/메달/장인 | `accent-gold` | #c89b3c |
| 티어 표시 (S/A/B/C/D 또는 LoL 티어) | `tier-*` | (티어별) |

색 사용 원칙:
- **의미 매핑** 색(success/danger/warning/gold)은 *그 의미에만* 쓴다.
- **카테고리 강조** 색(primary/info/purple)은 *섹션/탭 액센트*로만 쓴다.
- "연구 질문=sky, 공개 조건=amber" 같은 *장식적 색*은 전부 제거.

---

## 진행 순서 (의존성 기준)

```
Phase 0 (정보 설계) ─┐
                     ├─ Phase 1 (구조 분할) ─┬─ Phase 2 (워크플로우)
                     │                       └─ Phase 3 (시각/색상)
                     └─ Phase 4 (관측성/UX 보강)
```

- **Phase 0** 결과물(워크플로우 다이어그램) 없이 Phase 2를 시작하면 점프 링크가 임의 결정됨 → 다시 흔들림.
- **Phase 1** 없이 Phase 3을 하면 3,507줄 파일 한가운데서 색만 바꾸는 꼴이 되어 회귀 위험.
- Phase 2/3/4는 Phase 1 완료 후 병렬 가능.

---

## Phase 0 — 정보 설계 (실행 전 합의 필요)

이 Phase는 **사용자와 합의 후** Phase 1 착수. Sonnet은 자체 결정 금지, 사용자에게 확인.

- [x] Task 0-1: 워크플로우 다이어그램 작성
  - **목표**: "메타 → 챔피언 → 시너지 → 유저 → H2H → 오라클" 6개 노드 간 *점프 화살표*를 정의한다.
  - **결과물**: `docs/lab_workflow.md` — Mermaid 다이어그램 + 각 화살표의 트리거(어떤 클릭이 어떤 컨텍스트를 들고 어디로 가는지).
  - **예시 화살표**:
    - 트렌딩 챔피언 카드 클릭 → `/lab/champions/[id]?period=...`
    - 챔피언 상세 "장인 명단" 클릭 → `/users/[userId]?context=champion-[id]`
    - H2H 결과 매치 클릭 → `/matches/[matchId]`
    - 오라클 결과 챔피언 클릭 → `/lab/champions/[id]`
  - **완료 기준**: 사용자 검토·승인.
  - **의존**: 없음.

- [x] Task 0-2: 메타 탭 섹션 우선순위 결정
  - **목표**: 현재 메타 탭 16개 섹션을 **6개 이하**로 줄일 기준을 정한다.
  - **현재 섹션 목록** (`page.tsx:2745-3501`): 패치 임팩트 브리핑 / 트렌딩 / 랭크 비교 / 티어 그리드 / 활동 패턴 / 패치 임팩트 상세 / 밴률 / 포지션 변화 상세 / 조합 변화 상세 / 라인 퍼포먼스 / 장인 후보 / 시딩 장인 / 챔피언 시그널 / 아이템 트렌드 / 다음 단계 메모 / 연구 질문 메모 / 공개 조건 메모.
  - **결과물**: 우선순위 표 (Keep / Merge / Move-to-detail-route / Drop).
  - **권장 시작점** (사용자 확인 필요):
    - **Keep**: 트렌딩, 티어 그리드, 패치 임팩트(통합), 랭크 비교, 활동 패턴, 챔피언 시그널 → 6개
    - **Merge**: 패치 임팩트 브리핑+상세 → 1개로 / 장인 후보+시딩 장인 → 1개로
    - **Move**: 빌드/룬/포지션은 챔피언 상세 라우트로
    - **Drop**: 라인 퍼포먼스(챔피언 상세에 흡수), 다음 단계/연구 질문/공개 조건 메모(어드민 노트는 본문 밖)
  - **완료 기준**: 사용자 검토·승인.
  - **의존**: 없음.

---

## Phase 1 — 구조 분할 (Phase 2/3/4 모두의 전제)

페이지를 라우트 단위로 쪼개고 *컴포넌트 폴더*를 만든다. 색상·기능 변경 없음, 순수 구조 작업.

- [x] Task 1-1: 라우트 분할
  - **목표**: 단일 `/lab` 페이지를 4개 라우트로 분리.
  - **신규 라우트**:
    - `apps/web/src/app/lab/page.tsx` → 메타 탭 (기본)
    - `apps/web/src/app/lab/champions/page.tsx` → 챔피언 목록
    - `apps/web/src/app/lab/champions/[championId]/page.tsx` → 챔피언 상세 (현재 모달 대체)
    - `apps/web/src/app/lab/compositions/page.tsx` → 조합 분석
    - `apps/web/src/app/lab/oracle/page.tsx` → 오라클 (이후 Task 2-3에서 sub-route로 분할)
  - **공통 레이아웃**: `apps/web/src/app/lab/layout.tsx` — 히어로 + 탭 + 기간 필터 + 단계 안내를 *레이아웃에서* 렌더(현 `page.tsx:911-1071`을 옮긴다).
  - **탭 활성 표시**: `usePathname()` 기반.
  - **완료 기준**:
    - 4개 라우트가 각자 페이지로 동작
    - 탭 클릭이 `router.push`로 동작 (현 `setActiveTab + updateLabQuery` 제거)
    - `lab-store`의 `activeTab` state 제거
  - **의존**: Phase 0 완료.

- [x] Task 1-2: 컴포넌트 폴더 추출
  - **목표**: 3,507줄 page.tsx를 의미 단위 컴포넌트로 쪼갠다.
  - **폴더 구조**: `apps/web/src/components/lab/`
    - `LabHero.tsx` — 히어로 + StatMetric 4개
    - `LabTabBar.tsx` — 탭 + 잠금 안내 + 기간 필터
    - `LabEmptyState.tsx` — 현 `page.tsx:167-216` 추출
    - `LabSourceBadge.tsx`, `BanMetaSourceBadge.tsx` — 현 `page.tsx:133-151` 추출
    - `meta/PatchImpactCard.tsx` (브리핑+상세 통합)
    - `meta/TrendingChampionsCard.tsx`
    - `meta/TierGridCard.tsx`
    - `meta/RankedComparisonCard.tsx`
    - `meta/PlayPatternsCard.tsx`
    - `meta/ChampionSignalsCard.tsx`
    - `champions/ChampionListTable.tsx` (데스크톱 테이블 + 모바일 카드)
    - `champions/ChampionFilters.tsx` (검색/정렬/포지션/표본)
    - `champions/ChampionDetailHero.tsx`, `ChampionDetailCharts.tsx`, `ChampionDetailBuilds.tsx`, `ChampionDetailMastery.tsx`
    - `compositions/SynergyGrid.tsx`, `CounterList.tsx`, `CompositionTypeCard.tsx`
    - `oracle/AuctionEfficiencyCard.tsx`, `TeamBalanceForm.tsx`, `BanRecommendForm.tsx`, `HeadToHeadForm.tsx`
  - **차트**: 인라인 SVG는 `components/lab/charts/` 하위로 추출 (`TrendChart.tsx`, `PositionPie.tsx`, `ScatterChart.tsx`).
  - **완료 기준**:
    - 각 page.tsx 200줄 이하
    - 컴포넌트는 props 기반, 내부에서 `useQuery` 호출 가능 (라우트별 쿼리 동기화)
    - 빌드 통과 + 시각적 회귀 없음 (`pnpm build`)
  - **의존**: Task 1-1.

- [x] Task 1-3: 챔피언 상세 페이지화
  - **목표**: 현재 챔피언 상세 모달(`page.tsx:2448-2728`)을 `/lab/champions/[championId]` 라우트로 옮긴다.
  - **변경 사항**:
    - 챔피언 목록의 row 클릭 → `<Link href="/lab/champions/[id]">`로 변경
    - `<Modal>` 제거, `selectedChampionId` state 제거
    - 페이지 상단에 "← 챔피언 목록" 브레드크럼 + 기간 필터
    - 모바일에선 "Sheet"가 아닌 풀페이지 (이미 페이지니까)
  - **완료 기준**:
    - 새로고침/공유/뒤로가기 모두 동작
    - 여러 챔피언을 새 탭으로 비교 가능
  - **의존**: Task 1-1, 1-2.

---

## Phase 2 — 워크플로우 (사일로 해소)

Phase 0의 다이어그램을 코드로 구현한다.

- [x] Task 2-1: 챔피언 점프 링크 추가
  - **목표**: 챔피언이 등장하는 *모든* 카드에서 챔피언 상세로 점프.
  - **대상 카드**:
    - 트렌딩 챔피언 (`page.tsx:2834`)
    - 티어 그리드 (`page.tsx:2974`)
    - 패치 임팩트 수혜/피해 (`page.tsx:2765`, `2778`, `3093`, `3103`)
    - 밴률 통계 (`page.tsx:3119`)
    - 챔피언 시그널 (`page.tsx:3390`)
    - 시너지 카드 양쪽 챔피언 아이콘 (`page.tsx:2017-2024`)
    - 카운터 카드 양쪽 챔피언 (`page.tsx:2158-2165`)
    - 조합 유형 예시 챔피언 (`page.tsx:2229`)
    - 오라클 결과 챔피언 (밴 추천 결과 등)
  - **방식**: 챔피언 아이콘+이름을 `<Link href="/lab/champions/[id]?period=...">` 래퍼로 감싼다.
  - **완료 기준**: 모든 챔피언 표시 요소가 호버 시 커서 변경 + 클릭 가능 + 기간 컨텍스트 유지.
  - **의존**: Task 1-3.

- [x] Task 2-2: 유저 점프 링크 추가
  - **목표**: 유저가 등장하는 모든 카드에서 유저 페이지(`/users/[userId]`)로 점프.
  - **대상**: 가성비왕/고평가/폼 상승/거품 리스크 (`page.tsx:1248-1320`), 장인 후보(`3262`), 시딩 장인(`3324`), H2H 결과.
  - **추가 액션**: 유저 카드에 "오라클 팀에 추가" 버튼(드롭다운 또는 우클릭 메뉴) — 오라클 페이지로 이동 시 query param에 user ID 누적.
  - **완료 기준**: 유저 행 클릭 = 유저 페이지 이동, 별도 액션 버튼 = 오라클로 누적 추가.
  - **의존**: Task 1-1.

- [x] Task 2-3: 오라클 sub-route 분할 + 입력 흐름 재설계 ⭐ **사용자 가치 최상**
  - **목표**: 오라클을 3개 sub-route로 분리하고, 각 입력에 *방/경기에서 가져오기*를 추가.
  - **신규 라우트**:
    - `/lab/oracle` — 경매 효율 (현 `page.tsx:1076-1467` 부분)
    - `/lab/oracle/balance` — 팀 밸런스 예측
    - `/lab/oracle/ban` — 밴 추천
    - `/lab/oracle/h2h` — 직접 대전 상성
  - **입력 재설계** (밸런스/밴 추천 공통):
    - 옵션 A: "방 코드 입력" → 해당 방 참가자 자동 채우기 (room-store/room API 활용)
    - 옵션 B: "최근 경기에서 가져오기" → 최근 N경기 드롭다운 → 클릭 시 10명 자동 채우기
    - 옵션 C: "내가 즐겨찾는 멤버 그룹" → 사용자별 저장된 프리셋 (별도 스토리지 필요, 후속 task)
    - **최소 옵션 B는 반드시 구현**. A는 방 데이터 접근 가능 시 추가.
  - **URL 지속성**: 팀 A/B/밴 참가자를 URL query param으로 (`?teamA=u1,u2,u3&teamB=u4,u5,u6`)
  - **결과 시각화**: 단일 점수 표시 외에 *어떤 요소가 불균형*인지 분해 (승률 격차 / MMR 격차 / 시너지 격차 등 — 백엔드 응답 구조 확인 후 결정)
  - **완료 기준**:
    - 한 번의 클릭으로 10명 입력 가능
    - URL만으로 결과 재현 가능
    - 결과 챔피언/유저 클릭 = 점프 동작 (Task 2-1, 2-2 의존)
  - **의존**: Task 1-1, 1-2, 2-1, 2-2. **백엔드 API에 "방 → 참가자" 엔드포인트 없으면 옵션 B만 구현하고 A는 별도 task로 분리**.
  - **구현 메모 (2026-04-24)**:
    - 완료: `/lab/oracle`, `/lab/oracle/balance`, `/lab/oracle/ban`, `/lab/oracle/h2h` 분리
    - 완료: 옵션 B(최근 경기에서 가져오기)로 팀 자동 채우기
    - 완료: `teamA/teamB/users/userA/userB` URL query param 지속성
    - 보류: 옵션 A(방 코드 입력 자동 채우기)는 백엔드 엔드포인트 부재로 후속 분리

- [x] Task 2-4: 챔피언 상세 — 장인 명단 표시
  - **목표**: `championMastery.qualifiedUsers` (또는 동등 필드) 명단을 챔피언 상세 페이지에 표시.
  - **위치**: 챔피언 상세 페이지 빌드/룬 카드 옆 또는 아래 "이 챔피언 장인" 카드 신설.
  - **표시 항목**: 유저 아바타, 이름, 게임 수, 승률, 평균 KDA, "오라클 팀에 추가" 버튼.
  - **API 확인**: `championMastery` 응답 구조 확인 → 명단 필드 없으면 백엔드 task로 분리(`apps/api/src/modules/lab/`).
  - **완료 기준**: "그웬 분석 → 그웬 장인 → 유저 페이지" 3-홉 흐름 동작.
  - **의존**: Task 1-3, 2-2.

- [x] Task 2-5: 패치 임팩트 — 라이엇 패치 노트 링크
  - **목표**: 패치 임팩트 카드에 *왜* 변했는지 단서 제공.
  - **방식 옵션**:
    - 옵션 A: 패치 노트 URL을 하드코딩(`https://www.leagueoflegends.com/ko-kr/news/tags/patch-notes/`)
    - 옵션 B: 패치 버전별 노트 URL을 백엔드에서 매핑(`apps/api/src/modules/lab/patch-notes.service.ts` 신설)
  - **권장**: 옵션 A로 시작, 사용자 가치 확인 후 옵션 B로 확장.
  - **추가**: 챔피언별 변경 사항이 있으면 챔피언 행 옆에 "패치 노트 보기" 작은 링크.
  - **완료 기준**: 패치 임팩트 카드에서 외부 패치 노트로 이동 가능.
  - **의존**: 없음 (옵션 A 기준).

---

## Phase 3 — 시각/색상 정리

Phase 1 완료 후 작업. 컴포넌트 단위로 진행하면 회귀 위험 낮음.

- [x] Task 3-1: 색상 토큰 일괄 치환
  - **목표**: Lab 전체에서 raw Tailwind 색을 사이트 토큰으로 교체.
  - **치환 규칙** (위 매핑 표 기준):
    - `emerald-300/400/500` (의미: 양수/성공) → `accent-success`
    - `emerald-300/400/500` (의미: 메인 강조 — 탭 활성 등) → `accent-primary`
    - `rose-300/400/500` → `accent-danger`
    - `amber-200/300/400/500` (의미: 경고) → `accent-warning`
    - `amber-300` (의미: 메달/장인) → `accent-gold`
    - `cyan-300/400/500` → `accent-info`
    - `violet-300/400/500` → `accent-purple`
    - `fuchsia/sky/lime` → 의미에 따라 위 토큰 중 하나로
  - **방식**:
    - 컴포넌트 단위로 진행 (Task 1-2에서 분리된 컴포넌트마다 별도 커밋)
    - 클래스 한 줄씩 검토 — *단순 sed 치환 금지* (의미 판단 필요)
  - **완료 기준**: `apps/web/src/app/lab/`, `apps/web/src/components/lab/` 어디에도 raw 색 클래스 없음 (`grep -r "emerald-\|rose-\|cyan-\|violet-\|amber-\|fuchsia-\|sky-\|lime-"` 결과 없음).
  - **의존**: Task 1-2.

- [x] Task 3-2: 히어로 영역 다이어트
  - **목표**: 첫 스크린에서 *분석 데이터*가 보이도록 히어로를 압축.
  - **변경 사항**:
    - 큰 제목 `text-6xl` → `text-3xl`
    - "비공개 프리뷰" 배지는 유지하되 위치를 제목 옆으로 (현재는 위)
    - 설명 문단 제거 또는 1줄로
    - StatMetric 4개 → 2개로 축소 (분석된 경기, 플레이어 표본 둘만 유지) 또는 가로 인라인 형태로
    - "Dataset Pulse" / "Source" 영문 라벨 제거
  - **완료 기준**: 1080p에서 첫 스크린에 *최소 1개 분석 카드*가 보임.
  - **의존**: Task 1-1, 1-2.

- [x] Task 3-3: 메타 탭 섹션 통폐합
  - **목표**: Phase 0의 Task 0-2 결정에 따라 섹션 수를 6개 이하로.
  - **권장 통폐합** (Task 0-2 합의 후 조정):
    - 패치 임팩트 브리핑 + 패치 임팩트 상세 + 포지션 변화 + 조합 변화 → **1개 통합 카드**
    - 트렌딩 + 랭크 비교 → 가로 2-up 그리드 유지
    - 티어 그리드 + 챔피언 시그널 → 둘 중 하나 (티어 그리드 권장)
    - 라인 퍼포먼스 → 챔피언 상세 페이지로 이전 (챔피언별 포지션 분포에 흡수)
    - 다음 단계/연구 질문/공개 조건 메모 카드 3개 → **삭제** (어드민 노트는 README나 별도 위키로)
  - **완료 기준**: 메타 페이지 섹션 ≤ 6개, 스크롤 길이 50% 이상 감소.
  - **의존**: Task 0-2, 1-2.

- [x] Task 3-4: 영문 라벨 정리
  - **목표**: "Patch Impact Briefing", "Lane Laboratory", "Mastery Candidates", "Champion Signals", "Item Trends", "Dataset Pulse", "Source", "Seeded Ranked Leaders" 등 *장식적 영문 라벨* 제거.
  - **이유**: 한국어 사용자에 노이즈, 디자인 액센트만 노린 것.
  - **유지 가능**: 약어(KDA, MBI 등 통계 용어)는 유지하되 첫 등장 시 툴팁으로 풀이.
  - **완료 기준**: 영문 캡션이 의미 있는 약어/약속어만 남음.
  - **의존**: Task 1-2.

- [x] Task 3-5: 신뢰도/출처 배지 정리
  - **목표**: 모든 카드에 붙은 `LabSourceBadge` + `confidenceLevel` 배지 노이즈 감소.
  - **변경 사항**:
    - 카드 헤더에 한 번만 배지 표시 (각 row에 중복 표시 금지)
    - row 단위 신뢰도는 *opacity / 점선 테두리* 같은 시각 처리로 (배지 텍스트 X)
    - 배지 색은 `accent-success` (high), `accent-warning` (moderate/low), 회색 (insufficient)
  - **완료 기준**: 카드당 배지 ≤ 2개, row 단위는 시각적 처리만.
  - **의존**: Task 1-2, 3-1.

- [x] Task 3-6: 차트 인터랙션 보강 (선택)
  - **목표**: SVG 차트에 호버 툴팁/축 강조 추가.
  - **대상**: 챔피언 추이 차트, 산점도, 히스토그램, 활동 패턴.
  - **방식**: `recharts` 또는 `visx` 도입 검토 (현 인라인 SVG 유지 시 호버 이벤트 직접 구현).
  - **권장**: 라이브러리 도입 결정은 사용자 확인 후 (번들 사이즈 영향).
  - **완료 기준**: 모든 차트에 호버 툴팁 동작, 축 강조 동작.
  - **의존**: Task 1-2. **사용자 결정 필요**.

---

## Phase 4 — 관측성/UX 보강

Phase 1 완료 후 병렬 가능.

- [x] Task 4-1: 데이터 신선도 표시
  - **목표**: 모든 데이터에 *언제* 갱신되었는지 표시.
  - **표시 위치**: 레이아웃 상단 (히어로 옆 또는 탭 바 아래) "마지막 갱신: N분 전 · 다음 갱신: HH:MM" 문구.
  - **데이터 소스**: `LabSnapshotTask` 마지막 실행 시각을 admin API에서 노출 (`apps/api/src/modules/admin/admin.service.ts` 또는 `apps/api/src/modules/lab/`).
  - **백엔드 작업**: `GET /api/admin/lab/freshness` 엔드포인트 신설 — 각 스냅샷 종류별(champion/synergy/counter/ranked) 마지막 갱신 시각.
  - **완료 기준**: 사용자가 보고 있는 데이터의 신선도를 1초 안에 파악 가능.
  - **의존**: 백엔드 API 신설.

- [x] Task 4-2: 수동 새로고침 트리거
  - **목표**: 어드민이 스냅샷을 즉시 재계산할 수 있는 버튼.
  - **위치**: Task 4-1의 신선도 표시 옆 "지금 새로고침" 버튼.
  - **백엔드**: `POST /api/admin/lab/refresh` (또는 종류별 sub-route) — `LabSnapshotTask` 강제 실행.
  - **권한**: ADMIN only (현 Lab 접근 권한과 동일).
  - **UX**: 트리거 후 "재계산 중..." 표시, 완료 시 React Query invalidate.
  - **완료 기준**: 버튼 1클릭으로 모든 카드가 새 데이터로 갱신.
  - **의존**: 백엔드 API 신설.

- [x] Task 4-3: 데이터 단계 안내 강화
  - **목표**: "데이터 단계 N"의 *의미*를 화면에서 설명.
  - **변경 사항**:
    - 단계 배지 옆에 `Info` 아이콘 → 호버 시 툴팁 ("0단계: 표본 부족 / 1단계: 10경기 / 2단계: 30경기 / 3단계: 100경기 / 4단계: 300경기" + 단계별 잠금 해제 기능 목록)
    - 잠긴 탭 안내 박스(`page.tsx:1021-1047`) 중복 제거 — 탭 자체의 disabled 표시만 유지하고 별도 박스는 삭제. 단, 다음 단계까지 *남은 경기 수*는 어드민이 알 수 있도록 한 줄로 표시.
  - **완료 기준**: 단계 의미 = 툴팁 1번 호버로 파악 가능.
  - **의존**: Task 1-2.

- [x] Task 4-4: 필터 URL 지속성 일괄 적용
  - **목표**: 모든 필터를 URL query param으로 동기화.
  - **대상 필터**:
    - 챔피언 페이지: `q` (검색), `sort`, `position`, `lowSample`
    - 챔피언 상세: `period`
    - 조합 페이지: `synergyChamp`, `counterChamp`, `counterVs`, `counterPosition`
    - 오라클 페이지: 각 sub-route별 입력값 (Task 2-3에서 처리)
  - **헬퍼**: `useUrlState<T>(key, default)` 훅 신설 (`apps/web/src/hooks/use-url-state.ts`) — 다른 페이지에서도 재사용 가능하도록.
  - **완료 기준**: Lab 어느 화면에서든 새로고침 시 동일 화면 복원, URL 공유 시 동일 화면.
  - **의존**: Task 1-1.

- [x] Task 4-5: 정렬 일관성 (Wilson 도입)
  - **목표**: 챔피언 목록의 "승률순" 정렬이 *Wilson lower bound* 기반이 되도록.
  - **이유**: `docs/TODO_lab_dashboard.md:99` 원칙과 현 구현(`page.tsx:638-643`) 모순.
  - **변경 사항**:
    - `championRowsFiltered` 정렬에 `winRate` 대신 `wilsonLower` 사용
    - "승률순" 라벨 옆에 `Info` 아이콘 → 툴팁 "표본 크기를 보정한 Wilson lower bound 기준"
    - 픽률순/밴률순은 그대로 유지 (이건 *현황*이지 *추정치*가 아니므로)
  - **완료 기준**: 5게임 미만 챔피언이 단순 100% 승률로 상위 점프하지 않음.
  - **의존**: Task 1-2.

- [x] Task 4-6: 데이터 표시 형식 통일
  - **목표**: 같은 챔피언/유저 승률이 모든 카드에서 *같은 형식*으로 표시.
  - **규칙**:
    - 승률: `54.2%` (소수점 1자리, % 포함, `formatRate` 함수 단일화)
    - 픽률/밴률: `12.34%` (소수점 2자리)
    - 변화량: `+1.2%p` / `-0.8%p` (양수 +, 단위 %p)
    - KDA: `4.5 / 2.1 / 6.3`
    - 게임 수: `1,234게임` (천 단위 콤마)
  - **위치**: `apps/web/src/lib/lab-format.ts` 신설, 모든 컴포넌트가 import.
  - **완료 기준**: `0.542` 같은 raw 값 직접 표시하는 곳 없음.
  - **의존**: Task 1-2.

- [x] Task 4-7: 성능 — 탭 prefetch
  - **목표**: 다른 라우트로 prefetch 적용 (Task 1-1 이후 라우트가 분리되었으므로).
  - **방식**: 탭 바의 `<Link>`에 `prefetch={true}` (기본값) + 각 페이지의 `useQuery` 옵션을 React Query `prefetchQuery`로 hover 시 트리거.
  - **완료 기준**: 탭 호버 후 클릭 시 로딩 스피너 노출 빈도 감소.
  - **의존**: Task 1-1.

- [x] Task 4-8: 성능 — 코드 분할
  - **목표**: 단일 거대 청크 → 라우트별 청크.
  - **방식**: Next.js App Router는 라우트 분할 시 자동 코드 분할되므로 Task 1-1만으로 대부분 해결. 추가로 차트는 `dynamic(() => import(...), { ssr: false })`로 lazy 로드.
  - **완료 기준**: `/lab` 진입 시 챔피언/조합/오라클 청크 미로드 (브라우저 네트워크 탭 확인).
  - **의존**: Task 1-1, 1-2.

---

## Phase 5 — 후속 (선택)

- [x] Task 5-1: 데이터 export (CSV/JSON)
  - **목표**: 어드민이 분석 결과를 외부 도구(엑셀/노션)로 가져갈 수 있게.
  - **위치**: 각 카드 우상단 `⋯` 메뉴 → "CSV 다운로드" / "JSON 복사".
  - **의존**: Phase 1.

- [ ] Task 5-2: 즐겨찾는 멤버 그룹
  - **목표**: Task 2-3의 옵션 C — 사용자별 저장된 멤버 프리셋.
  - **저장**: localStorage 또는 별도 백엔드 테이블(`UserLabPreset`).
  - **의존**: Task 2-3.

- [x] Task 5-3: 챔피언 비교 모드
  - **목표**: 챔피언 2~3개를 한 화면에서 비교 (현재는 하나만 볼 수 있음).
  - **라우트**: `/lab/champions/compare?ids=1,103,238`
  - **의존**: Task 1-3, 4-4.

- [ ] Task 5-4: 알림/푸시 (어드민 전용)
  - **목표**: "메타 급변" 감지 시 어드민에게 알림 (예: 트렌딩 챔피언 픽률 +5%p 이상).
  - **백엔드**: `LabSnapshotTask` 후처리에서 비교 → notification 발송.
  - **의존**: Phase 1, 4-1.

---

## 작업자(Sonnet)에게 — 진행 가이드

1. **Phase 0 먼저** — 다이어그램/우선순위 합의 없이 Phase 1 착수 금지. 사용자에게 Task 0-1, 0-2 결과물 확인받고 진행.
2. **Phase 1은 회귀 없이** — 구조 변경만, 기능/색상은 *Phase 2/3*에서. Phase 1 각 task마다 별도 커밋.
3. **CLAUDE.md 규칙 준수**:
   - 작업 단위 커밋
   - 한글 주석
   - 선택지 발생 시 사용자에게 질문 (특히 Task 2-3, 2-5, 3-6에 표기된 결정 포인트)
   - Task 완료 시 본 문서의 `[ ]` → `[x]` 업데이트 후 커밋
4. **백엔드 신설이 필요한 task** (4-1, 4-2, 2-3 옵션 A, 2-5 옵션 B, 5-1, 5-2)는 사용자 확인 후 진행. 백엔드 변경 시 `apps/api/` + Prisma 스키마 영향 검토.
5. **시각적 회귀 확인** — Phase 1/3 작업 시 `pnpm build` + 브라우저 직접 확인 필수. 스크린샷 비교 권장.
6. **테스트 계정**: ADMIN 권한 필요 (현 Lab은 어드민 전용).

---

## 진행 상황

- 전체: 28 / 30 (필수 27 + 선택 4)
- Phase 0: 2 / 2 ✓
- Phase 1: 3 / 3 ✓
- Phase 2: 5 / 5 ✓
- Phase 3: 6 / 6 ✓
- Phase 4: 8 / 8 ✓
- Phase 5: 2 / 4 (Task 5-2·5-4는 별도 백엔드/설계 필요)
