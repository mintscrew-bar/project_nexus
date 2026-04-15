# League of Legends 영문↔한글 매핑 시스템

리그 오브 레전드의 게임 요소(챔피언, 아이템, 룬)를 영문과 한글로 매핑하는 통합 시스템입니다.

## 📦 포함 내용

### 데이터 파일
- **`src/lol-mappings.ts`** - 타입 정의 및 유틸리티 함수 (메인 모듈)
- **`src/lol-mappings.json`** - 매핑 데이터 JSON 형식
- **`src/lol-mappings.test.ts`** - 테스트 케이스 (60+ 시나리오)

### 문서
- **`LOL_MAPPINGS_GUIDE.md`** - 사용 가이드 및 API 문서
- **`LOL_MAPPINGS_EXAMPLES.md`** - 실제 통합 예시 (백엔드, 프론트엔드, Socket.IO)
- **`LOL_MAPPINGS_README.md`** - 이 문서

## 🎯 주요 기능

### 매핑 데이터
```typescript
// 169명 전챔피언
const champion = getChampionKoreanName('Ahri');  // "아리"

// 주요 40개 아이템
const item = getItemKoreanName('B.F. Sword');    // "B.F. 대검"

// 주요 30개 룬
const rune = getRuneKoreanName('Electrocute');   // "감전"
```

### 양방향 변환
```typescript
// 영문 → 한글
getChampionKoreanName('Ahri');           // "아리"
getItemKoreanName('Doran\'s Blade');     // "도란의 검"
getRuneKoreanName('Conqueror');          // "정복자"

// 한글 → 영문
getChampionEnglishName('아리');          // "Ahri"
getItemEnglishName('도란의 검');         // "Doran's Blade"
getRuneEnglishName('정복자');            // "Conqueror"
```

### 전체 목록 조회
```typescript
getAllChampionNames();      // ["Aatrox", "Ahri", ...]
getAllChampionKoreanNames(); // ["아트록스", "아리", ...]
getAllItemNames();           // ["B.F. Sword", ...]
getAllRuneNames();           // ["Electrocute", ...]
```

## 🚀 빠른 시작

### 1. 패키지 임포트
```typescript
import {
  getChampionKoreanName,
  getItemKoreanName,
  getRuneKoreanName,
  CHAMPION_MAPPINGS,
  ITEM_MAPPINGS,
  RUNE_MAPPINGS,
} from '@nexus/types';
```

### 2. 기본 사용
```typescript
// 백엔드
const displayName = getChampionKoreanName(dbChampion); // "아리"

// 프론트엔드
const options = getAllChampionNames().map(name => ({
  label: getChampionKoreanName(name),
  value: name,
}));
```

### 3. 고급 사용
```typescript
// 검색
const matches = Object.entries(CHAMPION_MAPPINGS)
  .filter(([_, korean]) => korean.includes('아'))
  .map(([english]) => english);

// 배치 변환
const champions = ['Ahri', 'LeeSin', 'Yasuo'];
const korean = champions.map(c => getChampionKoreanName(c));
// ["아리", "리 신", "야스오"]
```

## 📊 데이터 통계

| 항목 | 개수 | 비고 |
|-----|------|------|
| 챔피언 | 169 | 2026년 4월 기준 전체 챔피언 |
| 아이템 | 40 | 주요 빌드 아이템 |
| 룬 | 30 | 주요 룬 및 보조 룬 |

## 🔧 기술 스택

- **언어**: TypeScript
- **데이터 소스**: Riot Games Dragon API (14.8.1 패치)
- **저장소**: `packages/types/src/`
- **Export**: `@nexus/types` (index.ts 재내보내기)

## 📚 상세 문서

| 문서 | 내용 |
|-----|------|
| [LOL_MAPPINGS_GUIDE.md](./LOL_MAPPINGS_GUIDE.md) | API 레퍼런스, 사용 예시, 성능 최적화 |
| [LOL_MAPPINGS_EXAMPLES.md](./LOL_MAPPINGS_EXAMPLES.md) | 실제 프로젝트 통합 예시, 마이그레이션 가이드 |

## 🔄 API 레퍼런스

### 함수

#### `getChampionKoreanName(championName: string): string`
영문 챔피언 이름을 한글로 변환합니다.
```typescript
getChampionKoreanName('Ahri'); // "아리"
getChampionKoreanName('Unknown'); // "Unknown" (매핑 없으면 원본)
```

#### `getChampionEnglishName(koreanName: string): string | undefined`
한글 챔피언 이름을 영문으로 변환합니다.
```typescript
getChampionEnglishName('아리'); // "Ahri"
getChampionEnglishName('없는이름'); // undefined
```

#### `getItemKoreanName(itemName: string): string`
영문 아이템 이름을 한글로 변환합니다.

#### `getItemEnglishName(koreanName: string): string | undefined`
한글 아이템 이름을 영문으로 변환합니다.

#### `getRuneKoreanName(runeName: string): string`
영문 룬 이름을 한글로 변환합니다.

#### `getRuneEnglishName(koreanName: string): string | undefined`
한글 룬 이름을 영문으로 변환합니다.

#### `getAllChampionNames(): string[]`
모든 챔피언의 영문 이름 목록을 반환합니다.

#### `getAllChampionKoreanNames(): string[]`
모든 챔피언의 한글 이름 목록을 반환합니다.

#### `getAllItemNames(): string[]`
모든 아이템의 영문 이름 목록을 반환합니다.

#### `getAllItemKoreanNames(): string[]`
모든 아이템의 한글 이름 목록을 반환합니다.

#### `getAllRuneNames(): string[]`
모든 룬의 영문 이름 목록을 반환합니다.

#### `getAllRuneKoreanNames(): string[]`
모든 룬의 한글 이름 목록을 반환합니다.

### 상수 객체

#### `CHAMPION_MAPPINGS: Record<string, string>`
{ "Ahri": "아리", ... }

#### `ITEM_MAPPINGS: Record<string, string>`
{ "B.F. Sword": "B.F. 대검", ... }

#### `RUNE_MAPPINGS: Record<string, string>`
{ "Electrocute": "감전", ... }

## 💡 실제 사용 사례

### 경매 시스템
```typescript
// 사용자가 선택한 챔피언을 한글로 표시
const selected = 'Ahri';
const display = getChampionKoreanName(selected); // "아리"
```

### 통계 페이지
```typescript
// 챔피언별 통계를 한글 이름으로 표시
const stats = await getChampionStats('Ahri');
return {
  champion: getChampionKoreanName('Ahri'),
  winRate: stats.winRate,
};
```

### 검색 기능
```typescript
// 사용자 입력(한글)을 영문으로 변환하여 DB 검색
const koreanInput = '아리';
const englishName = getChampionEnglishName(koreanInput); // "Ahri"
const result = await db.champion.findUnique({ where: { name: englishName } });
```

### 실시간 알림
```typescript
// Socket.IO를 통해 한글 이름으로 알림 전송
socket.emit('champion_selected', {
  championEnglish: 'Ahri',
  championKorean: getChampionKoreanName('Ahri'),
});
```

## ✅ 테스트

테스트 파일: `src/lol-mappings.test.ts`

```bash
# 테스트 실행 (API 패키지에서)
cd apps/api
pnpm test

# 또는 전체 프로젝트
pnpm test
```

테스트 커버리지:
- ✅ 정방향 변환 (영문 → 한글)
- ✅ 역방향 변환 (한글 → 영문)
- ✅ 전체 목록 조회
- ✅ 실제 사용 사례 시뮬레이션
- ✅ 데이터 무결성 검증

## 🔐 데이터 무결성

모든 매핑은 다음을 보장합니다:
- ✅ 중복 없음 (영문/한글 모두 고유)
- ✅ 공식 Riot Games 한글판 기준
- ✅ 현재 최신 패치 기준 (14.8.1)
- ✅ 빈 값 없음

## 🔄 업데이트 및 유지보수

### 새 챔피언/아이템/룬 추가
```typescript
// 1. lol-mappings.ts에서 해당 맵에 추가
export const CHAMPION_MAPPINGS: Record<string, string> = {
  // ... 기존
  "NewChampion": "새챔피언",
};

// 2. index.ts 자동 재내보내기
// 3. 테스트 추가 (optional)
// 4. 커밋 및 배포
```

### 데이터 출처
- Dragon API: https://ddragon.leagueoflegends.com
- 공식 한글 클라이언트
- 데이터 기준: 2026년 4월 (패치 14.8.1)

## 📝 주의사항

- **저장소**: DB에는 항상 **영문**으로 저장
- **표시**: UI에는 **한글**로 표시
- **역매핑**: 한글→영문 변환은 O(n) 복잡도 (자주 사용 시 캐싱 권장)
- **레거시**: 제거된 아이템/룬은 별도 관리 필요

## 🚧 향후 계획

- [x] 소환사 주문 매핑 추가 (18종, `getSummonerSpellKoreanName`)
- [ ] 스킨 이름 매핑 추가 (프로젝트에서 미사용 — 필요 시 추가)
- [ ] 능력(Q, W, E, R) 이름 매핑 추가 (약 900개 — 필요 시 추가)
- [x] 자동 업데이트 스크립트 (`scripts/update-mappings.ts`, `pnpm mappings:update`)

## 📞 문의 및 버그 리포팅

매핑 데이터에 오류가 있거나 누락된 항목이 있다면:
1. `LOL_MAPPINGS_GUIDE.md`에서 "데이터 추가/수정" 섹션 참고
2. PR을 통해 수정사항 제출

## 📄 라이선스

Riot Games Dragon API의 데이터를 기반으로 합니다.
자세한 내용은 Riot Games 개발자 정책을 참고하세요.

---

**마지막 업데이트**: 2026년 4월 14일  
**패치 버전**: League of Legends 14.8.1  
**챔피언 수**: 169명
