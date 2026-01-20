# Tournament API 환경변수 설정 가이드

## 설정 방법

### 방법 1: 자동 생성 (첫 실행 시)

1. `@.env` 파일에 `RIOT_API_KEY`만 설정:
```env
RIOT_API_KEY=RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

2. 앱 실행 시 자동으로 Provider와 Tournament 생성
3. 콘솔에 생성된 ID가 출력됨:
```
⚠️  Please add these to your .env file:
RIOT_TOURNAMENT_PROVIDER_ID=12345
RIOT_TOURNAMENT_ID=67890
```

4. 출력된 ID를 `@.env` 파일에 추가

### 방법 2: 수동 설정 (이미 ID가 있는 경우)

`@.env` 파일에 다음을 추가:

```env
# Riot Games API
RIOT_API_KEY=RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Riot Tournament API (Tournament-Stub-V5)
RIOT_TOURNAMENT_PROVIDER_ID=12345
RIOT_TOURNAMENT_ID=67890
```

## 환경변수 설명

### RIOT_API_KEY (필수)
- Riot Developer Portal에서 발급받은 API 키
- 개발자용 키로 Tournament-Stub-V5 사용 가능

### RIOT_TOURNAMENT_PROVIDER_ID (선택)
- Provider ID가 있으면 설정
- 없으면 앱 시작 시 자동 생성

### RIOT_TOURNAMENT_ID (선택)
- Tournament ID가 있으면 설정
- 없으면 앱 시작 시 자동 생성

## 주의사항

1. **첫 실행 시**: `RIOT_API_KEY`만 설정하고 실행하면 자동 생성됨
2. **재시작 시**: 생성된 ID를 환경변수에 추가하면 재생성하지 않음
3. **Webhook URL**: 자동으로 `{API_URL}/api/webhooks/riot/tournament`로 설정됨

## 예시 파일 (@.env)

```env
# ============================================
# Riot Games API
# ============================================
RIOT_API_KEY=RGAPI-your-actual-api-key-here

# ============================================
# Riot Tournament API (Tournament-Stub-V5)
# ============================================
# 첫 실행 시 자동 생성되거나, 수동으로 생성 후 여기에 입력
RIOT_TOURNAMENT_PROVIDER_ID=
RIOT_TOURNAMENT_ID=
```

## 문제 해결

### Provider 생성 실패 시
- API 키가 유효한지 확인
- API 키에 Tournament 권한이 있는지 확인
- Webhook URL이 접근 가능한지 확인 (로컬 개발 시 ngrok 등 사용)

### Tournament 생성 실패 시
- Provider ID가 올바른지 확인
- Provider가 정상적으로 생성되었는지 확인
