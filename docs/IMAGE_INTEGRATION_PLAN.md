# 이미지 통합 계획서

## 📋 작업 내용 요약

### ✅ 완료된 작업
1. **넥서스 로고 컴포넌트 생성** (`components/Logo.tsx`)
   - 아이콘만, 텍스트만, 전체 버전 지원
   - 다양한 크기 옵션 (sm, md, lg, xl)
   - 그라데이션 텍스트 스타일 적용

2. **Riot Data Dragon 서비스 구현** (`api/src/modules/riot/data-dragon.service.ts`)
   - 챔피언 이미지 (아이콘, 스플래시, 로딩)
   - 아이템 이미지
   - 스펠 이미지
   - 프로필 아이콘
   - Redis 캐싱 지원

3. **프론트엔드 이미지 컴포넌트**
   - `ChampionImage.tsx`: 챔피언 이미지 표시
   - `ItemImage.tsx`: 아이템 이미지 표시

4. **레이아웃에 로고 적용**
   - 헤더 네비게이션에 로고 추가
   - 홈페이지 히어로 섹션에 로고 추가

---

## 🎨 넥서스 로고 적용

### 로고 파일 위치
```
nexus/apps/web/public/images/nexus-logo.png
```

### 로고 디자인 특징 (이미지 설명 기반)
- **형태**: 파편화된 "N" 글자
- **배경**: 블루-퍼플 그라데이션 (원형)
- **아웃라인**: 마젠타/네온 핑크
- **효과**: 3D 입체감

### 사용 방법
```tsx
import { Logo } from "@/components/Logo";

// 기본 사용
<Logo />

// 크기 조절
<Logo size="xl" />

// 아이콘만
<Logo variant="icon-only" />

// 텍스트만
<Logo variant="text-only" />
```

### 다음 단계
1. **로고 이미지 파일 추가 필요**
   - `nexus/apps/web/public/images/nexus-logo.png` 파일을 생성
   - 제공받은 로고 이미지를 해당 위치에 저장

2. **로고 스타일 조정** (필요시)
   - 이미지가 추가되면 크기나 스타일 조정 가능

---

## 🎮 Riot Data Dragon 통합

### ✅ 확인된 사항

**챔피언 초상화 및 아이템 이미지 사용 가능**

Riot Games는 **Data Dragon**이라는 공식 CDN을 통해 다음 이미지들을 무료로 제공합니다:

| 이미지 타입 | URL 패턴 | 사용 가능 여부 |
|-----------|---------|--------------|
| 챔피언 아이콘 (정사각형) | `/cdn/{version}/img/champion/{championKey}.png` | ✅ 가능 |
| 챔피언 스플래시 아트 | `/cdn/img/champion/splash/{championKey}_{skinNum}.jpg` | ✅ 가능 |
| 챔피언 로딩 화면 | `/cdn/img/champion/loading/{championKey}_{skinNum}.jpg` | ✅ 가능 |
| 아이템 아이콘 | `/cdn/{version}/img/item/{itemId}.png` | ✅ 가능 |
| 스펠 아이콘 | `/cdn/{version}/img/spell/{spellKey}.png` | ✅ 가능 |
| 프로필 아이콘 | `/cdn/{version}/img/profileicon/{iconId}.png` | ✅ 가능 |

### 특징
- ✅ **API 키 불필요**: Data Dragon은 공개 CDN
- ✅ **Rate Limit 없음**: 자유롭게 사용 가능
- ✅ **정기 업데이트**: 게임 패치와 함께 자동 업데이트
- ✅ **다국어 지원**: 한국어 메타데이터 포함

### 라이선스
- Riot Games의 "Legal Jibber Jabber" 정책에 따라 사용 가능
- 상업적 용도도 허용 (단, Riot와 제휴가 아님을 명시 필요)
- 이미지 출처 표기 권장

---

## 🛠 구현 계획

### Phase 1: 로고 적용 (1일) ✅

- [x] Logo 컴포넌트 생성
- [x] 레이아웃에 로고 추가
- [ ] 로고 이미지 파일 추가 (`public/images/nexus-logo.png`)
- [ ] 로고 스타일 최종 조정

### Phase 2: Data Dragon 통합 (2일)

#### 백엔드 (NestJS)
- [x] `DataDragonService` 생성
- [ ] Riot 모듈에 서비스 등록 ✅
- [ ] API 엔드포인트 추가
  - `GET /riot/ddragon/version` - 최신 버전 조회
  - `GET /riot/ddragon/champions` - 챔피언 목록
  - `GET /riot/ddragon/items` - 아이템 목록
  - `GET /riot/ddragon/champion/:key/image` - 챔피언 이미지 URL
  - `GET /riot/ddragon/item/:id/image` - 아이템 이미지 URL

#### 프론트엔드 (Next.js)
- [x] `ChampionImage` 컴포넌트 생성
- [x] `ItemImage` 컴포넌트 생성
- [ ] 이미지 로딩 에러 처리
- [ ] 로딩 상태 표시
- [ ] 이미지 최적화 (Next.js Image 컴포넌트 활용)

### Phase 3: 이미지 캐싱 전략 (1일)

#### Redis 캐싱
- [x] 버전 정보 캐싱 (1시간 TTL)
- [x] 챔피언/아이템 메타데이터 캐싱 (1시간 TTL)
- [ ] 이미지 URL 캐싱 (24시간 TTL)

#### 프론트엔드 캐싱
- [ ] React Query를 통한 이미지 URL 캐싱
- [ ] 브라우저 이미지 캐시 활용

### Phase 4: UI 적용 (2일)

#### 옥션 페이지
- [ ] 플레이어 카드에 챔피언 아이콘 표시
- [ ] 팀 구성 보드에 챔피언 이미지 표시

#### 프로필 페이지
- [ ] 주 챔피언 통계에 챔피언 이미지 표시
- [ ] 최근 게임에 챔피언/아이템 이미지 표시

#### 매치 상세 페이지
- [ ] 팀 구성에 챔피언 스플래시 아트 배경
- [ ] 빌드에 아이템 이미지 표시

### Phase 5: 최적화 및 테스트 (1일)

- [ ] 이미지 로딩 성능 테스트
- [ ] 캐시 효율성 확인
- [ ] 에러 핸들링 강화
- [ ] 라이선스 고지 문구 추가

---

## 📝 API 엔드포인트 설계

### Data Dragon 관련 엔드포인트

```typescript
// GET /riot/ddragon/version
// 최신 Data Dragon 버전 조회
Response: { version: "14.1.1" }

// GET /riot/ddragon/champions?locale=ko_KR
// 챔피언 목록 조회 (캐시됨)
Response: {
  version: "14.1.1",
  data: {
    "Aatrox": { id: "Aatrox", key: "266", name: "아트록스", ... },
    ...
  }
}

// GET /riot/ddragon/items?locale=ko_KR
// 아이템 목록 조회 (캐시됨)
Response: {
  version: "14.1.1",
  data: {
    "1001": { name: "장화", ... },
    ...
  }
}

// GET /riot/ddragon/champion/:key/image?type=square|splash|loading
// 챔피언 이미지 URL 생성
Response: {
  url: "https://ddragon.leagueoflegends.com/cdn/14.1.1/img/champion/Aatrox.png"
}

// GET /riot/ddragon/item/:id/image
// 아이템 이미지 URL 생성
Response: {
  url: "https://ddragon.leagueoflegends.com/cdn/14.1.1/img/item/1001.png"
}
```

---

## 🔧 환경 변수

### 프론트엔드 (`.env.local`)
```env
NEXT_PUBLIC_DDRAGON_VERSION=14.1.1
# 또는 API에서 동적으로 가져오기
```

### 백엔드 (`.env`)
```env
# Data Dragon은 API 키 불필요
# 버전은 자동으로 최신 버전을 가져오거나
# 환경변수로 고정 가능
DDRAGON_VERSION=14.1.1  # 선택사항
```

---

## 📚 참고 자료

- [Riot Data Dragon 공식 문서](https://ddragon.leagueoflegends.com/)
- [Riot API 정책](https://developer.riotgames.com/policies/general)
- [Data Dragon 버전 목록](https://ddragon.leagueoflegends.com/api/versions.json)
- [챔피언 데이터 예시](https://ddragon.leagueoflegends.com/cdn/14.1.1/data/ko_KR/champion.json)

---

## ⚠️ 주의사항

### 라이선스 준수
1. **출처 표기**: Riot Games 이미지 사용 시 출처 명시 권장
2. **제휴 표기**: "이 제품은 Riot Games와 제휴한 것이 아닙니다" 문구 추가
3. **상업적 사용**: 허용되지만 Riot의 브랜드 가이드라인 준수 필요

### 기술적 주의사항
1. **버전 관리**: 게임 패치마다 버전이 업데이트되므로 동적 버전 관리 필요
2. **이미지 크기**: 스플래시 아트는 고해상도이므로 적절한 크기 조정 필요
3. **CDN 안정성**: Data Dragon은 안정적이지만 폴백 전략 고려

---

## 🎯 다음 단계

1. **로고 이미지 파일 추가**
   - 제공받은 로고 이미지를 `public/images/nexus-logo.png`에 저장

2. **Data Dragon API 엔드포인트 구현**
   - `RiotController`에 Data Dragon 관련 엔드포인트 추가

3. **프론트엔드 훅 생성**
   - `hooks/useChampionImage.ts`
   - `hooks/useItemImage.ts`

4. **옥션 페이지에 이미지 적용**
   - 플레이어 카드에 챔피언 아이콘 표시
   - 팀 구성 보드에 챔피언 이미지 표시
