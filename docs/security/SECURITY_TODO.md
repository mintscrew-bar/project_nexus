# 보안 설계 TODO

> 마지막 업데이트: 2026-04-02
> Phase 1 전체 + Phase 2 전체 + Phase 3 완료.

## 완료된 항목

- [x] Phase 1-1: 시크릿 로깅 제거
  - `apps/api/src/main.ts`에서 시크릿 콘솔 출력 전부 제거
  - `.env` 로딩 결과는 `NODE_ENV !== 'production'` 조건으로만 출력
  - 프로덕션 로거를 `["error", "warn"]`으로 제한
  - `discord.strategy.ts`에서 clientID/profile/user console.log 전부 제거
  - NestJS Logger 사용으로 전환 (에러만 로깅)

- [x] Phase 1-2: Rate Limiting 실제 적용
  - `app.module.ts`에 `APP_GUARD`로 `ThrottlerGuard` 글로벌 등록
  - `auth.controller.ts` 엔드포인트별 제한: login 5/min, register 3/min, refresh 10/min
  - `health.controller.ts`에 `@SkipThrottle()` 적용

- [x] Phase 1-3: 글로벌 예외 필터
  - `apps/api/src/common/filters/global-exception.filter.ts` 신규 생성
  - `main.ts`에서 `app.useGlobalFilters(new GlobalExceptionFilter())` 등록
  - 프로덕션에서는 stack trace 숨김, 알 수 없는 예외는 일반 메시지 반환

- [x] Phase 1-4: OAuth 콜백 에러 메시지 일반화
  - Discord 로그인 콜백: `error=auth_failed` 일반 메시지로 통일
  - Discord 계정 연동 콜백: `error=link_failed` 일반 메시지로 통일
  - console.error → NestJS Logger 전환
  - Strategy 파일 내 profile/user JSON 로깅 제거

- [x] Phase 2-1: DTO 클래스 전환
  - 각 모듈의 `dto/` 폴더에 class-validator 데코레이터 기반 클래스 파일 생성
  - 컨트롤러 import를 서비스 → dto 폴더로 전환
  - 대상: auth(RegisterDto, LoginDto), community(CreatePostDto, UpdatePostDto, CreateCommentDto, CreatePostReportDto), room(CreateRoomDto, JoinRoomDto), clan(CreateClanDto, UpdateClanDto), reputation(SubmitRatingDto, SubmitReportDto), riot(RegisterRiotAccountDto), user(UpdateSettingsDto, UpdateProfileDto)
  - ValidationPipe의 whitelist/forbidNonWhitelisted가 정상 동작

---

- [x] Phase 2-2: 수동 검증 코드 제거 (중간)
  - `community.service.ts` — createPost, updatePost, createComment, updateComment의 수동 if-else 검증 제거
  - `UpdatePostDto`에 `@IsNotEmpty` 추가 (빈 문자열 방지)
  - `UpdateCommentDto` 신규 생성 + 컨트롤러 updateComment에 DTO 적용
  - `containsBannedWord()` 금칙어 검사는 서비스 레이어에서 유지

---

- [x] Phase 3-1: Security Headers 강화
  - API: Helmet CSP 설정 완료 (script/style/img 소스 제한)
  - Web: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy 추가

- [x] Phase 3-2: 로그인 실패 계정 잠금
  - Redis 기반 IP+이메일 실패 횟수 추적 구현
  - 5회 실패 → IP 15분 잠금, 10회 → 계정 30분 잠금

- [x] Phase 3-3: 사용자 입력 새니타이징
  - `sanitize.ts` 유틸 생성 (sanitizeHtml + stripAllHtml)
  - 게시글/댓글/방/클랜 DTO에 @Transform 적용

- [x] Phase 3-4: WebSocket 메시지 크기 제한
  - 9개 Gateway에 maxHttpBufferSize: 10KB 추가

---

## CSRF에 대하여 (구현 불필요)

현재 구조상 이미 방어됨:
- API 인증은 `Authorization: Bearer` 헤더 (CSRF 공격으로 자동 전송 불가)
- Refresh token 쿠키는 `sameSite: lax`, `path: /api/auth` 제한
- 별도 CSRF 토큰 미들웨어 불필요

## 참고: 이미 잘 되어 있는 항목

- JWT + Refresh Token 인증 (httpOnly 쿠키)
- bcrypt 비밀번호 해싱 (salt rounds 12)
- Discord OAuth 통합
- Role 기반 접근 제어 (Guards)
- Helmet 기본 보안 헤더
- CORS 설정
- 파일 업로드 타입/크기 제한 (5MB, 이미지만)
- 전 WebSocket Gateway JWT 인증
- Prisma ORM (SQL Injection 방지)
- ValidationPipe 설정 (whitelist + forbidNonWhitelisted) + class DTO 전환 완료
