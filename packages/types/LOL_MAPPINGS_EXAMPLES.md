# LoL Mappings 사용 예시 및 통합 가이드

이 문서는 실제 프로젝트에서 LoL 매핑 데이터를 어떻게 활용할 수 있는지 보여줍니다.

## 1. 백엔드 (NestJS API) 통합

### 1.1 경매 시스템에서 챔피언 표시

```typescript
// apps/api/src/modules/auction/dto/auction-response.dto.ts
import { getChampionKoreanName } from '@nexus/types';

export class AuctionParticipantResponseDto {
  id: string;
  userId: string;
  username: string;
  selectedChampion: string; // 영문 이름 (DB)
  selectedChampionKorean: string; // 한글 이름 (응답)
  preferredRole: string;
  soldPrice: number;

  constructor(data: AuctionParticipant) {
    this.id = data.id;
    this.userId = data.userId;
    this.username = data.user.username;
    this.selectedChampion = data.selectedChampion;
    // DB에서 읽은 영문 이름을 한글로 변환
    this.selectedChampionKorean = getChampionKoreanName(data.selectedChampion);
    this.preferredRole = data.preferredRole;
    this.soldPrice = data.soldPrice;
  }
}
```

### 1.2 통계 API에서 다국어 지원

```typescript
// apps/api/src/modules/stats/stats.service.ts
import {
  getChampionKoreanName,
  getItemKoreanName,
  getRuneKoreanName,
} from '@nexus/types';

@Injectable()
export class StatsService {
  /**
   * 사용자의 챔피언 통계를 조회하고 한글로 반환
   */
  async getUserChampionStats(userId: string) {
    const stats = await this.db.userChampionStats.findMany({
      where: { userId },
    });

    return stats.map(stat => ({
      championEnglish: stat.championName,
      championKorean: getChampionKoreanName(stat.championName),
      gamesPlayed: stat.gamesPlayed,
      wins: stat.wins,
      winRate: (stat.wins / stat.gamesPlayed * 100).toFixed(1),
    }));
  }

  /**
   * 아이템 빌드 추천 반환 (한글 포함)
   */
  async getRecommendedBuilds(championEnglish: string) {
    const builds = await this.dataDragon.getChampionBuildData(championEnglish);

    return {
      championEnglish,
      championKorean: getChampionKoreanName(championEnglish),
      builds: builds.map(build => ({
        itemsEnglish: build.itemIds,
        itemsKorean: build.itemIds.map(itemId =>
          getItemKoreanName(this.itemIdToName[itemId])
        ),
        winRate: build.winRate,
      })),
    };
  }

  /**
   * 인기 룬 조합 조회
   */
  async getPopularRunes(championEnglish: string) {
    const runes = await this.db.championRunes.findMany({
      where: { championName: championEnglish },
      orderBy: { pickRate: 'desc' },
      take: 5,
    });

    return {
      championEnglish,
      championKorean: getChampionKoreanName(championEnglish),
      runeSetups: runes.map(setup => ({
        primaryRuneEnglish: setup.primaryRune,
        primaryRuneKorean: getRuneKoreanName(setup.primaryRune),
        secondaryRuneEnglish: setup.secondaryRune,
        secondaryRuneKorean: getRuneKoreanName(setup.secondaryRune),
        pickRate: setup.pickRate,
      })),
    };
  }
}
```

### 1.3 검색 기능 구현

```typescript
// apps/api/src/modules/search/search.service.ts
import {
  CHAMPION_MAPPINGS,
  getChampionEnglishName,
  getAllChampionNames,
} from '@nexus/types';

@Injectable()
export class SearchService {
  /**
   * 사용자 입력(한글)으로 챔피언 검색
   */
  searchChampion(query: string): string[] {
    const lowerQuery = query.toLowerCase();

    // 한글 이름 검색
    const matchedKorean = Object.entries(CHAMPION_MAPPINGS)
      .filter(([_, korean]) => korean.includes(query))
      .map(([english]) => english);

    // 영문 이름 검색
    const matchedEnglish = getAllChampionNames()
      .filter(name => name.toLowerCase().includes(lowerQuery));

    return [...new Set([...matchedKorean, ...matchedEnglish])];
  }

  /**
   * 한글 검색어를 영문으로 변환하여 DB 조회
   */
  async findChampionMatches(userInput: string) {
    // 사용자가 "아리"라고 입력한 경우
    const englishName = getChampionEnglishName(userInput);
    if (!englishName) {
      return []; // 매핑이 없으면 반환 안 함
    }

    // DB에서 영문 이름으로 조회
    return this.db.championData.findUnique({
      where: { name: englishName },
    });
  }
}
```

## 2. 프론트엔드 (Next.js) 통합

### 2.1 Zustand 스토어에서 사용

```typescript
// apps/web/src/stores/auction-store.ts
import { create } from 'zustand';
import {
  getChampionKoreanName,
  getAllChampionNames,
  CHAMPION_MAPPINGS,
} from '@nexus/types';

interface AuctionStore {
  selectedChampion: string; // 영문
  selectedChampionDisplay: string; // 한글
  availableChampions: string[]; // 영문 목록
  selectChampion: (championEnglish: string) => void;
}

export const useAuctionStore = create<AuctionStore>((set) => ({
  selectedChampion: '',
  selectedChampionDisplay: '',
  availableChampions: getAllChampionNames(),

  selectChampion: (championEnglish: string) => {
    set({
      selectedChampion: championEnglish,
      selectedChampionDisplay: getChampionKoreanName(championEnglish),
    });
  },
}));
```

### 2.2 React 컴포넌트에서 사용

```typescript
// apps/web/src/components/ChampionSelector.tsx
'use client';

import {
  getChampionKoreanName,
  CHAMPION_MAPPINGS,
  getAllChampionNames,
} from '@nexus/types';
import { useState } from 'react';

export function ChampionSelector() {
  const [selected, setSelected] = useState<string>('');
  const champions = getAllChampionNames();

  return (
    <div>
      <label>챔피언 선택:</label>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        <option value="">-- 선택 --</option>
        {champions.map((champ) => (
          <option key={champ} value={champ}>
            {getChampionKoreanName(champ)}
          </option>
        ))}
      </select>
      {selected && (
        <p>선택됨: {getChampionKoreanName(selected)}</p>
      )}
    </div>
  );
}
```

### 2.3 검색 필터 UI

```typescript
// apps/web/src/components/ChampionSearch.tsx
'use client';

import { CHAMPION_MAPPINGS, getChampionEnglishName } from '@nexus/types';
import { useState, useMemo } from 'react';

export function ChampionSearch() {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredChampions = useMemo(() => {
    if (!searchQuery) return [];

    // 영문과 한글 모두 검색
    return Object.entries(CHAMPION_MAPPINGS)
      .filter(
        ([english, korean]) =>
          english.toLowerCase().includes(searchQuery.toLowerCase()) ||
          korean.includes(searchQuery)
      )
      .map(([english, korean]) => ({ english, korean }));
  }, [searchQuery]);

  return (
    <div>
      <input
        type="text"
        placeholder="챔피언명 검색 (영문/한글)"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      <ul>
        {filteredChampions.map(({ english, korean }) => (
          <li key={english}>
            {korean} ({english})
          </li>
        ))}
      </ul>
    </div>
  );
}
```

## 3. 실시간 (Socket.IO) 통합

### 3.1 경매 게이트웨이

```typescript
// apps/api/src/modules/auction/auction.gateway.ts
import { getChampionKoreanName } from '@nexus/types';

@WebSocketGateway({ namespace: '/auction' })
export class AuctionGateway {
  @SubscribeMessage('champion_selected')
  async handleChampionSelected(
    @MessageBody() data: { participantId: string; championEnglish: string },
    @ConnectedSocket() client: Socket,
  ) {
    // 브로드캐스트할 때 한글 이름 포함
    this.server.to(data.auctionId).emit('champion_selected', {
      participantId: data.participantId,
      championEnglish: data.championEnglish,
      championKorean: getChampionKoreanName(data.championEnglish), // 클라이언트용
    });
  }
}
```

### 3.2 소켓 클라이언트

```typescript
// apps/web/src/lib/socket-client.ts
import { getChampionKoreanName } from '@nexus/types';

export function connectAuctionSocket() {
  const socket = io('/auction', {
    auth: { token: getAuthToken() },
  });

  socket.on('champion_selected', (data) => {
    // data.championEnglish와 data.championKorean 모두 사용 가능
    console.log(`${data.championKorean} 선택됨`);
    // UI 업데이트
  });

  return socket;
}
```

## 4. API 응답 포맷

### 4.1 다국어 응답 예시

```json
{
  "success": true,
  "data": {
    "champion": {
      "english": "Ahri",
      "korean": "아리",
      "lane": "mid",
      "stats": {
        "pickRate": 12.5,
        "winRate": 51.2,
        "banRate": 8.3
      }
    },
    "build": {
      "items": [
        {
          "english": "Luden's Tempest",
          "korean": "루덴의 폭풍",
          "cost": 3500
        },
        {
          "english": "Rabadon's Deathcap",
          "korean": "라바돈의 죽음모자",
          "cost": 3500
        }
      ]
    },
    "runes": [
      {
        "english": "Electrocute",
        "korean": "감전"
      },
      {
        "english": "Sudden Impact",
        "korean": "갑작스러운 영향"
      }
    ]
  }
}
```

## 5. 데이터베이스 설계 원칙

### 5.1 Prisma 스키마 예시

```prisma
// packages/database/prisma/schema.prisma

// 항상 영문 이름으로 저장
model ChampionSelections {
  id        String   @id @default(cuid())
  userId    String
  championName String // "Ahri" (영문)
  selectedAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
  @@map("champion_selections")
}

model ItemBuilds {
  id     String   @id @default(cuid())
  userId String
  items  String[] // ["B.F. Sword", "Needlessly Large Rod"] (영문 배열)

  user User @relation(fields: [userId], references: [id])

  @@map("item_builds")
}
```

### 5.2 저장 및 조회 로직

```typescript
// DB에는 항상 영문으로 저장
async saveChampionSelection(userId: string, championEnglish: string) {
  return this.db.championSelections.create({
    data: {
      userId,
      championName: championEnglish, // "Ahri"
    },
  });
}

// 조회 시 한글로 변환
async getChampionSelection(userId: string) {
  const selection = await this.db.championSelections.findUnique({
    where: { userId },
  });

  return {
    english: selection.championName,
    korean: getChampionKoreanName(selection.championName),
  };
}
```

## 6. 마이그레이션 가이드 (기존 한글 데이터 → 영문 기준)

### 6.1 DB 마이그레이션 (Python 스크립트 예시)

```python
import json
from typing import Dict, Tuple

# 매핑 데이터 로드
with open('lol-mappings.json') as f:
    mappings = json.load(f)

# 한글 → 영문 역매핑 생성
korean_to_english = {v: k for k, v in mappings['champions'].items()}

def migrate_champion_names(db_records: list) -> list:
    """기존 한글 챔피언 이름을 영문으로 변환"""
    for record in db_records:
        if 'championName' in record:
            korean_name = record['championName']
            english_name = korean_to_english.get(korean_name)
            if english_name:
                record['championName'] = english_name
    return db_records
```

## 7. 테스트 전략

### 7.1 검색 테스트

```typescript
describe('Champion Search with Mappings', () => {
  test('should find champions by korean name', () => {
    const query = '아리';
    const result = searchChampion(query);
    expect(result).toContain('Ahri');
  });

  test('should find champions by english name', () => {
    const query = 'ahri';
    const result = searchChampion(query);
    expect(result).toContain('Ahri');
  });
});
```

### 7.2 API 응답 테스트

```typescript
describe('Champion Stats API', () => {
  test('should return both english and korean names', async () => {
    const response = await request(app.getHttpServer())
      .get('/stats/user/123/champion-stats');

    expect(response.body.data[0]).toHaveProperty('championEnglish');
    expect(response.body.data[0]).toHaveProperty('championKorean');
  });
});
```

## 8. 성능 최적화

### 8.1 캐싱 전략

```typescript
// Redis에 역매핑 캐시 저장
async initializeMapping() {
  const koreanToEnglish = Object.entries(CHAMPION_MAPPINGS)
    .reduce((acc, [en, ko]) => ({ ...acc, [ko]: en }), {});

  await this.redis.set(
    'champion_korean_to_english',
    JSON.stringify(koreanToEnglish),
    'EX',
    86400 // 24시간
  );
}

// 빠른 조회
async getChampionByKoreanName(koreanName: string) {
  const cached = await this.redis.get('champion_korean_to_english');
  const mapping = JSON.parse(cached);
  return mapping[koreanName];
}
```

### 8.2 메모리 최적화

```typescript
// 자주 사용하는 역매핑은 시작 시 한 번만 생성
private readonly koreanToEnglish: Record<string, string>;

constructor() {
  this.koreanToEnglish = Object.entries(CHAMPION_MAPPINGS)
    .reduce((acc, [en, ko]) => ({ ...acc, [ko]: en }), {});
}

// O(1) 조회
getEnglishName(korean: string): string | undefined {
  return this.koreanToEnglish[korean];
}
```

## 마이그레이션 체크리스트

- [x] 데이터베이스 스키마 영문 기준으로 정규화 (championName: String 영문 저장)
- [x] API 응답에 한글 필드 추가 — stats.service.ts, match.service.ts에 `championNameKorean`, `summoner1Korean`, `summoner2Korean` 추가
- [x] 프론트엔드 입력 처리 (한글 ↔ 영문 변환) — matches, profile, users 등 7개 컴포넌트 적용
- [x] 검색 기능 한글/영문 모두 지원 — `searchChampionsByQuery`, `searchItemsByQuery` + 프로필 챔피언 필터
- [x] 통합 테스트 작성 — stats/match 서비스 한글 필드 검증 54개 테스트
- Socket.IO 이벤트에 한글 이름 포함 — 소켓 이벤트에서 텍스트 표시 없음, 해당 없음
- E2E 테스트 — 장기 과제
