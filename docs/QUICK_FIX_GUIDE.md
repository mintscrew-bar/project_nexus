# Quick Fix Guide - 즉시 해결 방법

## 현재 상태
백엔드 코드는 완성되었지만, Prisma 스키마가 아직 업데이트되지 않아 컴파일 오류가 발생합니다.

## ✅ 이미 수정된 사항

### 1. Enum Import 수정 완료
- ✅ `ClanRole` → `ClanMemberRole`로 변경
- ✅ `PostCategory`, `ReportReason`, `ReportStatus` 등을 임시 타입 파일로 분리
  - 파일 위치: `apps/api/src/modules/community/community.types.ts`
- ✅ `FriendshipStatus`, `BracketType`, `MatchStatus` 등 모두 임시 정의

### 2. TypeScript 타입 오류 수정 완료
- ✅ `main.ts` - origin 파라미터 타입 지정
- ✅ `auth.service.ts` - verifyAsync 제네릭 타입 추가
- ✅ `auction.controller.ts` - 사용하지 않는 메서드 제거 (실제 구현에 맞게 변경)

### 3. 스키마 누락 필드 주석 처리
- ✅ `clan.service.ts` - minTier, discord 필드 TODO로 표시

## ⚠️ 남은 스키마 관련 오류

다음 파일들은 스키마가 업데이트되기 전까지 컴파일 오류가 발생할 수 있습니다:

### Community Module
- `community.service.ts` - Post 모델 필드 불일치
  - ❌ `category` (없음, Board 기반)
  - ❌ `views` (viewCount로 존재)
  - ❌ `isEdited` (없음)
  - ❌ `likes` relation (PostVote로 존재)

### Clan Module
- `clan.service.ts` - Clan 모델 필드 불일치
  - ❌ `minTier` (없음)
  - ❌ `discord` (없음)
  - ❌ `ClanChatMessage` 모델 (없음, 추가 필요)

### Reputation Module
- `reputation.service.ts` - UserRating, UserReport 모델 없음
  - ❌ 전체 모델이 스키마에 없음

### Friend Module
- `friend.service.ts` - Friendship 모델 불일치
  - ❌ 현재는 Reputation/Report 모델과 혼용

### Match Module
- `match.service.ts` - Match 모델 필드 불일치
  - ❌ `round` (없음)
  - ❌ `matchNumber` (없음)
  - ❌ `bracketType` (없음)

## 🚀 즉시 빌드 가능하게 하는 방법

### 옵션 1: 스키마 즉시 업데이트 (권장)

`SCHEMA_UPDATES_NEEDED.md`의 변경사항을 적용:

```bash
cd packages/database

# 1. schema.prisma 백업
cp prisma/schema.prisma prisma/schema.prisma.backup

# 2. SCHEMA_UPDATES_NEEDED.md 내용대로 스키마 수정

# 3. 마이그레이션 생성
npx prisma migrate dev --name add_all_new_features

# 4. 클라이언트 재생성
npx prisma generate

# 5. 빌드 테스트
cd ../../apps/api
npm run build
```

### 옵션 2: 문제 모듈 임시 비활성화

`app.module.ts`에서 문제가 되는 모듈들을 주석 처리:

```typescript
@Module({
  imports: [
    // ... 기존 imports
    AuthModule,
    UserModule,
    RoomModule,
    AuctionModule,
    MatchModule,
    RiotModule,
    DiscordModule,
    // ClanModule,        // TODO: 스키마 업데이트 후 활성화
    // CommunityModule,   // TODO: 스키마 업데이트 후 활성화
    // ReputationModule,  // TODO: 스키마 업데이트 후 활성화
    // FriendModule,      // TODO: 스키마 업데이트 후 활성화
  ],
})
```

### 옵션 3: 타입 안정성 무시 (비권장)

`tsconfig.json`에서 strict 모드 일시 해제:

```json
{
  "compilerOptions": {
    "strict": false,  // 임시로 false
    "skipLibCheck": true
  }
}
```

## 📝 스키마 업데이트 체크리스트

스키마 업데이트 시 다음 순서로 진행:

1. [ ] User 모델 업데이트
   - [ ] reputationScore, isBanned, banReason 등 추가
   - [ ] 새로운 관계 추가 (ratings, reports, friendships)

2. [ ] Clan 모델 업데이트
   - [ ] minTier, discord 필드 추가
   - [ ] ClanChatMessage 모델 생성

3. [ ] Community 재구조화
   - [ ] Board 모델 제거 또는 유지
   - [ ] Post에 category enum 추가
   - [ ] Post에 views, isEdited 추가
   - [ ] PostLike 모델 추가 (PostVote 대체)
   - [ ] Comment에 isEdited 추가

4. [ ] Reputation/Report 모델 추가
   - [ ] UserRating 모델 생성
   - [ ] UserReport 모델 생성
   - [ ] Enum 추가 (ReportReason, ReportStatus)

5. [ ] Friendship 모델 추가
   - [ ] Friendship 모델 생성
   - [ ] FriendshipStatus enum 추가

6. [ ] Match 모델 업데이트
   - [ ] round, matchNumber, bracketType 추가
   - [ ] BracketType, MatchStatus enum 추가

7. [ ] SnakeDraftPick 모델 추가
   - [ ] 전체 모델 생성

## 🎯 최소 작업으로 빌드하기

가장 빠르게 빌드 가능하게 하려면:

```bash
# 1. 문제 모듈 주석 처리 (app.module.ts)
# 2. 기존 작동하는 모듈만으로 빌드
cd apps/api
npm run build

# 성공하면:
npm run start:dev
```

이렇게 하면 최소한 Auth, User, Room, Auction, Match, Riot, Discord 모듈은 작동합니다.

## 💡 개발 순서 권장

1. **즉시**: 문제 모듈 비활성화하고 기본 기능부터 테스트
2. **1일차**: 스키마 업데이트 및 마이그레이션
3. **2일차**: 모든 모듈 활성화 및 통합 테스트
4. **3일차**: 프론트엔드 연동 시작

## 🔧 유용한 명령어

```bash
# 컴파일 오류만 확인
npm run build 2>&1 | grep "error TS"

# Prisma 스키마 검증
npx prisma validate

# Prisma 클라이언트 타입 확인
npx prisma generate --watch

# 특정 모듈만 테스트
npm run test -- clan.service.spec.ts
```

## 📞 문제 해결

### Q: "Property does not exist on type 'PrismaService'"
**A**: 해당 모델이 스키마에 없습니다. `SCHEMA_UPDATES_NEEDED.md` 참조

### Q: "Module has no exported member 'XXX'"
**A**: Enum이 스키마에 없습니다. `community.types.ts`를 사용하세요

### Q: "Type is not assignable to type"
**A**: 스키마의 필드명과 코드의 필드명이 다릅니다. 주석 처리하거나 스키마 수정

---

**중요**: 이 가이드는 임시 해결책입니다. 프로덕션 배포 전에 반드시 `SCHEMA_UPDATES_NEEDED.md`의 모든 변경사항을 적용하세요!
