# Riot API & Tournament Setup Guide

## 📋 개요

Project Nexus는 Riot Games API를 사용하여 다음 기능을 제공합니다:
- 소환사 계정 인증
- 티어/랭크 동기화
- Tournament Code 생성 (커스텀 게임)
- 매치 결과 자동 수집

---

## 🔑 API 키 발급

### Development Key (개발용)

1. [Riot Developer Portal](https://developer.riotgames.com) 접속
2. 로그인 (Riot 계정 필요)
3. Dashboard에서 "DEVELOPMENT API KEY" 섹션 확인
4. "Regenerate API Key" 클릭하여 새 키 발급
5. `.env` 파일에 추가:
   ```env
   RIOT_API_KEY="RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
   ```

**제한사항:**
- 유효기간: 24시간
- Rate Limit: 20 requests/second, 100 requests/2 minutes
- 개발 목적으로만 사용 가능

### Production Key (프로덕션용)

1. [Developer Portal](https://developer.riotgames.com) → "Register Product"
2. 애플리케이션 정보 입력:
   - 프로젝트 이름, 설명
   - 사용할 API 목록
   - 예상 트래픽
3. Riot Games 승인 대기 (수일 소요)
4. 승인 후 Production API Key 발급

**혜택:**
- 무제한 유효기간
- 높은 Rate Limit
- Tournament API 사용 가능 (별도 신청)

---

## 🏆 Tournament API 설정

Tournament Code를 생성하려면 **별도 승인**이 필요합니다.

### 신청 절차

1. Production API Key 먼저 발급 받기
2. [Tournament API Application](https://developer.riotgames.com/app-type) 제출
3. 다음 정보 제공:
   - 토너먼트 형식 및 규모
   - 예상 참가자 수
   - 게임 결과 사용 계획
4. Riot Games 검토 및 승인 (1-2주)

### Tournament Code란?

커스텀 게임을 공식 매치로 인식하게 하는 고유 코드:

**기능:**
- 게임 설정 강제 (드래프트 모드, 블라인드 픽 등)
- 매치 결과 자동 수집
- Spectator 설정
- 팀 배정 고정

**제한사항:**
- 반드시 사전 생성된 코드 사용
- 5v5 Summoner's Rift만 지원
- 대기열 매칭 불가 (초대만 가능)

---

## 🔧 Backend 구현 현황

### 1. 계정 인증 시스템

**Endpoint:** `POST /api/riot/verify`

```typescript
{
  "gameName": "Hide on bush",
  "tagLine": "KR1",
  "verificationCode": "summoner-icon-code"
}
```

**프로세스:**
1. 유저가 소환사 이름 입력
2. 백엔드가 Riot API로 계정 조회
3. 유저가 특정 소환사 아이콘으로 변경
4. 백엔드가 아이콘 확인하여 인증

**구현 위치:** `apps/api/src/modules/riot/riot.service.ts`

### 2. 티어/랭크 동기화

**Endpoint:** `POST /api/riot/sync/:accountId`

자동으로 다음 정보 업데이트:
- 솔로랭크 티어
- 자유랭크 티어
- 승/패 기록
- LP (League Points)

**구현 위치:** `apps/api/src/modules/riot/riot.service.ts:syncAccount()`

### 3. Tournament Code 생성

**Endpoint:** `POST /api/matches/:roomId/bracket`

**프로세스:**
1. 방의 모든 참가자 Riot 계정 확인
2. 팀 배정 (경매 또는 드래프트 결과)
3. Tournament Code 생성
4. 각 매치에 코드 할당

**Tournament Provider 설정 (1회만 실행):**
```typescript
// apps/api/src/modules/riot/riot.service.ts
async createTournamentProvider() {
  // Step 1: Provider 등록
  const providerId = await this.registerProvider({
    region: "KR",
    url: "https://your-domain.com/api/riot/tournament-callback"
  });

  // Step 2: Tournament 생성
  const tournamentId = await this.createTournament({
    providerId,
    name: "Nexus In-House Tournament"
  });

  return { providerId, tournamentId };
}
```

**Tournament Code 생성:**
```typescript
async createTournamentCode(matchId: string, teamData: any) {
  const code = await this.riotApi.post('/tournament/v4/codes', {
    mapType: "SUMMONERS_RIFT",
    pickType: "TOURNAMENT_DRAFT",
    spectatorType: "ALL",
    teamSize: 5,
    metadata: JSON.stringify({ matchId }),
    allowedSummonerIds: [...team1Ids, ...team2Ids]
  });

  return code; // "NA1-TOURNAMENT-CODE-XXXX"
}
```

### 4. 매치 결과 수집

**Callback Endpoint:** `POST /api/riot/tournament-callback`

Riot이 게임 종료 시 자동으로 호출:
```json
{
  "gameId": 5123456789,
  "shortCode": "TOURNAMENT-CODE",
  "metaData": "{\"matchId\":\"match-uuid\"}",
  "participants": [...],
  "winningTeam": 100
}
```

**구현 위치:** `apps/api/src/modules/riot/riot.controller.ts:handleTournamentCallback()`

---

## 📡 API Rate Limits

### Development Key
```
20 requests / 1 second
100 requests / 2 minutes
```

### Production Key (예시)
```
500 requests / 10 seconds
30,000 requests / 10 minutes
```

### Rate Limit 처리 구현

```typescript
// apps/api/src/modules/riot/riot.service.ts
private async callRiotApi(endpoint: string) {
  try {
    const response = await axios.get(endpoint, {
      headers: { 'X-Riot-Token': this.apiKey }
    });
    return response.data;
  } catch (error) {
    if (error.response?.status === 429) {
      // Rate limit 초과
      const retryAfter = error.response.headers['retry-after'];
      await this.delay(retryAfter * 1000);
      return this.callRiotApi(endpoint); // 재시도
    }
    throw error;
  }
}
```

---

## 🌐 API Endpoints

### Account-v1
```
GET /riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}
```
- 소환사 기본 정보 조회

### Summoner-v4
```
GET /lol/summoner/v4/summoners/by-puuid/{puuid}
GET /lol/summoner/v4/summoners/{summonerId}
```
- 소환사 상세 정보

### League-v4
```
GET /lol/league/v4/entries/by-summoner/{summonerId}
```
- 랭크 정보 (솔로랭크, 자유랭크)

### Tournament-v4 (Production Only)
```
POST /lol/tournament/v4/providers
POST /lol/tournament/v4/tournaments
POST /lol/tournament/v4/codes
GET /lol/match/v5/matches/by-tournament-code/{tournamentCode}/ids
```

### Match-v5
```
GET /lol/match/v5/matches/{matchId}
```
- 매치 상세 정보 (Tournament Code 사용 시)

---

## 🔄 Data Dragon (Static Assets)

챔피언, 아이템, 룬 데이터는 별도 API 없이 CDN에서 제공:

```
https://ddragon.leagueoflegends.com/cdn/{version}/data/ko_KR/champion.json
https://ddragon.leagueoflegends.com/cdn/{version}/img/champion/{championName}.png
```

**구현 예시:**
```typescript
// apps/api/src/modules/riot/riot.service.ts
async getChampionData() {
  const version = await this.getLatestVersion();
  const data = await axios.get(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/ko_KR/champion.json`
  );
  return data.data;
}
```

---

## ⚠️ 주의사항

1. **API 키 보안**
   - `.env` 파일에만 저장
   - Git에 커밋하지 않기
   - 프론트엔드에 노출 금지

2. **Rate Limit 준수**
   - 429 에러 발생 시 `Retry-After` 헤더 확인
   - 캐싱 적극 활용 (티어 정보, 챔피언 데이터 등)

3. **Tournament Code 사전 생성**
   - 게임 시작 전에 미리 생성
   - 한 번 사용한 코드는 재사용 불가

4. **PUUID vs Summoner ID**
   - PUUID: 글로벌 고유 ID (권장)
   - Summoner ID: 서버별 ID (레거시)

---

## 🧪 테스트

### 1. 개발 환경 테스트
```bash
# Riot API 연결 테스트
curl -X GET "https://kr.api.riotgames.com/lol/summoner/v4/summoners/by-name/Hide%20on%20bush" \
  -H "X-Riot-Token: YOUR_API_KEY"
```

### 2. 계정 인증 테스트
```bash
# Postman/Insomnia 사용
POST http://localhost:4000/api/riot/verify
{
  "gameName": "Hide on bush",
  "tagLine": "KR1",
  "verificationCode": "29"
}
```

---

## 📚 참고 자료

- [Riot Developer Portal](https://developer.riotgames.com)
- [API Documentation](https://developer.riotgames.com/apis)
- [Tournament API Guide](https://developer.riotgames.com/docs/lol#tournament-api)
- [Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon)
