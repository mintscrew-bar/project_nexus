# 방송 오버레이 (Broadcast Overlay) — 설계

> 작성일: 2026-06-30
> 코드네임: **Broadcast Overlay** (사용자 노출 문구: "방송 화면 링크" / "방송용 오버레이")
> 내부 명칭으로 "스트리머 모드"보다 Broadcast Overlay를 사용한다.

---

## 한 줄 정의

기존 방 운영 화면을 방송용으로 바꾸는 토글이 **아니라**, OBS 브라우저 소스로 얹는 **별도의 읽기 전용 방송 오버레이**. 시청자가 "지금 내전이 어느 단계인지 / 어느 팀 경기인지 / 누가 이겼는지"를 보기 좋게 이해하게 만드는 방송 패키지.

## 목표 / 비목표

**목표**
- 내전 진행 상황(대기·경매·드래프트·대진·결과)을 자동 추종해 깔끔히 표시.
- 실제 경기 중계용 상단 팀 정체성 오버레이(롤드컵식 "느낌", 단 라이브 스코어는 아님).
- 게임 사이 빈 시간(대기·전환)을 채우는 화면.
- 클랜/스트리머 브랜딩(accentColor·엠블럼·배너) 입히기.

**비목표 (명시적 제외)**
- 스나이핑 방지 / N초 지연 / 정보 가리기 모드 — **안 함.**
- 기존 화면 "방송 모드 토글" — **안 만듦.**
- 플레이 중 화면 크롭용 UI — **안 만듦** (OBS가 함).
- 라이브 인게임 스코어(킬/골드/오브젝트) — **불가** (아래 현실 점검).

## 현실 점검 (설계 전제)

1. **라이브 인게임 데이터 없음.** 킬/골드/누가 이기는 중은 롤 클라이언트/Riot 쪽에만 있고, 폴링은 [Riot 퍼스널 키 캡](앱 전체 100req/2분)으로 불가. → Match Scene은 **라이브 스코어보드가 아니라 "팀 정체성 오버레이"**.
2. **Series/BO 모델 없음.** `Match`는 단판 1게임(`teamA`/`teamB`/`winnerId`/`status`/`round`). "1세트·BO3·2:1"은 데이터가 없어 지금은 불가 → 단판 승패만. 시리즈 스코어는 별도 `Series` 모델 신규(수요 확인 후, 범위 밖).
3. **재사용 가능 자산.** `blueSideTeamId`(가위바위보 진영선택 결과) → Match Scene 블루/레드 색 공짜. `match-result`가 `match:${matchId}` + `bracket:${roomId}` 양쪽에 emit → Result Toast/Bracket 갱신 공짜. `AuctionBoard`는 props 기반 → 재사용 용이. `BracketView`/`VictoryScreen` 재사용.

---

## 핵심 설계 결정

### 라우팅 / 레이아웃
- `/broadcast/[token]` 읽기 전용 페이지. 로그인 불필요.
- **AppShell 조건부 우회**: AppShell에서 `pathname.startsWith("/broadcast")`면 nav/sidebar/Auth UI 없이 children만 렌더. (route group 대이동은 리스크 커서 MVP에서 안 함.)
- **OBS 1920×1080 고정 캔버스**. 반응형 페이지가 아니라 고정 stage + 내부 scale.
- 배경 **투명 기본**, `?bg=opaque`면 풀씬 배경.

### 토큰
- `Room.broadcastTokenHash`(평문 저장 금지, hash 비교) + `Room.broadcastTokenCreatedAt`.
- 호스트가 "방송 링크 생성" → lazy 생성. 원문 토큰은 **생성 응답에서 한 번만** 내려줌.
- "링크 재생성" = 새 hash로 교체(= 기존 revoke).

### 소켓 (read-only)
- 신규 namespace 안 만들고 **기존 게이트웨이에 read-only join** 추가. broadcast 토큰 소켓은 **구독만**, 모든 액션 `@SubscribeMessage` emit 차단.
- `bracket:${roomId}` join → 토너먼트 전체 `match-started`/`match-result`/`bracket-generated` 수신(Result Toast·Match 상태·Bracket).
- 최초 접속은 `GET /broadcast/:token/snapshot?scene=...&matchId=...`로 현재 상태 hydrate → 이후 소켓 델타.

### Scene 구조 (`?scene=`)
| scene | 동작 |
|-------|------|
| `room` | 방 status 자동 추종 (WAITING→AUCTION→DRAFT→ROLE_SELECT→BRACKET→RESULT) |
| `match` | 경기 중계 오버레이 (matchId 고정 **또는** 호스트 추종, 아래 규칙) |
| `bracket` | 대진표 |
| `result` | 결과/승팀 |
| `break` | 다음 경기 대기/전환 브랜딩 화면 |

### Match 선택 규칙 (둘 다 지원)
- `?scene=match&matchId=abc` → **abc 고정 표시** (테스트·클립·특정 경기 전용 OBS 소스).
- `?scene=match` (matchId 없음) → 방의 `broadcastFocusMatchId` **추종** (생방송 운영).
  - `broadcastFocusMatchId` 없으면 → 진행 중 경기 1개 자동 선택 → 없으면 대진표/대기 표시.
- 즉 **URL matchId 있으면 고정 우선, 없으면 호스트 선택 추종.**
- 신규: `Room.broadcastFocusMatchId String?` + `PATCH /rooms/:id/broadcast-focus { matchId|null }`(호스트만) → 변경 시 방송 소켓에 `broadcast-focus-updated` emit.

### 화면 레이어 구조 (전환 안정성의 핵심)
```
BroadcastShell
├─ Theme Layer          (clan accent / 엠블럼 / streamer·NEXUS 브랜딩, bg)
├─ Scene Transition Layer  (scene 교체 연출 — AnimatePresence)
├─ Current Scene        (Waiting / Auction / Match / Bracket / Result / Break)
└─ Persistent Overlay   (Scene 밖! 전환 중에도 상주)
   ├─ Lower-third 상태 띠
   ├─ Match Identity Bar
   └─ Result Toast Queue
```
- **Persistent Overlay는 scene 교체 시 remount 금지** — Shell의 형제로 안정적 key 상주. `AnimatePresence`는 `Current Scene`만 감쌈. (전환 중 팀명·승패·Toast·상태 띠 끊김 방지 → Phase 0 셸 구조에서 확정.)

### 전환 (Transition)
- 원칙: 600~900ms, 전체를 오래 안 가림, 핵심 숫자/팀명/승패는 전환 중에도 읽힘.
- **`transform`/`opacity`만** 애니메이트(OBS 컴포지터 전용). `blur`/`box-shadow`/레이아웃 속성 애니메이트 금지(프레임 드랍).
- Framer Motion: scene 교체 `AnimatePresence mode="wait"`, 경매 남은매물→현재선수 `layoutId`.
- MVP는 `transition=clean` 하나만. `energetic`/`none`은 나중에 옵션화.

### 위치 조절 (하드코딩 금지)
롤 관전 UI 위치가 세팅마다 달라 Match Scene 위치를 하드코딩하면 위험. 최소 옵션:
- `overlayAnchor: top | upper-left | upper-right`, `offsetX`, `offsetY`, `scale`.
- MVP는 기본값으로 시작, 이후 OBS용 설정 패널에서 조절.

---

## Scene별 레이아웃 메모

### Room — Waiting
방 제목 · 모집 현황(7/10) · 참가자/준비 상태 · "잠시 후 시작" 문구.

### Room — Auction (풀씬, `AuctionBoard` 재사용 + `displayMode`)
- 좌: 팀 현황 / 예산 / 팀원
- 중앙(가장 큼): 현재 선수 / 현재가 / 타이머 / 최고 입찰 팀
- 우: 남은 매물 (8~10명 + "+N명")
- 하단: 팀별 예산·입찰 현황 압축 바
- **제거**: 채팅, 입찰/금액 버튼, 방 종료, 연결 상태, 운영자 UI.

### Match (상단 안전영역, 하단 금지 — HUD/미니맵 충돌)
```
[ BLUE SIDE · A팀 ]     [ 준결승 1경기 · 진행 중 ]     [ RED SIDE · B팀 ]
```
- 좌우 팀 플레이트 + 가운데 작은 상태 칩(롤 관전 UI 덜 가림, 팀 대 팀 느낌 강함).
- 진영색 = `blueSideTeamId`. 라이브 스코어/세트 없음.
- 종료 시 승팀 쪽 강조, 패팀 살짝 죽임.
- Focus 전환(A·B → C·D): 전체 안 덮고 **상단 바만** — VS 칩 접힘 → 플레이트 바깥으로 → 새 플레이트 안쪽으로 → 라운드/상태 칩 갱신.

### Result Toast (영구 오버레이, 우상단)
- 소스: `bracket:${roomId}`의 `match-result`. **현재 핀한 경기는 제외**(중복 방지).
- 우측 얇은 빛 라인 → 결과 카드 slide-in → 승팀 강조 → ~4초 → 위로 fade-out. 여러 개면 큐.

### Bracket / Result / Break
`BracketView`·`VictoryScreen` 재사용. Break는 다음 경기 준비 + 참가자/팀 요약 + 클랜/스트리머 브랜딩 + "잠시 후 시작".

---

## Tasks

### Phase 0 — Broadcast 인프라
- [x] Task 1: 스키마 — `Room.broadcastTokenHash`/`broadcastTokenCreatedAt`/`broadcastFocusMatchId` + 마이그레이션 SQL
- [x] Task 2: 백엔드 — 토큰 생성/재생성(`POST /rooms/:id/broadcast-token`, `.../rotate`, 호스트만, hash 저장·원문 1회 응답)
- [x] Task 3: 백엔드 — `GET /broadcast/:token/snapshot?scene=&matchId=` (토큰 검증, scene별 + 공통 룸/토너먼트 요약 포함)
- [ ] Task 4: 백엔드 — 기존 게이트웨이 read-only 토큰 join(액션 emit 차단) + `bracket:${roomId}` 구독 경로
- [ ] Task 5: 프론트 — AppShell `/broadcast` 조건부 우회
- [ ] Task 6: 프론트 — `BroadcastShell` (1920×1080 고정 캔버스, 투명/`?bg=opaque`, **레이어 구조 확정**: Theme / Transition / Current Scene / Persistent Overlay)

### Phase 1 — Lower-third (0순위)
- [ ] Task 7: 영구 상태 띠 — "내전 진행 중 · 8/10 · 경매 단계 · [클랜색/엠블럼]". 모든 scene 공통, Persistent Overlay에 상주

### Phase 2 — Room Scene  ← **검증 게이트**
- [ ] Task 8: Waiting scene (방 제목·모집 현황·준비 상태)
- [ ] Task 9: Auction scene (`AuctionBoard` `displayMode="overlay"` 재사용, 컨트롤 제거, 중앙=현재 선수 최대)
- [ ] Task 10: **실제 스트리머 1명 OBS 테스트** — 파이프라인 검증 후 다음 Phase 진행

### Phase 3 — Match Scene
- [ ] Task 11: 고정 matchId 표시(좌우 플레이트 + 상태 칩, `blueSideTeamId` 진영색, HUD 데드존 앵커)
- [ ] Task 12: 호스트 추종 — `Room.broadcastFocusMatchId` + `PATCH /rooms/:id/broadcast-focus` + `broadcast-focus-updated` 구독, matchId 없을 때 추종/자동선택
- [ ] Task 13: 호스트 측 "이 경기 중계" UI (방 관리/대진 화면에서 focus 설정 + 고정 링크 복사)
- [ ] Task 14: 종료 시 승팀 강조 + Focus 전환(상단 바만) 연출

### Phase 4 — Result Toast
- [ ] Task 15: `match-result`(bracket 룸) 구독 → 큐 store → 우상단 toast(핀한 경기 제외, 4초, 큐 순차)

### Phase 5 — Bracket / Result / Break
- [ ] Task 16: Bracket scene (`BracketView` 재사용, 방송용 크게)
- [ ] Task 17: Result scene (`VictoryScreen` 재사용)
- [ ] Task 18: Break scene (다음 경기 + 팀 요약 + 브랜딩)

### Phase 6 — 전환 (clean)
- [ ] Task 19: Scene Transition Layer (`AnimatePresence mode="wait"`, NEXUS 라인 스윕, transform/opacity만)
- [ ] Task 20: Auction 다음 매물 전환(`layoutId`로 남은매물→현재선수), Toast/Match-bar 마이크로 전환

### Phase 7 — 마무리
- [ ] Task 21: OBS 가이드 문서 + 위치 조절 옵션(`overlayAnchor`/`offset`/`scale`) 노출
- [ ] Task 22: 전체 빌드·린트 검증

---

## 범위 밖 (후속)
- **Series/BO 모델** → BO3 시리즈 스코어. 수요 확인 후 신규 스키마.
- 전환 프리셋 `energetic`/`none`, OBS 설정 패널 고도화.
- DRAFT / ROLE_SELECT Room scene 세부 화면(우선 자동추종 기본 표시만, 정밀 polish는 후순위).

## 메모
- 신규 컬럼은 운영 api 컨테이너 부팅 시 `prisma migrate deploy`로 자동 반영(Dockerfile CMD). migration.sql만 작성·커밋하면 됨.
- 신규 작업 무게: 토큰/read-only join, AppShell 우회 + 레이어 셸, Waiting, lower-third, Match 플레이트, Result Toast. 나머지는 재사용+다듬기.
