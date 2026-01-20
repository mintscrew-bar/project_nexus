# Project Nexus - Design System

> 치지직 + Discord 감성의 실용적이고 최적화된 게임 토너먼트 플랫폼

---

## 🎨 디자인 철학

### 핵심 원칙

1. **기능 우선 (Function over Form)**
   - 모든 디자인은 사용자 경험을 방해하지 않아야 함
   - 장식적 요소는 최소화, 필요한 경우에만 사용

2. **최적화 우선 (Performance First)**
   - 저사양 PC/서버에서도 원활한 작동
   - 불필요한 애니메이션/효과 지양
   - 빠른 로딩과 반응성 보장

3. **직관적 UX (Intuitive UX)**
   - 사용자가 설명 없이도 기능 사용 가능
   - 명확한 액션 버튼과 상태 표시
   - 일관된 레이아웃과 네비게이션

4. **접근성 (Accessibility)**
   - 충분한 대비 (명확한 텍스트 가독성)
   - 키보드 네비게이션 지원
   - 색맹 사용자 고려

---

## 🎨 컬러 시스템

### Dark Theme (Primary)

#### Background Colors
```css
--bg-primary: #0f0f0f      /* 메인 배경 (치지직 스타일) */
--bg-secondary: #1a1a1a    /* 카드/섹션 배경 */
--bg-tertiary: #242424     /* 호버 상태 */
--bg-elevated: #2a2a2a     /* 모달/드롭다운 */
```

#### Text Colors
```css
--text-primary: #f0f0f0    /* 주요 텍스트 */
--text-secondary: #b0b0b0  /* 부가 텍스트 */
--text-tertiary: #707070   /* 비활성 텍스트 */
--text-muted: #4a4a4a      /* Placeholder */
```

#### Accent Colors (LoL 테마)
```css
--accent-primary: #0bc4e2   /* 주요 액션 (치지직 청록) */
--accent-hover: #09a8c2     /* 호버 상태 */
--accent-active: #078ca8    /* 클릭 상태 */

--accent-gold: #c89b3c      /* 랭크/프리미엄 (LoL 골드) */
--accent-success: #00c853   /* 성공/승리 */
--accent-danger: #ff1744    /* 오류/경고 */
--accent-warning: #ffa726   /* 주의 */
```

#### Tier Colors (LoL 티어 시스템)
```css
--tier-iron: #5a5a5a
--tier-bronze: #cd7f32
--tier-silver: #c0c0c0
--tier-gold: #ffd700
--tier-platinum: #40e0d0
--tier-emerald: #50c878
--tier-diamond: #b9f2ff
--tier-master: #9b30ff
--tier-grandmaster: #ff4500
--tier-challenger: #f4c430
```

### 컬러 사용 가이드

- **Primary Accent** (`--accent-primary`): 주요 CTA 버튼, 링크
- **Gold**: 랭크 표시, 프리미엄 기능, 강조
- **Success**: 준비 완료, 승리, 성공 메시지
- **Danger**: 오류, 밴, 신고, 삭제
- **Warning**: 경고, 주의사항

---

## 📐 Typography

### Font Family
```css
font-family:
  'Pretendard Variable', /* 한글 */
  -apple-system,
  BlinkMacSystemFont,
  'Segoe UI',
  sans-serif; /* 시스템 폰트 우선 - 최적화 */
```

### Font Sizes
```css
--text-xs: 0.75rem;    /* 12px - 작은 레이블 */
--text-sm: 0.875rem;   /* 14px - 부가 정보 */
--text-base: 1rem;     /* 16px - 기본 텍스트 */
--text-lg: 1.125rem;   /* 18px - 섹션 제목 */
--text-xl: 1.25rem;    /* 20px - 카드 제목 */
--text-2xl: 1.5rem;    /* 24px - 페이지 제목 */
--text-3xl: 1.875rem;  /* 30px - 히어로 텍스트 */
```

### Font Weights
```css
--font-normal: 400;
--font-medium: 500;  /* 주요 사용 */
--font-semibold: 600; /* 강조 */
--font-bold: 700;    /* 제목만 */
```

---

## 🧩 Spacing System

### Scale (8px 기반)
```css
--space-1: 0.25rem;  /* 4px */
--space-2: 0.5rem;   /* 8px */
--space-3: 0.75rem;  /* 12px */
--space-4: 1rem;     /* 16px - 기본 */
--space-5: 1.25rem;  /* 20px */
--space-6: 1.5rem;   /* 24px */
--space-8: 2rem;     /* 32px */
--space-10: 2.5rem;  /* 40px */
--space-12: 3rem;    /* 48px */
```

---

## 🎭 Component Patterns

### 1. Buttons

#### Primary Button (주요 액션)
```tsx
<button className="
  px-6 py-2.5
  bg-accent-primary hover:bg-accent-hover active:bg-accent-active
  text-white font-medium
  rounded-lg
  transition-colors duration-150
  disabled:opacity-50 disabled:cursor-not-allowed
">
  방 참가하기
</button>
```

#### Secondary Button
```tsx
<button className="
  px-6 py-2.5
  bg-bg-tertiary hover:bg-bg-elevated
  text-text-primary font-medium
  border border-text-tertiary
  rounded-lg
  transition-colors duration-150
">
  취소
</button>
```

#### Danger Button
```tsx
<button className="
  px-6 py-2.5
  bg-accent-danger hover:bg-red-600
  text-white font-medium
  rounded-lg
  transition-colors duration-150
">
  방 나가기
</button>
```

### 2. Cards

#### Basic Card (방 목록, 프로필 등)
```tsx
<div className="
  bg-bg-secondary
  border border-bg-tertiary
  rounded-lg
  p-4
  hover:border-accent-primary/50
  transition-all duration-200
">
  {/* Content */}
</div>
```

#### Elevated Card (모달, 중요 정보)
```tsx
<div className="
  bg-bg-elevated
  border border-bg-tertiary
  rounded-xl
  p-6
  shadow-xl
">
  {/* Content */}
</div>
```

### 3. Input Fields

```tsx
<input className="
  w-full px-4 py-2.5
  bg-bg-tertiary
  border border-text-muted
  text-text-primary
  rounded-lg
  focus:border-accent-primary focus:outline-none
  transition-colors duration-150
  placeholder:text-text-muted
" />
```

### 4. Status Badges

```tsx
{/* 준비 완료 */}
<span className="px-3 py-1 bg-accent-success/20 text-accent-success rounded-full text-sm font-medium">
  준비 완료
</span>

{/* 대기 중 */}
<span className="px-3 py-1 bg-text-muted/20 text-text-secondary rounded-full text-sm">
  대기 중
</span>

{/* 진행 중 */}
<span className="px-3 py-1 bg-accent-primary/20 text-accent-primary rounded-full text-sm font-medium">
  진행 중
</span>
```

### 5. Tier Badges

```tsx
<div className="flex items-center gap-2">
  <div className="w-6 h-6 rounded bg-tier-diamond" />
  <span className="text-tier-diamond font-semibold">Diamond IV</span>
</div>
```

---

## ⚡ 애니메이션 가이드

### 허용되는 애니메이션 (간단하고 필요한 것만)

#### 1. Hover Transitions (150ms)
```css
transition: background-color 150ms ease-in-out;
transition: border-color 150ms ease-in-out;
transition: opacity 150ms ease-in-out;
```

#### 2. Modal/Dropdown Fade-in
```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
animation: fadeIn 200ms ease-out;
```

#### 3. Toast Notifications (Slide-in)
```css
@keyframes slideIn {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
animation: slideIn 300ms ease-out;
```

### ❌ 금지되는 애니메이션

- ❌ 페이지 전환 애니메이션 (느림)
- ❌ 복잡한 키프레임 애니메이션
- ❌ 지속적으로 움직이는 요소
- ❌ 3D 변환 (transform: rotateX, rotateY)
- ❌ 블러/그림자 애니메이션 (성능 저하)

---

## 📱 반응형 디자인

### Breakpoints
```css
--screen-sm: 640px;   /* 모바일 */
--screen-md: 768px;   /* 태블릿 */
--screen-lg: 1024px;  /* 데스크톱 */
--screen-xl: 1280px;  /* 와이드 */
```

### Mobile-First Approach
```tsx
{/* 모바일 기본, 데스크톱에서 변경 */}
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
```

---

## 🎯 레이아웃 패턴

### 1. Main Layout (Discord-style)

```
┌─────────────────────────────────────┐
│  Header (네비게이션)                 │
├──────┬──────────────────────────────┤
│      │                              │
│ Side │  Main Content                │
│ bar  │  (방 목록, 게임 화면 등)      │
│      │                              │
│      │                              │
├──────┴──────────────────────────────┤
│  Footer (선택적)                     │
└─────────────────────────────────────┘
```

### 2. Room/Lobby Layout (치지직 스타일)

```
┌─────────────────────┬───────────────┐
│                     │               │
│   Participants      │   Chat        │
│   (10-20명)         │               │
│                     │               │
│   [준비 버튼]       │               │
│                     │   [입력창]    │
├─────────────────────┴───────────────┤
│   Room Settings / Actions           │
└─────────────────────────────────────┘
```

### 3. Auction/Draft Screen

```
┌─────────────────────────────────────┐
│   현재 플레이어 정보 (크게 표시)     │
│   [티어 배지] [포지션] [챔피언]      │
├──────────────┬──────────────────────┤
│              │                      │
│  팀 1        │  타이머 & 입찰 정보   │
│  (골드 표시) │                      │
│              │  [입찰 버튼]          │
│──────────────┤                      │
│  팀 2        │                      │
│              │                      │
└──────────────┴──────────────────────┘
```

---

## 🚀 성능 최적화 가이드

### 1. 이미지 최적화
- **WebP 포맷 사용** (PNG/JPEG 대비 30% 작음)
- **Lazy Loading**: `loading="lazy"`
- **적절한 크기**: 아바타 64x64, 배너 1920x400

```tsx
<Image
  src="/avatar.webp"
  width={64}
  height={64}
  loading="lazy"
  alt="User Avatar"
/>
```

### 2. 컴포넌트 최적화
- **React.memo()** 사용 (불필요한 리렌더 방지)
- **useMemo/useCallback** 적절히 사용
- **Virtualization**: 긴 리스트는 react-window 사용

```tsx
const RoomCard = React.memo(({ room }) => {
  return <div>{/* ... */}</div>;
});
```

### 3. 번들 크기 최적화
- **Tree Shaking**: 사용하지 않는 코드 제거
- **Code Splitting**: 페이지별 분할 로딩
- **Dynamic Import**: 무거운 컴포넌트는 필요할 때만

```tsx
const AuctionPage = dynamic(() => import('./AuctionPage'), {
  loading: () => <LoadingSpinner />
});
```

### 4. CSS 최적화
- **Tailwind CSS Purge**: 사용하지 않는 스타일 제거
- **Critical CSS**: 초기 렌더링에 필요한 CSS만 먼저 로드
- **CSS-in-JS 지양**: Tailwind 클래스 우선 사용

---

## 📋 UI Components Checklist

### 기본 컴포넌트
- [ ] Button (Primary, Secondary, Danger)
- [ ] Input (Text, Password, Number)
- [ ] Card (Basic, Elevated)
- [ ] Badge (Status, Tier)
- [ ] Avatar (User, Team)
- [ ] Modal (Center, Fullscreen)
- [ ] Dropdown (Select, Menu)
- [ ] Toast Notification

### 레이아웃 컴포넌트
- [ ] Header/Navbar
- [ ] Sidebar
- [ ] Footer
- [ ] Container/Grid

### 도메인 컴포넌트
- [ ] RoomCard (방 목록)
- [ ] ParticipantList (참가자)
- [ ] ChatBox (채팅)
- [ ] AuctionBoard (경매 화면)
- [ ] DraftBoard (드래프트 화면)
- [ ] MatchBracket (토너먼트 대진표)
- [ ] UserProfile (프로필 카드)
- [ ] TierBadge (티어 배지)

---

## 🎨 영감 출처 (표절 방지)

### 치지직에서 배울 점
- ✅ 어두운 테마 + 청록색 액센트
- ✅ 깔끔한 카드 레이아웃
- ✅ 실시간 채팅 UI
- ❌ 특정 아이콘/로고 복사 금지
- ❌ 레이아웃 구조 그대로 복사 금지

### Discord에서 배울 점
- ✅ 사이드바 네비게이션
- ✅ 참가자 리스트 UI
- ✅ 상태 표시 (온라인, 준비 등)
- ❌ 색상 팔레트 그대로 사용 금지
- ❌ UI 컴포넌트 디자인 복사 금지

### 우리만의 차별점
- ✨ LoL 티어 시스템 통합
- ✨ 경매/드래프트 전용 UI
- ✨ 토너먼트 대진표 시각화
- ✨ 게임 중심 디자인 (커뮤니티가 아닌 게임)

---

## 📏 코드 스타일 가이드

### Tailwind 클래스 순서
```tsx
className="
  {/* Layout */}
  flex items-center justify-between
  {/* Sizing */}
  w-full h-12 px-4 py-2
  {/* Colors */}
  bg-bg-secondary text-text-primary
  {/* Borders */}
  border border-bg-tertiary rounded-lg
  {/* Effects */}
  hover:bg-bg-tertiary transition-colors
"
```

### 파일 구조
```
components/
├── ui/              # 기본 UI 컴포넌트
│   ├── Button.tsx
│   ├── Card.tsx
│   └── Input.tsx
├── layout/          # 레이아웃 컴포넌트
│   ├── Header.tsx
│   └── Sidebar.tsx
└── domain/          # 도메인 특화 컴포넌트
    ├── RoomCard.tsx
    ├── AuctionBoard.tsx
    └── ChatBox.tsx
```

---

이 디자인 시스템을 기반으로 일관되고 최적화된 UI를 구축할 수 있습니다!
