# 보안 설계 TODO

> 마지막 업데이트: 2026-03-05
> Phase 1 전체 + Phase 2-1 완료. Phase 2-2, Phase 3 미완료.

## 완료된 항목

- [x] Phase 1-1: 시크릿 로깅 제거
  - `apps/api/src/main.ts`에서 시크릿 콘솔 출력 전부 제거
  - `.env` 로딩 결과는 `NODE_ENV !== 'production'` 조건으로만 출력
  - 프로덕션 로거를 `["error", "warn"]`으로 제한
  - `google.strategy.ts`, `discord.strategy.ts`에서 clientID/profile/user console.log 전부 제거
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
  - Google/Discord 로그인 콜백: `error=auth_failed` 일반 메시지로 통일
  - Discord/Google 계정 연동 콜백: `error=link_failed` 일반 메시지로 통일
  - console.error → NestJS Logger 전환
  - Strategy 파일 내 profile/user JSON 로깅 제거

- [x] Phase 2-1: DTO 클래스 전환
  - 각 모듈의 `dto/` 폴더에 class-validator 데코레이터 기반 클래스 파일 생성
  - 컨트롤러 import를 서비스 → dto 폴더로 전환
  - 대상: auth(RegisterDto, LoginDto), community(CreatePostDto, UpdatePostDto, CreateCommentDto, CreatePostReportDto), room(CreateRoomDto, JoinRoomDto), clan(CreateClanDto, UpdateClanDto), reputation(SubmitRatingDto, SubmitReportDto), riot(RegisterRiotAccountDto), user(UpdateSettingsDto, UpdateProfileDto)
  - ValidationPipe의 whitelist/forbidNonWhitelisted가 정상 동작

---

## 미완료 항목

- [ ] Phase 2-2: 수동 검증 코드 제거 (중간)

**파일:** `apps/api/src/modules/community/community.service.ts`

Lines 108-130 등에서 수동 if-else 검증이 있음. DTO 데코레이터로 대체 후 삭제.
단, `containsBannedWord()` 금칙어 검사는 class-validator 커스텀 데코레이터 또는 서비스 레이어에서 유지 필요.

---

- [ ] Phase 3-1: Security Headers 강화 (중간)

**API (`apps/api/src/main.ts`):**
```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://ddragon.leagueoflegends.com", "https://cdn.discordapp.com", "https://raw.communitydragon.org"],
    },
  },
}));
```

**Next.js (`apps/web/next.config.mjs`):**
```javascript
async headers() {
  return [{
    source: '/(.*)',
    headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ],
  }];
}
```

- [ ] Phase 3-2: 로그인 실패 계정 잠금 (중간)

**파일:** `apps/api/src/modules/auth/auth.service.ts`

Redis 기반으로 IP+이메일 조합의 실패 횟수 추적:
- 5회 연속 실패 → 해당 IP에서 해당 계정 15분 잠금
- 10회 연속 실패 → 계정 자체 30분 잠금
- 성공 시 카운터 리셋
- 키 패턴: `login_fail:{email}:{ip}` (TTL 15분)

- [ ] Phase 3-3: 사용자 입력 새니타이징 (중간)

**신규 파일:** `apps/api/src/common/utils/sanitize.ts`

게시글/댓글/채팅 등 사용자 입력 텍스트에서 HTML 태그 제거:
- 커스텀 유틸리티 또는 `sanitize-html` 패키지 사용
- DTO의 `@Transform()` 데코레이터로 자동 적용

- [ ] Phase 3-4: WebSocket 메시지 크기 제한 (낮음)

**대상 파일 (9개 Gateway):**
- `apps/api/src/modules/presence/presence.gateway.ts`
- `apps/api/src/modules/match/match.gateway.ts`
- `apps/api/src/modules/notification/notification.gateway.ts`
- `apps/api/src/modules/role-selection/role-selection.gateway.ts`
- `apps/api/src/modules/room/room.gateway.ts`
- `apps/api/src/modules/dm/dm.gateway.ts`
- `apps/api/src/modules/room/snake-draft.gateway.ts`
- `apps/api/src/modules/auction/auction.gateway.ts`
- `apps/api/src/modules/clan/clan.gateway.ts`

각 `@WebSocketGateway()` 데코레이터에 추가:
```typescript
@WebSocketGateway({ maxHttpBufferSize: 1e4 }) // 10KB
```

---

## CSRF에 대하여 (구현 불필요)

현재 구조상 이미 방어됨:
- API 인증은 `Authorization: Bearer` 헤더 (CSRF 공격으로 자동 전송 불가)
- Refresh token 쿠키는 `sameSite: lax`, `path: /api/auth` 제한
- 별도 CSRF 토큰 미들웨어 불필요

## 참고: 이미 잘 되어 있는 항목

- JWT + Refresh Token 인증 (httpOnly 쿠키)
- bcrypt 비밀번호 해싱 (salt rounds 12)
- OAuth (Google, Discord) 통합
- Role 기반 접근 제어 (Guards)
- Helmet 기본 보안 헤더
- CORS 설정
- 파일 업로드 타입/크기 제한 (5MB, 이미지만)
- 전 WebSocket Gateway JWT 인증
- Prisma ORM (SQL Injection 방지)
- ValidationPipe 설정 (whitelist + forbidNonWhitelisted) + class DTO 전환 완료
