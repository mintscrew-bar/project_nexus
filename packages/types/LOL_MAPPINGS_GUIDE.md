# LoL Game Elements Mapping Guide

리그 오브 레전드 게임 요소(챔피언, 아이템, 룬)의 영문->한글 매핑 가이드입니다.

## 개요

- **데이터 소스**: Riot Games Dragon API (14.8.1 패치 기준)
- **현재 포함 항목**:
  - 챔피언: 169명 (모든 챔피언)
  - 아이템: 주요 40개
  - 룬: 주요 30개
- **파일 위치**: `packages/types/src/lol-mappings.ts`

## 사용 예시

### 1. 챔피언 매핑

```typescript
import {
  getChampionKoreanName,
  getChampionEnglishName,
  CHAMPION_MAPPINGS,
} from '@nexus/types';

// 영문 -> 한글
const koreanName = getChampionKoreanName('Ahri'); // "아리"

// 한글 -> 영문
const englishName = getChampionEnglishName('아리'); // "Ahri"

// 직접 접근
const name = CHAMPION_MAPPINGS['Lee Sin']; // "리 신"
```

### 2. 아이템 매핑

```typescript
import {
  getItemKoreanName,
  getItemEnglishName,
  ITEM_MAPPINGS,
} from '@nexus/types';

// 영문 -> 한글
const koreanName = getItemKoreanName('B.F. Sword'); // "B.F. 대검"

// 한글 -> 영문
const englishName = getItemEnglishName('B.F. 대검'); // "B.F. Sword"

// 직접 접근
const name = ITEM_MAPPINGS['Doran\'s Blade']; // "도란의 검"
```

### 3. 룬 매핑

```typescript
import {
  getRuneKoreanName,
  getRuneEnglishName,
  RUNE_MAPPINGS,
} from '@nexus/types';

// 영문 -> 한글
const koreanName = getRuneKoreanName('Electrocute'); // "감전"

// 한글 -> 영문
const englishName = getRuneEnglishName('감전'); // "Electrocute"

// 직접 접근
const name = RUNE_MAPPINGS['Conqueror']; // "정복자"
```

### 4. 전체 목록 조회

```typescript
import {
  getAllChampionNames,
  getAllChampionKoreanNames,
  getAllItemNames,
  getAllRuneNames,
} from '@nexus/types';

// 모든 챔피언 영문 이름
const allChamps = getAllChampionNames();

// 모든 챔피언 한글 이름
const allKoreanChamps = getAllChampionKoreanNames();

// 모든 아이템 영문 이름
const allItems = getAllItemNames();

// 모든 룬 영문 이름
const allRunes = getAllRuneNames();
```

## 실제 사용 사례

### 경매 시스템에서 선택 챔피언 표시

```typescript
// API에서 받은 데이터
const selectedChampion = 'Ahri';

// UI에 표시할 한글 이름
const displayName = getChampionKoreanName(selectedChampion);
// 결과: "아리"
```

### 통계 페이지에서 아이템 빌드 표시

```typescript
const itemBuild = ['B.F. Sword', 'Needlessly Large Rod', 'Abyssal Mask'];

const koreanBuild = itemBuild.map(item => getItemKoreanName(item));
// 결과: ["B.F. 대검", "쓸데없이 큰 지팡이", "심연의 가면"]
```

### 전적 분석에서 룬 표시

```typescript
const selectedRunes = {
  primary: 'Electrocute',
  secondary: 'Absolute Focus',
  shards: ['Adaptive Force', 'Armor', 'Health'],
};

const displayRunes = {
  primary: getRuneKoreanName(selectedRunes.primary), // "감전"
  secondary: getRuneKoreanName(selectedRunes.secondary), // "절대 집중"
};
```

## 데이터 추가/수정

### 새로운 챔피언, 아이템, 룬 추가하기

1. `lol-mappings.ts` 파일 열기
2. 해당 `CHAMPION_MAPPINGS`, `ITEM_MAPPINGS`, 또는 `RUNE_MAPPINGS` 객체에 항목 추가
3. 변경사항 커밋

예시:
```typescript
// 새로운 챔피언 추가
export const CHAMPION_MAPPINGS: Record<string, string> = {
  // ... 기존 항목들
  "NewChampion": "새로운챔피언",
};
```

## 타입 안전성

모든 함수는 TypeScript 타입 안전성을 지원합니다:

```typescript
// 타입 체크됨
const name: string = getChampionKoreanName('Ahri');

// 타입 체크됨 (역매핑은 optional 반환)
const englishName: string | undefined = getChampionEnglishName('아리');

// 배열 타입 확보
const names: string[] = getAllChampionNames();
```

## 성능 고려사항

- 함수들은 object lookup을 사용하여 O(1) 시간복잡도
- 역매핑 함수(`getChampionEnglishName` 등)는 O(n) 시간복잡도 (배열 검색)
- 자주 사용하는 역매핑은 별도 맵 생성 권장

```typescript
// 성능 최적화: 자주 역매핑하는 경우
const koreanToEnglish = Object.entries(CHAMPION_MAPPINGS)
  .reduce((acc, [en, ko]) => ({ ...acc, [ko]: en }), {} as Record<string, string>);

// 이후 O(1) 조회 가능
const englishName = koreanToEnglish['아리']; // "Ahri"
```

## 참고사항

- 모든 한글 이름은 공식 Riot Games 한글판 기준입니다
- 패치 업데이트 시 새로운 챔피언/아이템/룬이 추가될 수 있습니다
- 레거시 아이템이나 제거된 아이템은 별도 관리 필요합니다

## 다음 단계

- [x] 소환사 주문 매핑 추가 (18종, `getSummonerSpellKoreanName`)
- [ ] 스킨 이름 매핑 추가 (프로젝트에서 미사용 — 필요 시 추가)
- [ ] 능력(Q, W, E, R) 이름 매핑 추가 (챔피언당 5개, 약 900개 — 필요 시 추가)
- [x] 자동 업데이트 스크립트 작성 (`scripts/update-mappings.ts`, `pnpm mappings:update`)
