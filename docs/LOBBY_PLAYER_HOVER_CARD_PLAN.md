# 룸 로비 참가자 호버 카드 강화 + 프로필 모달 Plan

> **대상 작업자**: codex
> **작성일**: 2026-04-26
> **소요 예상**: 1~2일
> **언어**: 모든 UI 텍스트는 한국어, 코드 주석도 한국어

---

## 0. 배경

룸 로비 (`/tournaments/[id]/lobby`) 에서 참가자 카드에 마우스를 올리면 작은 호버 툴팁이 뜬다. 현재는 게임명/티어/포지션/선호 챔피언만 보여준다. 디스코드 프로필 카드처럼 더 풍부한 정보(신뢰도, 전적, 클랜, 피크 티어)를 보여주고, 클릭 시 모달로 풀 프로필을 띄운다.

**중요 제약**: 호버 카드의 "프로필 보기" 버튼은 **다른 페이지로 라우팅하면 안 된다.** 이유: `lobby/page.tsx:456-459` 의 useEffect cleanup 에서 `disconnect()` 가 호출되어 socket leave-room 이벤트로 방에서 빠져버린다. **반드시 같은 페이지 위에 모달로 띄워야 한다.**

함께 페이지를 분해해서 `lobby/page.tsx` (940 LOC)를 슬림하게 만든다.

---

## 1. 목표

- [x] 호버 카드에 신뢰도/전적/클랜/피크 티어 추가, 폭 256px → 320px, 디스코드 스타일 섹션 분리
- [x] 호버 카드에 "프로필 보기" 버튼 추가 → 클릭 시 같은 페이지에 `PlayerProfileModal` 모달로 풀 프로필 (방 연결 유지 보장)
- [x] 호버/모달 데이터는 React Query lazy fetch (staleTime 60초), 호버 안 한 사람은 호출 X
- [x] `lobby/page.tsx` 분해: 인라인 컴포넌트 5개를 `_components/` 아래로 추출
- [x] 백엔드 room 응답에 `peakTier`, `peakRank`, `lp` 노출
- [x] 깨진 reputation API 경로 수정 + stats wrapper 추가

---

## 2. 사전 조건 / 현재 상태

### 2.1 변경 대상 파일

| 파일 | LOC | 역할 |
|---|---|---|
| `apps/web/src/app/tournaments/[id]/lobby/page.tsx` | 940 | 분해 대상 — 인라인 컴포넌트 5개 추출 |
| `apps/web/src/lib/api-client.ts` | 1500+ | `reputationApi` 경로 버그 수정 + stats wrapper 추가 |
| `apps/api/src/modules/room/room.service.ts` | 1465 | `getRoomById` 의 `riotAccounts.select` 에 peakTier/peakRank/lp 추가 |

### 2.2 추출할 인라인 컴포넌트 (page.tsx 안)

| 라인 | 컴포넌트 | 추출 위치 |
|---|---|---|
| 25–37 | `getChampionIconUrl` | `_components/icons.tsx` |
| 39–53 | `POSITION_ICON_URLS`, `POSITION_LABELS` | `_components/icons.tsx` |
| 55–65 | `PositionIcon` | `_components/icons.tsx` |
| 67–95 | `ChampionIcon` | `_components/icons.tsx` |
| 97–202 | `PlayerHoverTooltip` | `_components/PlayerHoverCard.tsx` (강화 + 이름 변경) |
| 205–302 | `ParticipantCard` | `_components/ParticipantCard.tsx` |
| 305–317 | `EmptySlot` | `_components/ParticipantCard.tsx` (같은 파일에 함께 둠) |
| 321–398 | `CompactParticipantCard` | `_components/CompactParticipantCard.tsx` |

> 신규 파일 `_components/PlayerProfileModal.tsx` 도 작성한다 (아래 3.4 참고).

### 2.3 이미 존재하는 의존성 (재사용)

- `apps/web/src/components/ui/Modal.tsx` — `<Modal isOpen onClose title size="lg" />` 패턴 사용
- `apps/web/src/components/domain/TierBadge.tsx` — 호버 카드/모달에서 그대로 사용
- `apps/web/src/components/matches/match-utils.ts` — `getChampionIcon`, `getChampionIconById`
- `@tanstack/react-query` — `apps/web/src/app/providers.tsx` 에서 이미 셋업됨

### 2.4 사용할 API 엔드포인트

| 용도 | 메서드 | 경로 | 응답 핵심 필드 |
|---|---|---|---|
| 전적 요약 | GET | `/users/:userId/stats` | `gamesPlayed, wins, losses, winRate` |
| 신뢰도 요약 | GET | `/reputation/users/:userId/stats` | `totalRatings, averageSkill, averageAttitude, averageCommunication, overallAverage` (0–5) |
| 최근 평가 | GET | `/reputation/users/:userId/ratings?limit=N` | 최근 평가 목록 (모달용) |
| 풀 프로필 | GET | `/users/:userId` | `riotAccounts[], clanMemberships[]` 등 (모달용) |
| 매치 이력 | GET | `/matches/user/:userId/history?limit=N` | 최근 N경기 (모달용) |

### 2.5 현재 깨진 부분

- `apps/web/src/lib/api-client.ts:947` — `reputationApi.getUserRatings` 가 `/reputation/user/${userId}/ratings` (단수형) 호출 중
- 실제 controller (`apps/api/src/modules/reputation/reputation.controller.ts:40`) 는 `users/:userId/ratings` (복수형)
- **수정 필요**: `user` → `users`
- `reputationApi.getUserStats` wrapper **없음** → 추가 필요

---

## 3. 작업 단계 (이 순서대로)

### 3.1 백엔드: room 응답에 peak 정보 노출

**파일**: `apps/api/src/modules/room/room.service.ts`

**위치**: `getRoomById` 메서드 (line 311) 의 `riotAccounts.select` (line 333–349)

**변경**:

```ts
riotAccounts: {
  where: { isPrimary: true },
  select: {
    gameName: true,
    tagLine: true,
    tier: true,
    rank: true,
    lp: true,            // ← 추가
    peakTier: true,      // ← 추가
    peakRank: true,      // ← 추가
    mainRole: true,
    subRole: true,
    championPreferences: { ... },  // 기존 그대로
  },
},
```

> 다른 곳에서도 `riotAccount` 가 사용되니 영향 없는지 grep 으로 확인. (`grep -rn "riotAccount\." apps/web/src` 의 사용처 → 추가 필드는 optional 이라 호환됨)

**검증**: `cd apps/api && pnpm build` 통과.

---

### 3.2 api-client: reputation 경로 버그 수정 + stats wrapper 추가

**파일**: `apps/web/src/lib/api-client.ts`

**3.2.1 경로 버그 수정** (line 947):

```ts
// Before
getUserRatings: async (userId: string, limit = 10, offset = 0) => {
  const response = await apiClient.get(`/reputation/user/${userId}/ratings`, {
    params: { limit, offset },
  });
  return response.data;
},

// After
getUserRatings: async (userId: string, limit = 10) => {
  const response = await apiClient.get(`/reputation/users/${userId}/ratings`, {
    params: { limit },
  });
  return response.data;
},
```

> Controller 는 `offset` 파라미터 안 받으니 제거. limit 만 query string 으로.

**3.2.2 stats wrapper 추가** (`reputationApi` 객체 안, `getUserRatings` 바로 아래):

```ts
getUserStats: async (userId: string): Promise<{
  totalRatings: number;
  averageSkill: number;
  averageAttitude: number;
  averageCommunication: number;
  overallAverage: number;
}> => {
  const response = await apiClient.get(`/reputation/users/${userId}/stats`);
  return response.data;
},
```

**검증**: `pnpm tsc --noEmit` (apps/web) 통과.

---

### 3.3 아이콘 유틸 추출

**신규 파일**: `apps/web/src/app/tournaments/[id]/lobby/_components/icons.tsx`

`page.tsx:25-95` 에서 그대로 옮긴다 (수정 없이):
- `getChampionIconUrl(championId)`
- `POSITION_ICON_URLS`
- `POSITION_LABELS`
- `PositionIcon`
- `ChampionIcon`

각 함수/상수 모두 `export`. 'use client' 디렉티브는 필요 없음 (page.tsx 가 이미 client 컴포넌트라 import 만 되면 자동).

> **주의**: `simulation/page.tsx:308` 에 별도 `PositionIcon` 이 있는데 시그니처가 달라서 합치지 않는다. 일단 lobby 전용으로 둔다.

---

### 3.4 PlayerHoverCard (강화)

**신규 파일**: `apps/web/src/app/tournaments/[id]/lobby/_components/PlayerHoverCard.tsx`

기존 `PlayerHoverTooltip` (page.tsx:97-202) 을 베이스로 강화한다.

#### 3.4.1 인터페이스

```ts
interface PlayerHoverCardProps {
  participant: any;          // page.tsx 의 participant 와 동일 (riotAccount 중첩 포함)
  anchorRect: DOMRect;
  onOpenProfile: (userId: string) => void;  // 클릭 시 부모(page.tsx)에게 알림
}
```

#### 3.4.2 데이터 fetch (lazy)

호버 카드 mount 시 두 개의 useQuery 동시 호출:

```ts
import { useQuery } from "@tanstack/react-query";
import { userApi, reputationApi } from "@/lib/api-client";

const { data: stats } = useQuery({
  queryKey: ["userStats", participant.userId],
  queryFn: () => userApi.getUserStats(participant.userId),
  staleTime: 60_000,
  enabled: Boolean(participant.userId),
});

const { data: rep } = useQuery({
  queryKey: ["reputationStats", participant.userId],
  queryFn: () => reputationApi.getUserStats(participant.userId),
  staleTime: 60_000,
  enabled: Boolean(participant.userId),
});
```

> bot 참가자(`/^testbot_\d+$/.test(participant.username)`)는 fetch 안 함 → `enabled` 에 추가 조건 넣기.

#### 3.4.3 UI 구조 (위→아래 순서, 폭 320px)

```
┌─────────────────────────────────────┐
│ [티어 그라데이션 배너 — 56px]        │ ← 1. Banner
├─────────────────────────────────────┤
│ [Avatar 56px, 배너 위로 -28px 띄움] │
│ GameName#TAG     [TierBadge]        │ ← 2. Identity
│ @username · Peak D2                 │
├─────────────────────────────────────┤
│ POSITION                            │ ← 3. Roles (기존 유지)
│ [main]주 [sub]부                    │
├─────────────────────────────────────┤
│ 선호 챔피언  (기존 유지)             │ ← 4. Champions
│ [icons by role]                     │
├─────────────────────────────────────┤
│ 전적         12승 8패 · 60%         │ ← 5. Stats (신규)
│ 신뢰도       ★★★★☆ 4.2 (15평가)    │ ← 6. Reputation (신규)
│ 클랜         [TAG] 클랜이름         │ ← 7. Clan (신규, 있을 때만)
├─────────────────────────────────────┤
│ [프로필 보기 버튼 — pointer-events] │ ← 8. CTA (신규)
└─────────────────────────────────────┘
```

#### 3.4.4 디자인 토큰

- 폭: `w-80` (320px). 기존 `TOOLTIP_W = 256` → `320`
- 배너: `h-14` 그라데이션. 티어별 색상:
  - CHALLENGER → `from-amber-300 to-amber-500`
  - GRANDMASTER → `from-rose-400 to-rose-600`
  - MASTER → `from-purple-400 to-purple-600`
  - DIAMOND → `from-cyan-400 to-cyan-600`
  - PLATINUM → `from-teal-400 to-teal-600`
  - EMERALD → `from-emerald-400 to-emerald-600`
  - GOLD → `from-yellow-400 to-yellow-600`
  - SILVER → `from-slate-300 to-slate-500`
  - BRONZE → `from-orange-700 to-orange-900`
  - IRON → `from-stone-500 to-stone-700`
  - 그 외/null → `from-bg-tertiary to-bg-elevated`
- 신뢰도 별점: `★` 5개. `overallAverage` 가 `0~5` 범위. 반 별 표시는 아이콘 두 겹 (배경 회색 + 전경 노란색 width % 로) — 또는 단순화: 정수 별 + 옆에 숫자 텍스트
- 전적 칩: `bg-bg-tertiary px-2 py-1 rounded text-xs` 형태
- 클랜 태그: `bg-accent-primary/10 text-accent-primary text-xs px-2 py-0.5 rounded`

#### 3.4.5 fixed 포지셔닝 + pointer events

기존 (line 121–127) 에서 폭만 `TOOLTIP_W = 320`, 높이 여유 `Math.min(anchorRect.top, window.innerHeight - 480)` 으로 늘린다.

**중요**: 카드 root 의 `pointer-events-none` 을 제거하고, `onMouseEnter`/`onMouseLeave` 이벤트로 호버 상태를 유지하도록 한다 (기존 page.tsx 의 `setHoveredPlayer` 와 연동). "프로필 보기" 버튼이 클릭 가능해야 하므로 카드 자체가 hover 가능해야 한다.

> 기존엔 `pointer-events-none` 이라서 카드 위로 마우스가 가도 (참가자 카드의 `onMouseLeave` 가 안 터져서) 살아남았다. 이제는 카드 위에서 카드 자체에도 mouseenter 가 살아야 하니, **부모 page.tsx 의 hover state 관리 로직을 수정**해야 한다 (3.6 참고).

#### 3.4.6 "프로필 보기" 버튼

```tsx
<button
  type="button"
  onClick={() => onOpenProfile(participant.userId)}
  className="mt-3 w-full px-3 py-2 bg-accent-primary/10 hover:bg-accent-primary/20 text-accent-primary text-xs font-semibold rounded-lg transition-colors"
>
  프로필 보기
</button>
```

> bot 참가자에게는 버튼 표시 X. (참가자가 진짜 user 가 아니라 모달 띄워도 정보 없음)

#### 3.4.7 Skeleton/로딩 처리

`stats === undefined && rep === undefined` 일 때는 해당 섹션을 skeleton (회색 막대 한 줄) 으로 표시. fetch 실패하면 그냥 섹션 미표시 (조용히 실패).

---

### 3.5 PlayerProfileModal (신규)

**신규 파일**: `apps/web/src/app/tournaments/[id]/lobby/_components/PlayerProfileModal.tsx`

#### 3.5.1 인터페이스

```ts
interface PlayerProfileModalProps {
  userId: string | null;     // null 이면 닫혀 있는 상태
  onClose: () => void;
}
```

#### 3.5.2 데이터 fetch

```ts
const { data: profile, isLoading: profileLoading } = useQuery({
  queryKey: ["userProfile", userId],
  queryFn: () => userApi.getProfile(userId!),
  staleTime: 60_000,
  enabled: Boolean(userId),
});

const { data: stats } = useQuery({
  queryKey: ["userStats", userId],
  queryFn: () => userApi.getUserStats(userId!),
  staleTime: 60_000,
  enabled: Boolean(userId),
});

const { data: rep } = useQuery({
  queryKey: ["reputationStats", userId],
  queryFn: () => reputationApi.getUserStats(userId!),
  staleTime: 60_000,
  enabled: Boolean(userId),
});

const { data: history } = useQuery({
  queryKey: ["matchHistory", userId, 5],
  queryFn: () => matchApi.getUserMatchHistory(userId!, { limit: 5 }),
  staleTime: 60_000,
  enabled: Boolean(userId),
});
```

> queryKey 는 `PlayerHoverCard` 와 일부 공유 (`userStats`, `reputationStats`) → 호버 후 모달 열면 캐시 적중해서 즉시 표시됨.

> `matchApi.getUserMatchHistory` 의 정확한 시그니처는 `apps/web/src/lib/api-client.ts:471` 확인 (`{ limit, offset }` params).

#### 3.5.3 UI 구조

```tsx
<Modal isOpen={Boolean(userId)} onClose={onClose} size="lg" title={undefined} showCloseButton>
  {/* 1. 배너 + 아바타 (호버 카드와 같은 그라데이션 + 큰 사이즈) */}
  {/* 2. 이름 + 티어 + 클랜 + 가입일 */}
  {/* 3. 4개 칩: 전적 / 승률 / 신뢰도 / 피크 티어 */}
  {/* 4. 신뢰도 세부 (skill/attitude/communication 막대 3개, 0~5 범위) */}
  {/* 5. 포지션 + 선호 챔피언 (호버 카드와 같은 컴포넌트 재사용) */}
  {/* 6. 최근 5경기 (간단 요약 — 챔피언 아이콘, KDA, 승패 색상, 시간) */}
</Modal>
```

> 모달 안에서 사용할 `PositionIcon`, `ChampionIcon` 은 `_components/icons.tsx` 에서 import. `TierBadge` 는 `@/components/domain/TierBadge`.

#### 3.5.4 신뢰도 막대

```tsx
<div className="space-y-2">
  <RepBar label="실력"   value={rep?.averageSkill ?? 0} />
  <RepBar label="태도"   value={rep?.averageAttitude ?? 0} />
  <RepBar label="소통"   value={rep?.averageCommunication ?? 0} />
</div>
```

`RepBar` 는 모달 파일 내부 헬퍼:
- 막대 폭 = `(value / 5) * 100%`
- 색상: `bg-accent-primary`
- 옆에 숫자 `4.2` 표시

#### 3.5.5 최근 경기

각 경기 row:
```
[champion icon 32px] [W/L 색 점] KDA 5/2/8 · 챔피언명 · 25분 전
```

- W = `text-accent-success`, L = `text-accent-danger`
- `time ago` 는 간단히 `Date.now() - new Date(matchEndedAt).getTime()` 으로 분/시간/일 변환 (date-fns 안 쓰는 패턴이면 자체 함수)

> 경기 0건이면 "최근 경기 없음" 표시.

#### 3.5.6 로딩/에러

- `profileLoading` 이면 모달 본문에 LoadingSpinner
- profile fetch 실패면 "프로필을 불러오지 못했습니다" + 닫기 버튼

---

### 3.6 ParticipantCard / EmptySlot / CompactParticipantCard 추출

**신규 파일 1**: `apps/web/src/app/tournaments/[id]/lobby/_components/ParticipantCard.tsx`
- `page.tsx:205-302` 의 `ParticipantCard` 를 그대로 옮긴다
- `page.tsx:305-317` 의 `EmptySlot` 도 같은 파일에 export
- import 경로: `PositionIcon, ChampionIcon` → `./icons`, `TierBadge` → `@/components/domain/TierBadge`

**신규 파일 2**: `apps/web/src/app/tournaments/[id]/lobby/_components/CompactParticipantCard.tsx`
- `page.tsx:321-398` 그대로

#### 3.6.1 hover state 변경 (중요)

기존 `setHoveredPlayer({ id, rect, participant })` 시그니처는 유지. 단, `onMouseLeave` 의 즉시 `setHoveredPlayer(null)` 동작이 호버 카드의 `pointer-events-auto` 와 충돌하면 카드가 닫힘.

해결책: **hover state 를 setTimeout 으로 80ms 지연 닫기**. 카드 위로 마우스가 옮겨가는 사이에 닫히지 않도록. page.tsx 메인 컴포넌트에 다음 헬퍼 추가:

```tsx
// page.tsx 메인 컴포넌트 안
const hoverCloseTimer = useRef<NodeJS.Timeout | null>(null);

const scheduleHoverClose = () => {
  if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
  hoverCloseTimer.current = setTimeout(() => setHoveredPlayer(null), 80);
};

const cancelHoverClose = () => {
  if (hoverCloseTimer.current) {
    clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = null;
  }
};
```

ParticipantCard / CompactParticipantCard 의 `onMouseLeave={() => setHoveredPlayer(null)}` 를 `onMouseLeave={scheduleHoverClose}` 로 변경. PlayerHoverCard 의 root 에 `onMouseEnter={cancelHoverClose} onMouseLeave={scheduleHoverClose}` 추가.

> 이 두 핸들러는 `setHoveredPlayer` 와 함께 props 로 ParticipantCard/CompactParticipantCard/PlayerHoverCard 에 내려준다.

---

### 3.7 page.tsx 정리

**파일**: `apps/web/src/app/tournaments/[id]/lobby/page.tsx`

#### 3.7.1 제거할 코드

- line 25–95 (icons 관련) → `_components/icons.tsx` 에서 import
- line 97–202 (`PlayerHoverTooltip`) → `_components/PlayerHoverCard.tsx` 에서 import (이름 `PlayerHoverCard`)
- line 205–302 (`ParticipantCard`) → `_components/ParticipantCard.tsx` 에서 import
- line 305–317 (`EmptySlot`) → `_components/ParticipantCard.tsx` 에서 import
- line 321–398 (`CompactParticipantCard`) → `_components/CompactParticipantCard.tsx` 에서 import

#### 3.7.2 추가할 코드

```tsx
import { PositionIcon, ChampionIcon } from "./_components/icons";
import { PlayerHoverCard } from "./_components/PlayerHoverCard";
import { ParticipantCard, EmptySlot } from "./_components/ParticipantCard";
import { CompactParticipantCard } from "./_components/CompactParticipantCard";
import { PlayerProfileModal } from "./_components/PlayerProfileModal";
```

```tsx
// 메인 컴포넌트 안에 모달 state 추가
const [profileUserId, setProfileUserId] = useState<string | null>(null);

// 호버 닫기 지연 헬퍼 (3.6.1 참고)
const hoverCloseTimer = useRef<NodeJS.Timeout | null>(null);
const scheduleHoverClose = () => { ... };
const cancelHoverClose = () => { ... };

// 호버 카드 렌더링부 (기존 자리)
{hoveredPlayer && (
  <PlayerHoverCard
    participant={hoveredPlayer.participant}
    anchorRect={hoveredPlayer.rect}
    onOpenProfile={(userId) => {
      setProfileUserId(userId);
      setHoveredPlayer(null);
    }}
    onMouseEnter={cancelHoverClose}
    onMouseLeave={scheduleHoverClose}
  />
)}

// 모달
<PlayerProfileModal
  userId={profileUserId}
  onClose={() => setProfileUserId(null)}
/>
```

#### 3.7.3 ParticipantCard / CompactParticipantCard 호출 부분에 새 props 전달

```tsx
<CompactParticipantCard
  ...기존 props
  setHoveredPlayer={setHoveredPlayer}
  scheduleHoverClose={scheduleHoverClose}
  cancelHoverClose={cancelHoverClose}
/>
```

`onMouseLeave={scheduleHoverClose}`, `onMouseEnter` 는 기존처럼 `setHoveredPlayer({...})` 바로 호출 (단 `cancelHoverClose()` 도 같이 부르면 더 안정적).

#### 3.7.4 결과 LOC 목표

`page.tsx`: 940 → ~480 (약 460 줄 감소)

---

## 4. UI 디자인 상세

### 4.1 호버 카드 색상 토큰

| 영역 | 클래스 |
|---|---|
| 카드 배경 | `bg-bg-elevated border border-bg-tertiary` |
| 섹션 구분선 | `border-bg-tertiary` |
| 라벨 | `text-text-tertiary text-[10px] uppercase tracking-wider` |
| 본문 | `text-text-primary text-xs` |
| 보조 텍스트 | `text-text-secondary text-xs` |
| 액션 버튼 | `bg-accent-primary/10 hover:bg-accent-primary/20 text-accent-primary` |

### 4.2 모달 색상

`Modal` 컴포넌트가 이미 `bg-bg-secondary border border-bg-tertiary` 적용 중. 본문은 그 안에 섹션 단위로 `bg-bg-tertiary rounded-lg p-3`.

### 4.3 디스코드 안 따라하는 부분 (의도적)

- 디스코드의 "Mutual Servers / Mutual Friends" 영역은 만들지 않는다 (도메인이 다름)
- 디스코드의 "Note" 입력란도 없음
- 디스코드의 풀 banner 이미지도 없고, 티어 그라데이션 색상으로 대체

---

## 5. 검증 방법

각 단계가 끝날 때마다:

```bash
cd /root/project_nexus
pnpm tsc --noEmit                              # 타입체크 (web/api 모두)
cd apps/web && pnpm tsc --noEmit               # web 단독
cd apps/api && pnpm tsc --noEmit               # api 단독
pnpm lint                                      # ESLint
```

브라우저 수동 테스트:
1. `pnpm dev` 후 `http://localhost:3000/tournaments/<roomId>/lobby` 접속
2. 참가자 카드에 마우스 올림 → 호버 카드 320px 폭으로 표시, 신뢰도/전적/클랜/피크 티어 모두 표시
3. 호버 카드 위로 마우스 이동 → 카드가 닫히지 않음
4. "프로필 보기" 클릭 → 모달이 열림, 매치 이력까지 표시
5. ESC 또는 X 클릭 → 모달 닫힘, **방 연결 유지** (참가자 카드 그대로, 채팅 살아있음)
6. 봇 참가자 호버 → fetch 안 일어나고 (네트워크 탭 확인), "프로필 보기" 버튼 안 보임

---

## 6. 커밋 분할

CLAUDE.md 의 "작업 단위 커밋" 규칙 따라 다음 단위로 커밋:

1. `feat(api): room 응답에 peakTier/peakRank/lp 노출` — 3.1
2. `fix(web): reputationApi 경로 수정 + getUserStats wrapper 추가` — 3.2
3. `refactor(lobby): 아이콘/카드 컴포넌트를 _components 로 추출` — 3.3 + 3.6 + 3.7 (분해만, 기능 변화 없음)
4. `feat(lobby): 참가자 호버 카드 디스코드 스타일로 강화` — 3.4 (호버 카드 본체)
5. `feat(lobby): 프로필 모달 추가 — 페이지 이동 없이 풀 프로필 표시` — 3.5

> 3번과 4번을 합쳐도 되지만, 분해 단계의 회귀 위험이 0이므로 따로 가는 게 안전하다.

각 커밋 메시지 형식: `feat(lobby): ...` 또는 `refactor(lobby): ...` 한국어 본문 가능.

---

## 7. 리스크 / 주의사항

### 7.1 방에서 빠지는 문제 (이 작업의 핵심 동기)

`lobby/page.tsx:456-459` 의 useEffect cleanup 이 페이지 unmount 시 `disconnect()` → socket leave-room 이벤트 전송 → 서버에서 참가자 제거. 따라서 **모달 안에서 어떤 링크/버튼도 `router.push` 하면 안 된다**. 모달 내 Link 도 금지.

> 단, 모달의 매치 이력 카드를 클릭하면 매치 상세로 가고 싶을 수 있는데, 이 경우 새 탭 (`<a target="_blank" rel="noopener">`) 으로 열어야 한다.

### 7.2 hover state 깜빡임

3.6.1 의 80ms 지연 닫기를 안 쓰면, 호버 카드 위로 마우스 옮길 때 깜빡인다. 반드시 적용.

### 7.3 React Query 캐시 키 충돌

`["userStats", userId]`, `["reputationStats", userId]` 등은 다른 페이지에서도 쓸 수 있다. **캐시 키 컨벤션 일관성 유지** — 다른 곳에서 쓰는 키 있는지 grep 으로 확인 후 결정. 없으면 위 키 그대로 사용.

### 7.4 bot 참가자 처리

`/^testbot_\d+$/.test(participant.username)` 이면:
- 호버 카드: 신뢰도/전적/클랜 섹션 모두 미표시 (fetch 안 일어나야 함, `enabled` false)
- 호버 카드: "프로필 보기" 버튼 미표시
- 모달: 어차피 안 열리므로 신경 X

### 7.5 race condition

호버 → "프로필 보기" 클릭 직후 `setHoveredPlayer(null)` + `setProfileUserId(userId)` 가 동시에 일어나는데, 호버 카드의 onMouseLeave 와 순서 꼬이면 모달이 안 뜰 수 있다. **클릭 핸들러에서 `setProfileUserId` 를 먼저, `setHoveredPlayer(null)` 을 나중에** 호출.

### 7.6 페이지 분해는 기능 변화 없음

3.3 / 3.6 / 3.7 단계에서는 동작이 1mm 도 변하면 안 된다. 분해 직후 호버 카드가 기존과 똑같이 보여야 함. 그 다음 단계 (3.4) 에서 강화.

---

## 8. 완료 체크리스트

작업 끝나면 다음 모두 확인:

- [x] `apps/api/src/modules/room/room.service.ts:333-349` 에 peakTier/peakRank/lp 추가됨
- [x] `apps/web/src/lib/api-client.ts` 의 `reputationApi.getUserRatings` 경로가 `users` (복수형)
- [x] `apps/web/src/lib/api-client.ts` 의 `reputationApi.getUserStats` wrapper 존재
- [x] `apps/web/src/app/tournaments/[id]/lobby/_components/` 아래 5개 파일 존재 (icons, PlayerHoverCard, ParticipantCard, CompactParticipantCard, PlayerProfileModal)
- [x] `lobby/page.tsx` LOC 940 → 500 이하
- [x] 호버 카드 폭 320px, 디스코드 스타일 섹션 6개
- [x] 호버 카드 위로 마우스 이동 가능 (pointer-events 살아있음)
- [x] "프로필 보기" 클릭 시 모달이 같은 페이지에 뜨고, 닫으면 방 연결 유지
- [x] bot 참가자에게는 fetch / 프로필 버튼 없음
- [ ] `pnpm tsc --noEmit` (web + api 둘 다) 통과
- [ ] `pnpm lint` 통과
- [x] 5단계 커밋 모두 작성, CLAUDE.md 양식 준수
