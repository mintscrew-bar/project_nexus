# Riot Tournament API 설정 가이드

## Provider ID와 Tournament ID 생성 방법

### 1단계: Riot Developer Portal 접속

1. **Riot Developer Portal 접속**
   - https://developer.riotgames.com/ 접속
   - 로그인 (Riot 계정 필요)

2. **API 문서 페이지로 이동**
   - 상단 메뉴에서 "APIs" 클릭
   - 또는 직접 접속: https://developer.riotgames.com/apis#tournament-stub-v5

### 2단계: Provider 생성

1. **Provider 생성 API 찾기**
   - 페이지에서 `POST /lol/tournament-stub/v5/providers` 찾기
   - 또는 검색창에 "tournament-stub providers" 검색

2. **API 키 설정**
   - 페이지 상단의 "API Key" 입력란에 발급받은 API 키 입력
   - 또는 "Authorize" 버튼 클릭하여 키 설정

3. **Request Body 작성**
   ```json
   {
     "region": "KR",
     "url": "http://localhost:4000/api/webhooks/riot/tournament"
   }
   ```
   - `region`: 리전 코드 (KR, NA, EUW 등)
   - `url`: Webhook URL (토너먼트 이벤트를 받을 URL)

4. **Execute Request 클릭**
   - "Execute Request" 또는 "Try it out" 버튼 클릭
   - 응답에서 `id` 값 확인 (예: `12345`)

5. **Provider ID 저장**
   - 응답 예시:
     ```json
     {
       "id": 12345
     }
     ```
   - 이 `id` 값을 복사해두세요

### 3단계: Tournament 생성

1. **Tournament 생성 API 찾기**
   - `POST /lol/tournament-stub/v5/tournaments` 찾기

2. **Request Body 작성**
   ```json
   {
     "name": "Nexus In-House Tournament",
     "providerId": 12345
   }
   ```
   - `name`: 토너먼트 이름 (원하는 이름으로 변경 가능)
   - `providerId`: 위에서 받은 Provider ID

3. **Execute Request 클릭**
   - 응답에서 `id` 값 확인 (예: `67890`)

4. **Tournament ID 저장**
   - 응답 예시:
     ```json
     {
       "id": 67890
     }
     ```
   - 이 `id` 값을 복사해두세요

### 4단계: 환경변수 설정

생성된 ID를 `nexus/apps/api/@.env` 파일에 추가:

```env
# Riot Games API
RIOT_API_KEY=RGAPI-여기에-실제-API-키

# Riot Tournament API
RIOT_TOURNAMENT_PROVIDER_ID=12345
RIOT_TOURNAMENT_ID=67890
```

## 스크린샷 가이드

### Provider 생성 화면
```
[API 문서 페이지]
┌─────────────────────────────────────┐
│ POST /lol/tournament-stub/v5/       │
│        providers                    │
├─────────────────────────────────────┤
│ API Key: [RGAPI-xxxxx] [Authorize]  │
│                                     │
│ Request Body:                       │
│ {                                   │
│   "region": "KR",                   │
│   "url": "http://localhost:4000..." │
│ }                                   │
│                                     │
│ [Execute Request]                   │
└─────────────────────────────────────┘
```

### 응답 예시
```json
{
  "id": 12345
}
```

## 대안: API 엔드포인트로 생성

Riot API 문서 대신 우리 API를 통해 생성할 수도 있습니다:

### 1. Provider 생성
```bash
POST http://localhost:4000/api/riot/tournament/provider/create
Headers:
  Authorization: Bearer <your-access-token>
```

### 2. Tournament 생성
```bash
POST http://localhost:4000/api/riot/tournament/create
Headers:
  Authorization: Bearer <your-access-token>
Body:
{
  "providerId": "12345"
}
```

## 문제 해결

### 에러: "Required parameter cannot be null"
- Request Body가 제대로 전송되었는지 확인
- Content-Type 헤더가 `application/json`인지 확인
- JSON 형식이 올바른지 확인

### 에러: "Invalid API Key"
- API 키가 올바른지 확인
- API 키가 만료되지 않았는지 확인 (개발 키는 24시간마다 갱신 필요)

### Provider 생성은 되는데 Tournament 생성이 안 될 때
- Provider ID가 올바른지 확인
- Provider ID가 숫자로 전달되는지 확인

## 참고 링크

- Riot API 문서: https://developer.riotgames.com/apis#tournament-stub-v5
- Tournament-Stub-V5 엔드포인트:
  - Providers: https://developer.riotgames.com/apis#tournament-stub-v5/POST_lol-tournament-stub-v5-providers
  - Tournaments: https://developer.riotgames.com/apis#tournament-stub-v5/POST_lol-tournament-stub-v5-tournaments
  - Codes: https://developer.riotgames.com/apis#tournament-stub-v5/POST_lol-tournament-stub-v5-codes
