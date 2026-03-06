# Changelog

이 프로젝트의 주요 변경사항을 기록합니다.

---

## [2025-02-13] UI/UX 개선, 시뮬레이션 확장, 백엔드 보안 강화

### 🎨 UI/UX 개선

#### 친구 패널 온라인 표시
- **파일**: `apps/web/src/components/domain/FriendsPanel.tsx`
- 카테고리별 친구 수 표시를 `(온라인/전체)` 형식으로 변경
- 온라인 수가 1명 이상이면 초록색으로 하이라이트

#### 채팅 UI 수정
- **파일**: `apps/web/src/components/domain/ChatBox.tsx`
- "전송" 버튼 텍스트 겹침 해결 (`flex-shrink-0`, `whitespace-nowrap`)

#### 아바타 이미지 왜곡 수정
- **파일**: `apps/web/src/components/ui/Avatar.tsx`
- Next.js Image `fill` prop 사용 시 이미지 찌그러짐 해결 (`relative`, `flex-shrink-0` 추가)

#### 테마 설정 기능 수정
- **파일**: `apps/web/src/components/domain/UserSettingsModal.tsx`
- `next-themes`의 `setTheme` 연동으로 테마 변경 즉시 반영
- API 실패 시 이전 테마로 롤백 처리

### 🏟️ 로비 참가자 카드 리디자인
- **파일**: `apps/web/src/app/tournaments/[id]/lobby/page.tsx`, `apps/web/src/stores/lobby-store.ts`
- 대표 라이엇 계정 정보 (gameName#tagLine) 표시
- Community Dragon SVG 라인 아이콘으로 주/부 라인 표시
- 선호 챔피언 아이콘 표시 (호버 시 상세)
- `PlayerHoverTooltip` 컴포넌트 추가
- 친구 추가 버튼 통합 (상태별: 추가/요청됨/이미 친구)

### 🎮 시뮬레이션 페이지 대규모 확장
- **파일**: `apps/web/src/app/simulation/page.tsx`

#### 4단계 시뮬레이션 흐름
- `설정` → `팀 구성` → **`라인 선택`** → `대진표` → `결과`
- `StepIndicator` UI로 진행 단계 시각화

#### 라인 선택 단계 (신규)
- 팀 구성 완료 후 라인 배정 단계 추가 (백엔드 `role-selection.service.ts` 로직 동기화)
- **인터랙티브 모드**: 2분 타이머, 팀원별 5개 라인 버튼 (Community Dragon SVG 아이콘)
  - 선호 라인 하이라이트, 중복 방지, 자동 배정 버튼
  - 타이머 만료 시 미배정 라인 자동 배정
- **자동 모드**: 주라인 → 부라인 → 랜덤 순서로 즉시 배정

#### 경매 시스템 개선
- **유찰(Yuchal) 시스템**: 백엔드 로직과 동기화
  - `yuchalCount` / `maxYuchalCycles`로 모든 팀에게 기회 부여 후 강제 배정
  - 보너스 골드 500G 팀당 1회 제한 (`hasReceivedBonus`)
  - 유찰 카운트 UI 표시 (`유찰 1/2`)
- **예산 소진 팀 처리**: 남은 팀이 최소 금액(50G)으로 입찰
- **누적형 입찰 UX**: +50G/+100G/+500G 누적 → 입찰/초기화 분리
- **50단위 강제**: 봇/유저 모두 50G 단위로만 입찰
- **입찰 불가 팀 감지**: 모든 팀 예산 부족 시 유찰 순환 스킵 → 즉시 강제 배정

#### 드래프트 시스템
- 인터랙티브 모드에서 직접 선수 픽 가능
- 스네이크 드래프트 순서 (홀수 라운드 정방향, 짝수 역방향)

#### 대진표 & 결과
- 토너먼트 브라켓 자동 생성 (`generateBracket`)
- `MatchCard` 컴포넌트: 자동 시뮬레이션 / 수동 승패 결정
- MMR 기반 승률 계산
- 우승팀 결과 화면

#### Community Dragon 라인 아이콘
- 모든 포지션 표시를 이모지에서 Community Dragon SVG 아이콘으로 교체
- `PositionIcon` 컴포넌트 (position-top/jungle/middle/bottom/utility.svg)
- PlayerCard, TeamDisplay, 라인 선택 UI, 결과 화면 모두 적용

#### 카오스 모드 (신규)
- 봇 예외 행동 시뮬레이션 토글
- 🔴 **무응답** (0~50%): 봇이 반응 안 함 → 타임아웃/유찰 테스트
- 🟡 **지연** (0~50%): 2~6초 늦게 반응 → 네트워크 래그 시뮬레이션
- 🟠 **연타** (0~30%): 같은 입찰 2~3회 연속 → 멱등성 테스트
- 경매/드래프트 모두 적용, 로그에 `[카오스]` 태그로 표시

### 🛡️ 백엔드 보안 & 검증 강화

#### 경매 서비스 (`auction.service.ts`)
- **타이머 만료 체크**: `Date.now() > state.timerEnd` → 만료 후 입찰 차단
- **자기 팀 중복 입찰 차단**: 이미 최고가인 팀의 재입찰 방지

#### 경매 게이트웨이 (`auction.gateway.ts`)
- **Payload validation**: `roomId`, `amount` 타입/존재 검증
- **Rate limiting**: Redis 기반 유저당 3초에 최대 5회 입찰 제한
- **연결 트래킹**: `connectedUsers` Map으로 방별 유저 관리, disconnect 시 정리

#### 드래프트 서비스 (`snake-draft.service.ts`)
- **타이머 만료 체크**: `Date.now() > state.timerEnd` → 만료 후 픽 차단

#### 드래프트 게이트웨이 (`snake-draft.gateway.ts`)
- **Payload validation**: `roomId`, `targetPlayerId` 존재 검증
- **Rate limiting**: Redis 기반 유저당 2초에 최대 3회 픽 제한

### 🔧 기타 변경
- **파일**: `apps/web/src/components/domain/AuctionBoard.tsx`
  - 누적형 입찰 UI (accumulatedBid → totalBid → 입찰하기/초기화)

---

### 변경된 파일 목록

**백엔드 (apps/api)**
- `src/modules/auction/auction.service.ts` — 타이머/중복 입찰 검증
- `src/modules/auction/auction.gateway.ts` — rate limiting, payload 검증, 연결 관리
- `src/modules/room/snake-draft.service.ts` — 타이머 검증
- `src/modules/room/snake-draft.gateway.ts` — rate limiting, payload 검증

**프론트엔드 (apps/web)**
- `src/app/simulation/page.tsx` — 시뮬레이션 전면 확장 (라인 선택, 유찰 시스템, 카오스 모드)
- `src/app/tournaments/[id]/lobby/page.tsx` — 참가자 카드 리디자인
- `src/components/domain/FriendsPanel.tsx` — 온라인 친구 수 표시 (신규)
- `src/components/domain/AuctionBoard.tsx` — 누적형 입찰 UI
- `src/components/domain/ChatBox.tsx` — 전송 버튼 수정
- `src/components/domain/UserSettingsModal.tsx` — 테마 설정 연동
- `src/components/ui/Avatar.tsx` — 이미지 왜곡 수정
- `src/stores/friend-store.ts` — 친구 스토어 (신규)
- `src/stores/lobby-store.ts` — RiotAccount 인터페이스 확장
- `src/stores/presence-store.ts` — 온라인 상태 관리 개선
