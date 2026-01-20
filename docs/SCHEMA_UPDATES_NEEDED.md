# Prisma Schema Updates Required

## 개요
구현된 서비스 코드와 현재 Prisma 스키마 사이의 불일치를 해결하기 위한 스키마 업데이트 목록입니다.

---

## 1. User 모델 업데이트

### 추가 필요 필드:
```prisma
model User {
  // 기존 필드...

  reputationScore Float?          // 평판 점수 (1-5)
  isBanned        Boolean         @default(false)
  banReason       String?
  bannedAt        DateTime?
  banUntil        DateTime?       // 임시 밴 만료 시간

  // 새로운 관계
  ratingsGiven    UserRating[]    @relation("RaterUser")
  ratingsReceived UserRating[]    @relation("RatedUser")
  reportsSubmitted UserReport[]   @relation("ReporterUser")
  reportsReceived  UserReport[]   @relation("ReportedUser")
  friendships     Friendship[]    @relation("UserFriendships")
  friendOf        Friendship[]    @relation("FriendOfUser")
  postLikes       PostLike[]
}
```

---

## 2. Clan 모델 업데이트

### 추가 필요 필드:
```prisma
model Clan {
  // 기존 필드...

  minTier   String?    // 최소 티어 요구사항
  discord   String?    // 디스코드 링크

  // 새로운 관계
  chatMessages ClanChatMessage[]
}

enum ClanRole {  // ClanMemberRole을 ClanRole로 변경 또는 둘 다 지원
  OWNER
  OFFICER
  MEMBER
}

model ClanChatMessage {
  id        String   @id @default(cuid())
  clanId    String
  userId    String
  content   String
  createdAt DateTime @default(now())

  clan Clan @relation(fields: [clanId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([clanId, createdAt])
  @@map("clan_chat_messages")
}
```

---

## 3. Community 모델 재구조화

현재 Board 기반 구조를 카테고리 기반으로 변경:

```prisma
model Post {
  id        String       @id @default(cuid())
  title     String
  content   String
  category  PostCategory
  authorId  String
  views     Int          @default(0)
  isPinned  Boolean      @default(false)
  isEdited  Boolean      @default(false)
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt

  author   User       @relation(fields: [authorId], references: [id], onDelete: Cascade)
  comments Comment[]
  likes    PostLike[]

  @@index([category, isPinned, createdAt])
  @@index([authorId])
  @@map("posts")
}

enum PostCategory {
  NOTICE
  FREE
  TIP
  QNA
}

model Comment {
  id        String    @id @default(cuid())
  postId    String
  authorId  String
  content   String
  parentId  String?   // 대댓글 지원
  isEdited  Boolean   @default(false)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  post    Post      @relation(fields: [postId], references: [id], onDelete: Cascade)
  author  User      @relation(fields: [authorId], references: [id], onDelete: Cascade)
  parent  Comment?  @relation("CommentReplies", fields: [parentId], references: [id], onDelete: Cascade)
  replies Comment[] @relation("CommentReplies")

  @@index([postId, createdAt])
  @@index([parentId])
  @@map("comments")
}

model PostLike {
  id        String   @id @default(cuid())
  postId    String
  userId    String
  createdAt DateTime @default(now())

  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, postId])
  @@index([postId])
  @@map("post_likes")
}
```

---

## 4. Reputation/Report 모델 추가

```prisma
model UserRating {
  id                   String   @id @default(cuid())
  reporterId           String
  targetUserId         String
  matchId              String
  skillRating          Int      // 1-5
  attitudeRating       Int      // 1-5
  communicationRating  Int      // 1-5
  comment              String?
  createdAt            DateTime @default(now())

  reporter User  @relation("RaterUser", fields: [reporterId], references: [id], onDelete: Cascade)
  target   User  @relation("RatedUser", fields: [targetUserId], references: [id], onDelete: Cascade)
  match    Match @relation(fields: [matchId], references: [id], onDelete: Cascade)

  @@unique([reporterId, targetUserId, matchId])
  @@index([targetUserId])
  @@map("user_ratings")
}

model UserReport {
  id           String       @id @default(cuid())
  reporterId   String
  targetUserId String
  matchId      String?
  reason       ReportReason
  description  String
  status       ReportStatus @default(PENDING)
  reviewerNote String?
  reviewedAt   DateTime?
  createdAt    DateTime     @default(now())

  reporter User   @relation("ReporterUser", fields: [reporterId], references: [id], onDelete: Cascade)
  target   User   @relation("ReportedUser", fields: [targetUserId], references: [id], onDelete: Cascade)
  match    Match? @relation(fields: [matchId], references: [id], onDelete: SetNull)

  @@index([targetUserId, status, createdAt])
  @@index([status])
  @@map("user_reports")
}

enum ReportReason {
  TOXICITY
  AFK
  GRIEFING
  CHEATING
  OTHER
}

enum ReportStatus {
  PENDING
  APPROVED
  REJECTED
}
```

---

## 5. Friend/Friendship 모델 추가

```prisma
model Friendship {
  id        String           @id @default(cuid())
  userId    String
  friendId  String
  status    FriendshipStatus @default(PENDING)
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt

  user   User @relation("UserFriendships", fields: [userId], references: [id], onDelete: Cascade)
  friend User @relation("FriendOfUser", fields: [friendId], references: [id], onDelete: Cascade)

  @@unique([userId, friendId])
  @@index([userId, status])
  @@index([friendId, status])
  @@map("friendships")
}

enum FriendshipStatus {
  PENDING
  ACCEPTED
  BLOCKED
}
```

---

## 6. Match 모델 업데이트

### 추가 필요 필드:
```prisma
model Match {
  // 기존 필드...

  round         Int?
  matchNumber   Int?
  bracketType   BracketType?
  startedAt     DateTime?

  // 새로운 관계
  ratings UserRating[]
  reports UserReport[]
}

enum BracketType {
  SINGLE
  ROUND_ROBIN
  SINGLE_ELIMINATION
}

enum MatchStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
}
```

---

## 7. Room 모델 업데이트

### 추가 필요 필드:
```prisma
enum RoomStatus {
  WAITING
  TEAM_SELECTION
  IN_PROGRESS
  COMPLETED
}

enum TeamMode {
  SNAKE_DRAFT
  AUCTION
}
```

---

## 8. SnakeDraftPick 모델 추가

```prisma
model SnakeDraftPick {
  id         String   @id @default(cuid())
  roomId     String
  teamId     String
  userId     String
  pickNumber Int
  createdAt  DateTime @default(now())

  room Room @relation(fields: [roomId], references: [id], onDelete: Cascade)
  team Team @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([roomId])
  @@index([teamId])
  @@map("snake_draft_picks")
}
```

---

## 마이그레이션 순서

1. **백업**: 현재 데이터베이스 백업
2. **스키마 업데이트**: 위의 변경사항을 schema.prisma에 적용
3. **마이그레이션 생성**: `npx prisma migrate dev --name add_new_features`
4. **클라이언트 생성**: `npx prisma generate`
5. **테스트**: 모든 서비스가 정상 작동하는지 확인

---

## 주의사항

### Board 모델 제거 시:
- 기존 Post 데이터가 있다면 카테고리로 마이그레이션 필요
- Board 관련 모든 참조 제거 필요

### 관계 변경 시:
- Cascade 삭제 정책 확인
- 인덱스 최적화 확인
- 외래 키 제약 조건 검증

### 기본값 설정:
- Boolean 필드는 기본값 설정 권장
- DateTime 필드는 @default(now()) 추가
- Enum은 @default() 설정 고려

---

## 추가 최적화

### 인덱스 추가 권장:
```prisma
@@index([createdAt])           // 시간순 정렬용
@@index([status, createdAt])   // 상태별 필터링용
@@index([userId, createdAt])   // 유저별 데이터 조회용
```

### 복합 유니크 제약:
```prisma
@@unique([userId, postId])     // 중복 방지
@@unique([reporterId, targetUserId, matchId])  // 중복 평가 방지
```
