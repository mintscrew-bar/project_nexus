# 보안 설계 TODO

> 마지막 업데이트: 2026-02-20
> 보안 감사 후 3단계 구현 플랜에서 Phase 1-1, 1-3만 완료됨. 나머지 항목 진행 필요.

## 완료된 항목

### Phase 1-1: 시크릿 로깅 제거 ✅
- `apps/api/src/main.ts`에서 시크릿 콘솔 출력 전부 제거
- `.env` 로딩 결과는 `NODE_ENV !== 'production'` 조건으로만 출력
- 프로덕션 로거를 `["error", "warn"]`으로 제한

### Phase 1-3: 글로벌 예외 필터 ✅
- `apps/api/src/common/filters/global-exception.filter.ts` 신규 생성
- `main.ts`에서 `app.useGlobalFilters(new GlobalExceptionFilter())` 등록
- 프로덕션에서는 stack trace 숨김, 알 수 없는 예외는 일반 메시지 반환

---

## 미완료 항목

### Phase 1-2: Rate Limiting 실제 적용 ⚠️ (높음)

현재 `ThrottlerModule`이 `app.module.ts`에 설정되어 있지만 `ThrottlerGuard`가 적용되지 않아 사실상 무효.

**필요 작업:**
1. `app.module.ts`에 `APP_GUARD`로 `ThrottlerGuard` 글로벌 등록:
   ```typescript
   providers: [
     { provide: APP_GUARD, useClass: ThrottlerGuard },
   ],
   ```
2. `auth.controller.ts`에 엄격한 엔드포인트별 제한:
   - `POST /auth/login` — `@Throttle({ default: { limit: 5, ttl: 60000 } })`
   - `POST /auth/register` — `@Throttle({ default: { limit: 3, ttl: 60000 } })`
   - `POST /auth/refresh` — `@Throttle({ default: { limit: 10, ttl: 60000 } })`
3. `health.controller.ts`에 `@SkipThrottle()` 적용

### Phase 1-4: OAuth 콜백 에러 메시지 일반화 ⚠️ (높음)

**파일:** `apps/api/src/modules/auth/auth.controller.ts`

현재 Google/Discord 콜백 catch에서:
```typescript
res.redirect(`${appUrl}/auth/login?error=${encodeURIComponent(String(error))}`);
```
내부 에러 메시지가 URL 파라미터로 사용자에게 노출됨.

**수정:**
```typescript
res.redirect(`${appUrl}/auth/login?error=auth_failed`);
```

추가로 `console.log("Google callback - user:", JSON.stringify(user, null, 2))` 같은 유저 정보 로깅도 프로덕션에서는 제거해야 함.

---

### Phase 2-1: DTO 클래스 전환 ⚠️ (높음)

현재 모든 DTO가 `interface`로 정의되어 있어 `ValidationPipe`의 `whitelist`/`forbidNonWhitelisted`가 작동하지 않음.

**대상 모듈 및 DTO:**

| 모듈 | DTO | 검증 필요 항목 |
|------|-----|---------------|
| auth | `RegisterDto` | `@IsEmail`, `@MinLength(8)`, `@MaxLength(20)` username |
| auth | `LoginDto` | `@IsEmail`, `@IsString` password |
| community | `CreatePostDto` | `@IsString`, `@MaxLength(200)` title, `@MaxLength(10000)` content |
| community | `UpdatePostDto` | `@IsOptional`, `@MaxLength(200)` title |
| community | `CreateCommentDto` | `@IsString`, `@MaxLength(2000)` content |
| room | `CreateRoomDto` | `@IsString` name, `@IsIn` mode, `@Min/@Max` playerCount |
| room | `JoinRoomDto` | `@IsString` roomId, `@IsOptional` password |
| clan | `CreateClanDto` | `@IsString`, `@MaxLength(50)` name |
| clan | `UpdateClanDto` | `@IsOptional` 필드들 |
| reputation | `SubmitRatingDto` | `@Min(1)`, `@Max(5)` score |
| reputation | `SubmitReportDto` | `@IsString`, `@MaxLength(1000)` reason |
| riot | `RegisterRiotAccountDto` | `@IsString` gameName, `@IsString` tagLine |
| user | `UpdateSettingsDto` | `@IsOptional`, `@IsBoolean` 각 설정 필드 |

**작업 방식:**
- 각 모듈의 `dto/` 폴더에 클래스 파일 생성
- 기존 서비스 파일의 interface를 class로 전환
- `class-validator`, `class-transformer` 데코레이터 추가

### Phase 2-2: 수동 검증 코드 제거 (중간)

**파일:** `apps/api/src/modules/community/community.service.ts`

Lines 41-55 등에서 수동 if-else 검증이 있음. DTO 데코레이터로 대체 후 삭제.

---

### Phase 3-1: Security Headers 강화 (중간)

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

**Next.js (`apps/web/next.config.js`):**
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

### Phase 3-2: 로그인 실패 계정 잠금 (중간)

**파일:** `apps/api/src/modules/auth/auth.service.ts`

Redis 기반으로 IP+이메일 조합의 실패 횟수 추적:
- 5회 연속 실패 → 해당 IP에서 해당 계정 15분 잠금
- 10회 연속 실패 → 계정 자체 30분 잠금
- 성공 시 카운터 리셋
- 키 패턴: `login_fail:{email}:{ip}` (TTL 15분)

### Phase 3-3: 사용자 입력 새니타이징 (중간)

**신규 파일:** `apps/api/src/common/utils/sanitize.ts`

게시글/댓글/채팅 등 사용자 입력 텍스트에서 HTML 태그 제거:
- 커스텀 유틸리티 또는 `sanitize-html` 패키지 사용
- DTO의 `@Transform()` 데코레이터로 자동 적용

### Phase 3-4: WebSocket 메시지 크기 제한 (낮음)

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
- ValidationPipe 설정 (whitelist + forbidNonWhitelisted)
