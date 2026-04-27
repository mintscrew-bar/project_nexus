# Project Nexus API Reference

> 기준일: 2026-04-27 (`apps/api/src/modules` 컨트롤러 직접 추출)
> WebSocket 이벤트 명세는 [WEBSOCKET_EVENTS.md](./WEBSOCKET_EVENTS.md) 참조

## 0. 공통 사항

### Base URL

- 모든 REST 라우트는 글로벌 prefix `/api` 가 붙는다 (`apps/api/src/main.ts` `setGlobalPrefix("api")`).
- 본 문서는 가독성을 위해 prefix를 생략하고 표기한다. 실제 호출 시 예: `POST /api/auth/login`.

### 인증

- 인증 필요 엔드포인트는 `Authorization: Bearer <accessToken>` 헤더를 요구한다.
- 토큰 만료 시 `POST /auth/refresh`로 갱신한다.
- 일부 라우트는 토큰 유무에 따라 응답 폭이 달라진다 (예: 게시글 좋아요 여부 포함 등).

### Rate Limiting

- 기본: 100 req/min (전역 ThrottlerGuard)
- 인증 계열은 별도 제한이 적용될 수 있다.

### 응답 형식

성공:

```json
{ "data": { ... }, "message": "Success" }
```

에러:

```json
{ "statusCode": 400, "message": "Error message", "error": "Bad Request" }
```

### 표기

- `(public)` 인증 불필요
- `(auth)` JWT 인증 필요
- `(admin)` `ADMIN` 또는 `MODERATOR` 권한 필요 (라우트별 가드 명시)

---

## 1. 인증 (`/auth`)

### 기본 인증

- `POST /auth/register` — 이메일 회원가입 (public)
- `POST /auth/login` — 이메일 로그인 (public)
- `POST /auth/refresh` — 토큰 갱신 (public)
- `POST /auth/logout` — 로그아웃 (auth)
- `GET /auth/me` — 현재 사용자 조회 (auth)

### Discord OAuth

- `GET /auth/discord` — Discord OAuth 시작 (public)
- `GET /auth/discord/callback` — Discord OAuth 콜백 (public)
- `POST /auth/exchange` — OAuth state 코드 교환 (public)
- `POST /auth/agree` — 신규 가입자 약관 동의 (public)

### 계정 연동

- `GET /auth/link/discord` — 기존 계정에 Discord 연동 시작 (auth)
- `GET /auth/link/discord/callback` — 연동 콜백 (public)

> Discord OAuth만 운영 대상이다.

---

## 2. 사용자 (`/users`)

- `GET /users/me` — 내 프로필 조회 (auth)
- `PATCH /users/me` — 내 프로필 수정 (auth)
- `DELETE /users/me` — 회원 탈퇴 (auth)
- `POST /users/me/avatar` — 아바타 업로드 (auth)
- `GET /users/stats` — 내 통계 요약 (auth)
- `GET /users/settings` — 내 설정 조회 (auth)
- `PATCH /users/settings` — 내 설정 수정 (auth)
- `POST /users/me/appeals` — 제재 이의신청 제출 (auth)
- `GET /users/me/appeals/latest` — 최근 이의신청 조회 (auth)
- `GET /users/:id` — 다른 사용자 프로필 조회 (auth)
- `GET /users/:id/stats` — 다른 사용자 통계 조회 (auth)

---

## 3. 방 관리 (`/rooms`)

### 방 CRUD

- `POST /rooms` — 방 생성 (auth)
- `GET /rooms` — 방 목록 (filter: status, teamMode, includePrivate) (public)
- `GET /rooms/:id` — 방 상세 (public)
- `PUT /rooms/:id` — 방 설정 수정 (호스트, auth)
- `DELETE /rooms/:id` — 방 종료 (호스트, auth)

### 참가/상태

- `POST /rooms/:id/join` — 방 참가 (auth)
- `POST /rooms/:id/leave` — 방 나가기 (auth)
- `POST /rooms/:id/toggle-spectator` — 관전 모드 토글 (auth)
- `POST /rooms/:id/ready` — 준비 상태 토글 (auth)
- `DELETE /rooms/:id/participants/:participantId` — 참가자 강퇴 (호스트, auth)
- `POST /rooms/:id/return-to-lobby` — 정상 종료 후 로비 복귀 (auth)
- `POST /rooms/:id/abort-to-lobby` — 진행 중단 후 로비 복귀 (auth)

### 채팅

- `GET /rooms/:id/messages` — 방 채팅 조회 (auth)
- `POST /rooms/:id/messages` — 방 채팅 전송 (auth)

### 사다리타기 (Snake Draft)

- `POST /rooms/:id/snake-draft/start` — 드래프트 시작 (호스트, auth)
- `POST /rooms/:id/snake-draft/pick` — 픽 (auth)
- `GET /rooms/:id/snake-draft/state` — 드래프트 상태 (public)
- `POST /rooms/:id/snake-draft/auto-pick` — 자동 픽 실행 (auth)
- `POST /rooms/:id/snake-draft/complete` — 드래프트 완료 (auth)

> 드래프트 규칙: 스네이크 순서, 30초 픽 타이머, 만료 시 자동 픽.

---

## 4. 경매 (`/auctions`)

- `POST /auctions/:roomId/start` — 경매 시작 (호스트, auth)
- `GET /auctions/:roomId/state` — 경매 상태 조회 (public)

> 입찰 등 실시간 동작은 모두 `/auction` WebSocket 네임스페이스로 처리한다. [WEBSOCKET_EVENTS.md](./WEBSOCKET_EVENTS.md) 참조.
>
> 입찰 규칙: 티어별 시작 골드 (Iron 3000 ~ Diamond+ 2000), 100골드 단위, 5초 소프트 타이머 (입찰 시 리셋), 유찰 시 다음 사이클 진입, 팀장 골드 소진 시 500골드 보너스 지급.

---

## 5. 역할 선택 (`/role-selection`)

- `GET /role-selection/:roomId` — 역할 선택 상태 조회 (auth)
- `POST /role-selection/:roomId/start` — 역할 선택 단계 시작 (auth)
- `POST /role-selection/:roomId/select-role` — 역할 선택 (auth)
- `POST /role-selection/:roomId/complete` — 역할 선택 완료 (auth)

---

## 6. 매치/토너먼트 (`/matches`)

- `GET /matches/my` — 내가 속한 매치 목록 (auth)
- `POST /matches/bracket/:roomId` — 브래킷 생성 (호스트, auth)
- `GET /matches/bracket/:roomId` — 방의 모든 매치 (public)
- `GET /matches/:id` — 매치 상세 (public)
- `GET /matches/:id/details` — 매치 상세 (확장) (public)
- `GET /matches/:id/participants` — 매치 참가자 (public)
- `GET /matches/:id/live-status` — 라이브 상태 (public)
- `POST /matches/:id/tournament-code` — Tournament Code 생성 (호스트, auth)
- `POST /matches/:id/start` — 매치 시작 (호스트, auth)
- `POST /matches/:id/result` — 결과 보고 (호스트, auth)
- `GET /matches/user/:userId/history` — 사용자 매치 이력 (public)

> 브래킷 타입: 10인 SINGLE / 15인 ROUND_ROBIN / 20인 SINGLE_ELIMINATION

---

## 7. 클랜 (`/clans`)

### 클랜 CRUD

- `POST /clans` — 클랜 생성 (auth)
- `GET /clans` — 클랜 목록 (filter: search, isRecruiting, minTier) (public)
- `GET /clans/my` — 내 클랜 (auth)
- `GET /clans/:id` — 클랜 상세 (public)
- `GET /clans/:id/stats` — 클랜 통계 (public)
- `PATCH /clans/:id` — 클랜 정보 수정 (오너/임원, auth)
- `DELETE /clans/:id` — 클랜 삭제 (오너, auth)

### 멤버

- `POST /clans/:id/join` — 클랜 가입 (auth)
- `POST /clans/:id/leave` — 클랜 탈퇴 (auth)
- `DELETE /clans/:id/members/:memberId` — 멤버 추방 (auth)
- `PATCH /clans/:id/members/:memberId/role` — 역할 변경 (auth)
- `POST /clans/:id/transfer-ownership` — 오너 이전 (auth)

### 초대 / 가입 신청

- `POST /clans/:id/invite-code` — 초대 코드 생성 (auth)
- `POST /clans/join-by-code` — 초대 코드로 가입 (auth)
- `POST /clans/:id/invite` — 사용자 직접 초대 (auth)
- `GET /clans/invitations/my` — 받은 초대 목록 (auth)
- `GET /clans/:id/invitations/sent` — 보낸 초대 목록 (auth)
- `POST /clans/invitations/:invitationId/resolve` — 초대 수락/거절 (auth)
- `DELETE /clans/:id/invitations/:invitationId` — 초대 취소 (auth)
- `POST /clans/:id/request-join` — 가입 신청 (auth)
- `GET /clans/:id/join-requests` — 가입 신청 목록 (auth)
- `POST /clans/:id/join-requests/:requestId/resolve` — 가입 신청 승인/거절 (auth)

### 채팅 / 공지 / 활동 로그

- `GET /clans/:id/messages` — 클랜 채팅 조회 (auth)
- `POST /clans/:id/messages` — 클랜 채팅 전송 (auth)
- `DELETE /clans/:id/messages/:messageId` — 클랜 채팅 삭제 (auth)
- `POST /clans/:id/announcements` — 클랜 공지 작성 (auth)
- `GET /clans/:id/announcements` — 클랜 공지 조회 (auth)
- `DELETE /clans/:id/announcements/:announcementId` — 클랜 공지 삭제 (auth)
- `PATCH /clans/:id/announcements/:announcementId/unpin` — 클랜 공지 고정 해제 (auth)
- `GET /clans/:id/activity-logs` — 클랜 활동 로그 (auth)

> 규칙: 태그 2-5자 영숫자, 1인 1클랜, 역할 OWNER/OFFICER/MEMBER

---

## 8. 커뮤니티 (`/community`)

### 게시글 / 댓글

- `POST /community/posts` — 게시글 작성 (auth)
- `GET /community/posts` — 게시글 목록 (filter: category, search, authorId, limit, offset) (public)
- `GET /community/posts/:id` — 게시글 상세 (public)
- `PATCH /community/posts/:id` — 게시글 수정 (작성자, auth)
- `DELETE /community/posts/:id` — 게시글 삭제 (작성자, auth)
- `POST /community/posts/:id/comments` — 댓글 작성 (auth)
- `PATCH /community/comments/:id` — 댓글 수정 (작성자, auth)
- `DELETE /community/comments/:id` — 댓글 삭제 (작성자, auth)

### 좋아요 / 북마크

- `POST /community/posts/:id/like` — 게시글 좋아요 (auth)
- `DELETE /community/posts/:id/like` — 게시글 좋아요 취소 (auth)
- `GET /community/posts/:id/liked` — 좋아요 여부 (auth)
- `POST /community/comments/:id/like` — 댓글 좋아요 (auth)
- `DELETE /community/comments/:id/like` — 댓글 좋아요 취소 (auth)
- `GET /community/comments/:id/liked` — 댓글 좋아요 여부 (auth)
- `POST /community/comments/liked-status` — 댓글 좋아요 상태 일괄 조회 (auth)
- `POST /community/posts/:id/bookmark` — 북마크 (auth)
- `DELETE /community/posts/:id/bookmark` — 북마크 해제 (auth)
- `GET /community/posts/:id/bookmarked` — 북마크 여부 (auth)
- `GET /community/bookmarks` — 내 북마크 목록 (auth)

### 운영자 액션

- `POST /community/posts/:id/pin` — 게시글 고정 (admin)
- `DELETE /community/posts/:id/pin` — 고정 해제 (admin)
- `POST /community/posts/:id/blind` — 게시글 블라인드 (admin)
- `DELETE /community/posts/:id/blind` — 블라인드 해제 (admin)
- `POST /community/comments/:id/blind` — 댓글 블라인드 (admin)
- `DELETE /community/comments/:id/blind` — 댓글 블라인드 해제 (admin)

### 기타

- `GET /community/tags/popular` — 인기 태그 (public)
- `GET /community/users/:userId/stats` — 사용자 게시글 통계 (public)
- `POST /community/reports` — 게시글/댓글 신고 (auth)
- `POST /community/images` — 본문 이미지 업로드 (auth)

> 카테고리: NOTICE / FREE / TIP / QNA

---

## 9. 친구 (`/friends`)

### 요청

- `POST /friends/requests/:userId` — 친구 요청 전송 (auth)
- `POST /friends/requests/:friendshipId/accept` — 수락 (auth)
- `POST /friends/requests/:friendshipId/reject` — 거절 (auth)
- `DELETE /friends/requests/:friendshipId` — 요청 취소 (auth)

### 목록 / 차단

- `GET /friends` — 친구 목록 (auth)
- `GET /friends/requests/pending` — 받은 요청 (auth)
- `GET /friends/requests/sent` — 보낸 요청 (auth)
- `DELETE /friends/:friendId` — 친구 삭제 (auth)
- `POST /friends/block/:userId` — 차단 (auth)
- `DELETE /friends/block/:userId` — 차단 해제 (auth)
- `GET /friends/blocked` — 차단 목록 (auth)

### 상태

- `GET /friends/status/:userId` — 친구 관계 상태 (auth)
- `GET /friends/stats` — 친구 통계 (auth)

> 친구 상태: PENDING / ACCEPTED / BLOCKED

---

## 10. DM (`/dm`)

- `GET /dm/conversations` — DM 대화 목록 (auth)
- `GET /dm/conversations/:userId` — 특정 사용자와의 대화 내용 (auth)
- `POST /dm/conversations/:userId/read` — 읽음 표시 (auth)
- `GET /dm/unread-count` — 안 읽은 DM 수 (auth)

> DM 송수신 자체는 `/dm` WebSocket 네임스페이스로 처리.

---

## 11. 알림 (`/notifications`)

- `GET /notifications` — 알림 목록 (auth)
- `GET /notifications/unread-count` — 안 읽은 알림 수 (auth)
- `POST /notifications/:id/read` — 읽음 표시 (auth)
- `POST /notifications/read-all` — 전체 읽음 (auth)
- `DELETE /notifications/:id` — 알림 삭제 (auth)
- `DELETE /notifications/read/all` — 읽은 알림 일괄 삭제 (auth)

---

## 12. 접속 상태 (`/presence`)

- `GET /presence/me` — 내 상태 (auth)
- `PUT /presence/me` — 내 상태 수정 (ONLINE/AWAY/DND/OFFLINE) (auth)
- `GET /presence/user/:userId` — 사용자 상태 (auth)
- `GET /presence/friends` — 친구 상태 목록 (auth)
- `GET /presence/online` — 현재 온라인 사용자 수 (auth)

---

## 13. 평판 / 신고 (`/reputation`)

### 평가

- `POST /reputation/ratings` — 플레이어 평가 (auth)
- `GET /reputation/users/:userId/ratings` — 사용자 평가 내역 (public)
- `GET /reputation/users/:userId/stats` — 사용자 평판 통계 (public)

### 신고

- `POST /reputation/reports` — 신고 제출 (auth)
- `GET /reputation/reports/:id` — 신고 상세 (auth)
- `GET /reputation/users/:userId/reports` — 사용자 신고 내역 (auth)
- `GET /reputation/reports` — 미처리 신고 목록 (admin)
- `PUT /reputation/reports/:id/status` — 신고 상태 업데이트 (admin)
- `GET /reputation/stats` — 신고 통계 (auth)

### 밴

- `POST /reputation/users/:userId/ban` — 사용자 밴 (admin)
- `POST /reputation/users/:userId/unban` — 밴 해제 (admin)

> 평가 항목: skillRating(1-5), attitudeRating(1-5), communicationRating(1-5)
> 신고 사유: TOXICITY / AFK / GRIEFING / CHEATING / OTHER
> 자동 밴: 24시간 내 5회 이상 신고 누적 시

---

## 14. 랭킹 (`/ranking`)

- `GET /ranking/global` — 전체 랭킹 (public)
- `GET /ranking/clan/:clanId` — 클랜 내부 랭킹 (public)
- `GET /ranking/user/:userId` — 사용자 순위 (public)
- `POST /ranking/recalculate` — 랭킹 재계산 트리거 (auth)

---

## 15. Riot 연동 (`/riot`)

### 계정 인증 / 등록

- `POST /riot/verify/start` — 인증 시작 (프로필 코드 발급) (auth)
- `GET /riot/verify/check` — 인증 상태 확인 (auth)
- `POST /riot/register` — 인증 완료 후 계정 등록 (auth)

### 내 Riot 계정

- `GET /riot/accounts` — 내 Riot 계정 목록 (auth)
- `PUT /riot/accounts/:id/primary` — 주 계정 설정 (auth)
- `PUT /riot/accounts/:id` — 계정 정보 수정 (auth)
- `PUT /riot/accounts/:id/champions/:role` — 포지션별 챔피언 선호 수정 (auth)
- `POST /riot/accounts/:id/sync` — 티어/매치 동기화 (auth)
- `DELETE /riot/accounts/:id` — 계정 연동 해제 (auth)

### Summoner / 라이브

- `GET /riot/summoner/:gameName/:tagLine` — Summoner 조회 (public)
- `GET /riot/summoner/:gameName/:tagLine/live` — 라이브 게임 조회 (public)

### Data Dragon (정적 자산)

- `GET /riot/ddragon/version` — 현재 버전 (public)
- `GET /riot/ddragon/champions` — 챔피언 카탈로그 (public)
- `GET /riot/ddragon/items` — 아이템 카탈로그 (public)
- `GET /riot/ddragon/champion/:key/image` — 챔피언 이미지 프록시 (public)
- `GET /riot/ddragon/item/:id/image` — 아이템 이미지 프록시 (public)
- `GET /riot/ddragon/spell/:key/image` — 스펠 이미지 프록시 (public)
- `GET /riot/ddragon/profile-icon/:id/image` — 프로필 아이콘 프록시 (public)

### 토너먼트 (Riot Tournament API)

- `POST /riot/tournament/provider/create` — Provider 생성 (admin)
- `POST /riot/tournament/create` — Tournament 생성 (admin)

---

## 16. 통계 (`/stats`)

### 공통

- `GET /stats/ddragon-version` — 현재 패치 버전 (public)
- `GET /stats/users/search` — 사용자명 검색 (public)
- `GET /stats/summoner` — Riot 계정 기준 검색 (public)

### 사용자 통계

- `GET /stats/user/:userId/auction-stats` — 경매 통계 (auth)
- `GET /stats/user/:userId/champion-stats` — 챔피언 통계 (auth)
- `GET /stats/user/:userId/position-stats` — 포지션 통계 (auth)
- `GET /stats/user/:userId/riot-accounts` — 연동된 Riot 계정 (auth)
- `GET /stats/user/:userId/riot-matches` — Riot 매치 이력 (public)

### 매치 / 챔피언

- `GET /stats/match/:matchId/timeline` — 매치 타임라인 (public)
- `GET /stats/champion-stats` — 전체 챔피언 통계 (public)
- `GET /stats/summoner/:gameName/:tagLine/matches` — Summoner 매치 이력 (public)
- `GET /stats/summoner/:gameName/:tagLine/ranked-champion-stats` — Summoner 랭크 챔피언 통계 (public)

### 페치/리프레시

- `GET /stats/fetch-status/:userId` — 페치 상태 (public)
- `POST /stats/refresh/:userId` — 통계 갱신 큐 등록 (auth)

---

## 17. Lab — 분석 대시보드 (`/stats/lab`)

> 모든 Lab 엔드포인트는 `JwtAuthGuard + RolesGuard(ADMIN)` — 운영자 전용.

### 메타

- `GET /stats/lab/overview` — 랩 개요 (admin)
- `GET /stats/lab/meta/radar` — 메타 레이더 (admin)
- `GET /stats/lab/meta/patch-impact` — 패치 임팩트 (admin)
- `GET /stats/lab/meta/ban-rates` — 밴률 통계 (admin)
- `GET /stats/lab/meta/ranked-snapshots` — 랭크 챔피언 스냅샷 (admin)
- `GET /stats/lab/meta/play-patterns` — 플레이 패턴 분석 (admin)

### 챔피언

- `GET /stats/lab/champions` — 챔피언 목록 (admin)
- `GET /stats/lab/champions/:championId` — 챔피언 상세 (admin)
- `GET /stats/lab/champions/:championId/mastery` — 챔피언 장인 통계 (admin)

### 시너지/카운터/조합

- `GET /stats/lab/synergy` — 시너지 조합 통계 (admin)
- `GET /stats/lab/counter` — 카운터 상성 (admin)
- `GET /stats/lab/compositions` — 팀 구성 분석 (admin)

### Oracle (예측/추천)

- `GET /stats/lab/oracle/auction-efficiency` — 경매 효율 (admin)
- `POST /stats/lab/oracle/balance-score` — 팀 밸런스 예측 (admin)
- `GET /stats/lab/oracle/ban-recommend` — 밴픽 추천 (admin)
- `GET /stats/lab/oracle/head-to-head` — 사용자 간 상성 (admin)

### 사용자 프로필

- `GET /stats/lab/user-profile/:userId/fallback` — 사용자 프로필 폴백 (admin)
- `GET /stats/lab/user-profile/:userId/compare` — 랭크 vs 내전 비교 (admin)

> 데이터 단계 / 스냅샷 갱신은 `/admin/lab/*` 엔드포인트로 트리거한다.

---

## 18. 관리자 (`/admin`)

> 전체 라우트 `JwtAuthGuard + RolesGuard`. 권한은 라우트별로 ADMIN 또는 ADMIN/MODERATOR.

### 통계 / 매치 운영

- `GET /admin/stats` — 관리 대시보드 통계 (admin/moderator)
- `GET /admin/matches/queue-stats` — 매칭 큐 통계 (admin)
- `POST /admin/matches/trigger-fetch` — 매칭 페치 수동 실행 (admin)
- `POST /admin/matches/recompute-stats` — 매치 통계 재계산 (admin)
- `POST /admin/matches/seed-high-tiers` — 고티어 시딩 (admin)

### 사용자 관리

- `GET /admin/users` — 사용자 목록 (admin)
- `PATCH /admin/users/:id/role` — 사용자 역할 변경 (admin)
- `POST /admin/users/:id/ban` — 사용자 밴 (admin)
- `POST /admin/users/:id/unban` — 밴 해제 (admin)
- `POST /admin/users/:id/restrict` — 일부 기능 제한 (admin)
- `POST /admin/users/:id/unrestrict` — 제한 해제 (admin)

### 신고 / 이의신청

- `GET /admin/reports` — 신고 목록 (admin/moderator)
- `PATCH /admin/reports/:id/review` — 신고 검토 (admin/moderator)
- `GET /admin/appeals` — 이의신청 목록 (admin/moderator)
- `PATCH /admin/appeals/:id/review` — 이의신청 검토 (admin/moderator)

### 공지 / 채팅 로그

- `POST /admin/announcements` — 공지 발송 (admin)
- `GET /admin/chat-logs` — 채팅 로그 조회 (admin/moderator)

### 게시글 / 댓글 / 클랜 / 방

- `GET /admin/posts` — 게시글 목록 (admin/moderator)
- `DELETE /admin/posts/:id` — 게시글 삭제 (admin/moderator)
- `PATCH /admin/posts/:id/pin` — 게시글 고정 (admin/moderator)
- `DELETE /admin/comments/:id` — 댓글 삭제 (admin/moderator)
- `GET /admin/clans` — 클랜 목록 (admin)
- `DELETE /admin/clans/:id` — 클랜 삭제 (admin)
- `GET /admin/rooms` — 방 목록 (admin)
- `POST /admin/rooms/:id/close` — 방 강제 종료 (admin)
- `POST /admin/rooms/:id/add-bot` — 방에 봇 추가 (admin)

### Lab 운영

- `GET /admin/lab/data-phase` — 랩 데이터 단계/스냅샷 신선도 (admin)
- `POST /admin/lab/recompute-snapshots` — 챔피언/시너지/카운터 스냅샷 재계산 (admin)
- `POST /admin/lab/recompute-ranked-snapshots` — 랭크 챔피언 스냅샷 재계산 (admin)

---

## 19. WebSocket

REST와 별도로 8개 namespace가 있다. 자세한 이벤트 명세는 [WEBSOCKET_EVENTS.md](./WEBSOCKET_EVENTS.md) 참조.

| Namespace | Gateway | 용도 |
|-----------|---------|------|
| `/room` | room.gateway.ts | 방 채팅, 입퇴장, 준비 |
| `/auction` | auction.gateway.ts | 실시간 입찰, 타이머 |
| `/snake-draft` | snake-draft.gateway.ts | 스네이크 드래프트 진행 |
| `/role-selection` | role-selection.gateway.ts | 역할 선택 |
| `/match` | match.gateway.ts | 매치 이벤트, 결과 |
| `/clan` | clan.gateway.ts | 클랜 채팅 |
| `/dm` | dm.gateway.ts | 1:1 메시지 |
| `/notification` | notification.gateway.ts | 실시간 알림 |
| `/presence` | presence.gateway.ts | 접속 상태 |

연결 방식 (모든 namespace 공통):

```javascript
const socket = io("https://api.example.com/room", {
  transports: ["websocket"],
  auth: { token: accessToken },
});
```

전송: `websocket` 전용 (polling fallback 없음). 인증: 콜백 기반 토큰 전달.
