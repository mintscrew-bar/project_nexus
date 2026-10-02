# 프로필 통합과 게임별 공유 섹션

프로필은 사람 기준 URL 하나로 통합한다. 클랜·스트리머·커뮤니티는 같은 페이지 구현을 사용하며 게임 범위를 URL, API 조건, 캐시 키에 명시한다.

- [x] Task 1: 메뉴의 롤·배그 프로필을 내 프로필(`/me`) 하나로 통합
- [x] Task 2: 공개 프로필(`/users/:id`)과 내 프로필이 같은 표시 컴포넌트를 사용
- [x] Task 3: 계정 등록·역할 수정·삭제를 `/settings/game-accounts/:game`에서 유지
- [x] Task 4: 기존 프로필 링크는 임시 리다이렉트로 수용하고 게임 탭은 `?game=`으로 지정
- [x] Task 5: 공통 헤더·모바일 메뉴·게임 전환에서 선택한 게임 문맥 유지
- [x] Task 6: 클랜 생성에서 게임 단일 선택, 기존 게임별 가입·전적 정책 유지
- [x] Task 7: 스트리머 채널 연결과 수정에서 게임 복수 선택, OAuth 왕복에서 선택 보존
- [x] Task 8: 스트리머 목록과 해당 스트리머의 방을 같은 게임으로 필터
- [x] Task 9: 게시판에 롤·배그·공통 범위 추가, 관리자에서 범위 지정
- [x] Task 10: 커뮤니티 글·검색·태그·캐시를 게임별로 구분, 작성·상세·편집에서 게임 유지
- [x] Task 11: 기존 데이터 보존 마이그레이션과 게임 범위 회귀 테스트
- [ ] Task 12: 배포 후 로그인 프로필·채널 설정·게임별 목록을 운영 환경에서 확인

## 주소

| 기능 | 정규 주소 |
| --- | --- |
| 내 프로필 | `/me?game=lol` 또는 `/me?game=pubg` |
| 공개 프로필 | `/users/:id?game=lol` 또는 `?game=pubg` |
| 게임 계정 관리 | `/settings/game-accounts/lol`, `/settings/game-accounts/pubg` |
| 클랜·스트리머·커뮤니티 | `/clans`, `/streamers`, `/community` + `?game=lol\|pubg` |

프로필 기존 영구 리다이렉트가 브라우저에 캐시되어 있어도 `/lol/profile`에서 `/me`로 종료된다. 정규 주소에서 기존 주소로 돌아가지 않는다.

## 데이터 적용

`20261002_add_streamer_games`는 기존 스트리머를 LOL로 유지하며 선택한 게임 배열을 추가한다.
`20261002_add_board_game_scope`는 기존 게시판·글·slug를 보존한다. `notice`는 공통, 기존 나머지 게시판은 LOL로 분류하고 PUBG용 자유·팁·질문 게시판을 별도로 추가한다. 게임별 분류가 다른 기존 게시판은 관리 화면에서 수정할 수 있다.

배포 시 위 마이그레이션을 API·웹 새 버전보다 먼저 적용해야 한다. 운영 DB에 `db:push`만 실행하면 데이터 분류와 PUBG 기본 게시판 생성 SQL이 생략되므로 이 두 마이그레이션 SQL도 반드시 적용한다.

## 검증

- API·웹 프로덕션 빌드
- API 관련 테스트: `pnpm --filter @nexus/api test -- --runInBand game-scope streamer community user.service`
- DB 마이그레이션: `node scripts/test-profile-scope-migrations.mjs` — PostgreSQL 임시 테이블만 수정하고 롤백
- 개발 서버: `pnpm dev:status` 확인 후 기존 3010 한 포트만 사용, 검증 뒤 `pnpm dev:stop`

게임 문맥 제공자는 게임 전환에 따라 앱 셸을 재마운트하지 않는다. 소켓 연결·이벤트·방 상태 코드는 이번 작업 범위에 포함하지 않는다. 로그인 상태, 계정 등록, OAuth 실제 승인 등 운영 연동 검증은 배포 후 별도 확인한다.
