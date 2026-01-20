# Project Nexus API Reference

## 목차
1. [인증 (Authentication)](#인증-authentication)
2. [방 관리 (Room Management)](#방-관리-room-management)
3. [경매 (Auction)](#경매-auction)
4. [사다리타기 (Snake Draft)](#사다리타기-snake-draft)
5. [매치/토너먼트 (Match/Tournament)](#매치토너먼트-matchtournament)
6. [클랜 (Clan)](#클랜-clan)
7. [커뮤니티 (Community)](#커뮤니티-community)
8. [평판/신고 (Reputation/Report)](#평판신고-reputationreport)
9. [친구 (Friend)](#친구-friend)

---

## 인증 (Authentication)

### 기본 인증
- `POST /auth/signup` - 이메일 회원가입
- `POST /auth/login` - 이메일 로그인
- `POST /auth/refresh` - 토큰 갱신
- `POST /auth/logout` - 로그아웃

### OAuth 인증
- `GET /auth/google` - Google OAuth 시작
- `GET /auth/google/callback` - Google OAuth 콜백
- `GET /auth/discord` - Discord OAuth 시작
- `GET /auth/discord/callback` - Discord OAuth 콜백

### Riot 계정 연동
- `POST /riot/verify` - Riot 계정 인증
- `GET /riot/accounts/me` - 내 Riot 계정 목록
- `PUT /riot/accounts/:id/primary` - 주 계정 설정
- `POST /riot/sync` - 티어 정보 동기화

---

## 방 관리 (Room Management)

### 방 CRUD
- `POST /rooms` - 방 생성
- `GET /rooms` - 방 목록 조회 (필터: status, teamMode, includePrivate)
- `GET /rooms/:id` - 방 상세 조회
- `PUT /rooms/:id` - 방 설정 수정 (호스트만)

### 방 참가
- `POST /rooms/:id/join` - 방 참가
- `POST /rooms/:id/leave` - 방 나가기
- `DELETE /rooms/:id/participants/:participantId` - 참가자 추방 (호스트만)
- `POST /rooms/:id/ready` - 준비 상태 토글

### 채팅
- `GET /rooms/:id/messages` - 채팅 메시지 조회
- `POST /rooms/:id/messages` - 채팅 메시지 전송

### WebSocket Events (`/room` namespace)
- `join-room` - 방 입장
- `leave-room` - 방 퇴장
- `send-message` - 메시지 전송
- `toggle-ready` - 준비 상태 변경
- **Broadcasts:**
  - `user-joined` - 유저 입장
  - `user-left` - 유저 퇴장
  - `ready-status-changed` - 준비 상태 변경
  - `new-message` - 새 메시지

---

## 경매 (Auction)

### 경매 관리
- `POST /auctions` - 경매 생성
- `GET /auctions/:id` - 경매 조회
- `POST /auctions/:id/join` - 경매 참가
- `POST /auctions/:id/start` - 경매 시작 (호스트만)

### WebSocket Events (`/auction` namespace)
- `join-room` - 경매방 입장
- `leave-room` - 경매방 퇴장
- `place-bid` - 입찰
- `resolve-bid` - 입찰 확정
- **Broadcasts:**
  - `bid-placed` - 입찰 발생
  - `bid-resolved` - 입찰 확정
  - `auction-complete` - 경매 완료
  - `timer-expired` - 타이머 만료

**입찰 규칙:**
- 티어별 골드: Iron 3000 ~ Diamond+ 2000
- 100골드 단위 입찰
- 5초 소프트 타이머 (입찰 시 리셋)
- 유찰 시 다음 사이클로 이동
- 팀장 골드 소진 시 500골드 보너스

---

## 사다리타기 (Snake Draft)

### 드래프트 관리
- `POST /rooms/:id/snake-draft/start` - 드래프트 시작 (호스트만)
- `POST /rooms/:id/snake-draft/pick` - 플레이어 선택
- `GET /rooms/:id/snake-draft/state` - 드래프트 상태 조회
- `POST /rooms/:id/snake-draft/auto-pick` - 자동 선택
- `POST /rooms/:id/snake-draft/complete` - 드래프트 완료

### WebSocket Events (`/snake-draft` namespace)
- `join-draft-room` - 드래프트방 입장
- `leave-draft-room` - 드래프트방 퇴장
- `make-pick` - 플레이어 선택
- `get-draft-state` - 상태 조회
- **Broadcasts:**
  - `pick-made` - 선택 완료
  - `next-pick` - 다음 턴
  - `draft-complete` - 드래프트 완료
  - `auto-pick-made` - 자동 선택
  - `timer-expired` - 타이머 만료

**드래프트 규칙:**
- 팀장 랜덤 또는 티어 기반 선택
- 스네이크 순서: A, B, C → C, B, A → A, B, C...
- 30초 픽 타이머
- 타이머 만료 시 자동 픽

---

## 매치/토너먼트 (Match/Tournament)

### 브래킷 생성
- `POST /matches/bracket/:roomId` - 브래킷 생성 (호스트만)
- `GET /matches/bracket/:roomId` - 방의 모든 매치 조회

### 매치 관리
- `GET /matches/:id` - 매치 상세 조회
- `POST /matches/:id/tournament-code` - Tournament Code 생성 (호스트만)
- `POST /matches/:id/start` - 매치 시작 (호스트만)
- `POST /matches/:id/result` - 결과 보고 (호스트만)

### WebSocket Events (`/match` namespace)
- `join-match` - 매치 입장
- `leave-match` - 매치 퇴장
- `join-bracket` - 브래킷 입장
- `leave-bracket` - 브래킷 퇴장
- **Broadcasts:**
  - `match-started` - 매치 시작
  - `match-result` - 매치 결과
  - `bracket-generated` - 브래킷 생성
  - `bracket-updated` - 브래킷 업데이트
  - `bracket-complete` - 브래킷 완료
  - `tournament-code-generated` - Tournament Code 생성

**브래킷 타입:**
- 10인 (2팀): SINGLE - 단판
- 15인 (3팀): ROUND_ROBIN - 리그전
- 20인 (4팀): SINGLE_ELIMINATION - 토너먼트

---

## 클랜 (Clan)

### 클랜 CRUD
- `POST /clans` - 클랜 생성
- `GET /clans` - 클랜 목록 조회 (필터: search, isRecruiting, minTier)
- `GET /clans/my-clan` - 내 클랜 조회
- `GET /clans/:id` - 클랜 상세 조회
- `PUT /clans/:id` - 클랜 정보 수정 (오너/임원만)
- `DELETE /clans/:id` - 클랜 삭제 (오너만)

### 멤버 관리
- `POST /clans/:id/join` - 클랜 가입
- `POST /clans/:id/leave` - 클랜 탈퇴
- `DELETE /clans/:id/members/:memberId` - 멤버 추방 (오너/임원만)
- `PUT /clans/:id/members/:memberId/role` - 역할 변경 (오너만)
- `POST /clans/:id/transfer-ownership` - 오너 이전

### 클랜 채팅
- `GET /clans/:id/messages` - 메시지 조회
- `POST /clans/:id/messages` - 메시지 전송

### WebSocket Events (`/clan` namespace)
- `join-clan-chat` - 클랜 채팅 입장
- `leave-clan-chat` - 클랜 채팅 퇴장
- `send-clan-message` - 메시지 전송
- **Broadcasts:**
  - `new-clan-message` - 새 메시지
  - `member-joined` - 멤버 가입
  - `member-left` - 멤버 탈퇴
  - `member-kicked` - 멤버 추방
  - `member-promoted` - 역할 변경
  - `ownership-transferred` - 오너 이전
  - `clan-updated` - 클랜 정보 업데이트
  - `clan-deleted` - 클랜 삭제

**클랜 규칙:**
- 태그: 2-5자 영숫자
- 태그 중복 불가
- 1인당 1개 클랜만 가입 가능
- 역할: OWNER, OFFICER, MEMBER

---

## 커뮤니티 (Community)

### 게시글 관리
- `POST /community/posts` - 게시글 작성
- `GET /community/posts` - 게시글 목록 (필터: category, search, authorId, limit, offset)
- `GET /community/posts/:id` - 게시글 상세 조회
- `PUT /community/posts/:id` - 게시글 수정 (작성자만)
- `DELETE /community/posts/:id` - 게시글 삭제 (작성자만)

### 댓글 관리
- `POST /community/posts/:id/comments` - 댓글 작성
- `PUT /community/comments/:id` - 댓글 수정 (작성자만)
- `DELETE /community/comments/:id` - 댓글 삭제 (작성자만)

### 추천 시스템
- `POST /community/posts/:id/like` - 게시글 추천
- `DELETE /community/posts/:id/like` - 게시글 추천 취소
- `GET /community/posts/:id/liked` - 추천 여부 확인

### 고정/통계
- `POST /community/posts/:id/pin` - 게시글 고정 (관리자)
- `DELETE /community/posts/:id/pin` - 고정 해제 (관리자)
- `GET /community/users/:userId/stats` - 유저 통계

**카테고리:**
- NOTICE - 공지사항
- FREE - 자유게시판
- TIP - 팁/공략
- QNA - 질문/답변

---

## 평판/신고 (Reputation/Report)

### 평가 시스템
- `POST /reputation/ratings` - 플레이어 평가
- `GET /reputation/users/:userId/ratings` - 유저 평가 내역
- `GET /reputation/users/:userId/stats` - 유저 평판 통계

### 신고 시스템
- `POST /reputation/reports` - 유저 신고
- `GET /reputation/reports/:id` - 신고 상세 조회
- `GET /reputation/users/:userId/reports` - 유저 신고 내역
- `GET /reputation/reports` - 미처리 신고 목록
- `PUT /reputation/reports/:id/status` - 신고 상태 업데이트

### 밴 관리
- `POST /reputation/users/:userId/ban` - 유저 밴 (관리자)
- `POST /reputation/users/:userId/unban` - 유저 밴 해제 (관리자)
- `GET /reputation/stats` - 신고 통계

**평가 항목:**
- skillRating (1-5) - 실력
- attitudeRating (1-5) - 태도
- communicationRating (1-5) - 의사소통

**신고 사유:**
- TOXICITY - 욕설/비매너
- AFK - 잠수
- GRIEFING - 트롤
- CHEATING - 치팅
- OTHER - 기타

**자동 밴:**
- 24시간 내 5개 이상 신고 시 자동 밴

---

## 친구 (Friend)

### 친구 요청
- `POST /friends/requests/:userId` - 친구 요청 전송
- `POST /friends/requests/:friendshipId/accept` - 친구 요청 수락
- `POST /friends/requests/:friendshipId/reject` - 친구 요청 거절
- `DELETE /friends/requests/:friendshipId` - 친구 요청 취소

### 친구 관리
- `GET /friends` - 친구 목록
- `GET /friends/requests/pending` - 받은 친구 요청
- `GET /friends/requests/sent` - 보낸 친구 요청
- `DELETE /friends/:friendId` - 친구 삭제

### 차단 관리
- `POST /friends/block/:userId` - 유저 차단
- `DELETE /friends/block/:userId` - 차단 해제
- `GET /friends/blocked` - 차단 목록

### 상태 확인
- `GET /friends/status/:userId` - 친구 관계 상태 확인
- `GET /friends/stats` - 친구 통계

**친구 상태:**
- PENDING - 대기 중
- ACCEPTED - 수락됨
- BLOCKED - 차단됨

---

## 공통 응답 형식

### 성공 응답
```json
{
  "data": { ... },
  "message": "Success"
}
```

### 에러 응답
```json
{
  "statusCode": 400,
  "message": "Error message",
  "error": "Bad Request"
}
```

### 인증
모든 인증이 필요한 엔드포인트는 Authorization 헤더에 JWT 토큰이 필요합니다:
```
Authorization: Bearer <token>
```

### Rate Limiting
- 기본: 100 요청/분
- 로그인: 10 요청/분
- 회원가입: 5 요청/시간

---

## WebSocket 연결

모든 WebSocket namespace는 인증이 필요합니다:

```javascript
const socket = io('http://localhost:3001/room', {
  auth: {
    token: 'your-jwt-token'
  }
});
```

**사용 가능한 Namespaces:**
- `/room` - 방 관리 및 채팅
- `/auction` - 경매
- `/snake-draft` - 사다리타기
- `/match` - 매치/토너먼트
- `/clan` - 클랜 채팅
