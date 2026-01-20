# Project Nexus: LoL In-House Tournament Platform
## 기술 계획서 v2.0 (Technical Implementation Plan)

---

## 1. 프로젝트 개요

### 1.1 핵심 기능 요약
| 기능 | 설명 |
|------|------|
| **인증** | Google OAuth, Discord OAuth, 이메일 회원가입 |
| **롤 연동** | Riot API로 닉네임/티어 인증, 위장티어 방지 |
| **내전 방** | 실시간 채팅, 방 생성/검색/참가, 인원 설정 |
| **팀 구성** | 사다리타기(Snake Draft), 경매(Auction) 모드 |
| **Discord 연동** | 방 생성 시 음성채널 자동 생성, 팀별 이동 |
| **대진표** | 토너먼트/단판 자동 생성, Riot Tournament Code |
| **전적** | 자동 결과 수집, 개인/클랜 전적, 리더보드 |
| **클랜** | 생성/가입/모집/관리, 클랜 채팅 |
| **커뮤니티** | 게시판 (공지, 자유, 팁 등), 네이버카페/레딧 스타일 |
| **평판 시스템** | 매치 후 평가, 리포트, 자동 제재 |

### 1.2 페이지 구조

```
┌─────────────────────────────────────────────────────────────────┐
│  Header                                                          │
│  [로고] [내전] [내전전적] [클랜] [커뮤니티] [테마] [디코] [로그인]  │
└─────────────────────────────────────────────────────────────────┘
                              │
       ┌──────────────────────┼──────────────────────┐
       ▼                      ▼                      ▼
┌─────────────┐        ┌─────────────┐        ┌─────────────┐
│    메인     │        │    내전     │        │  내전전적   │
├─────────────┤        ├─────────────┤        ├─────────────┤
│ - 배너      │        │ - 방 목록   │        │ - 내 전적   │
│ - 내전 현황 │        │ - 방 검색   │        │ - 유저 검색 │
│ - 커뮤니티  │        │ - 방 생성   │        │ - 상세 통계 │
│ - 최근 전적 │        │ - 방 참가   │        │ - 리더보드  │
└─────────────┘        └─────────────┘        └─────────────┘
       │                      │                      │
       ▼                      ▼                      ▼
┌─────────────┐        ┌─────────────┐        ┌─────────────┐
│    클랜     │        │  커뮤니티   │        │  마이페이지 │
├─────────────┤        ├─────────────┤        ├─────────────┤
│ - 클랜 검색 │        │ - 공지사항  │        │ - 프로필    │
│ - 클랜 생성 │        │ - 자유게시판│        │ - 롤 계정   │
│ - 클랜 가입 │        │ - 팁/공략   │        │ - 설정      │
│ - 클랜 관리 │        │ - Q&A       │        │ - 친구 목록 │
│ - 클랜 채팅 │        │ - 댓글/추천 │        │ - 클랜 채팅 │
└─────────────┘        └─────────────┘        └─────────────┘
```

---

## 2. 인증 시스템

### 2.1 로그인 방식

```typescript
// 지원하는 인증 방식
enum AuthProvider {
  GOOGLE = 'google',       // Google OAuth2
  DISCORD = 'discord',     // Discord OAuth2
  EMAIL = 'email',         // 이메일 회원가입
}

// 필수 동의 약관
interface TermsAgreement {
  termsOfService: boolean;     // 이용약관 (필수)
  privacyPolicy: boolean;      // 개인정보처리방침 (필수)
  ageVerification: boolean;    // 14세 이상 확인 (필수)
  marketingConsent?: boolean;  // 마케팅 수신 동의 (선택)
}
```

### 2.2 롤 계정 연동 & 정보 등록

```typescript
// 필수 등록 정보 (첫 로그인 시 + 시즌 종료 시 재등록)
interface RiotProfileRegistration {
  // 기본 정보 (Riot API에서 자동)
  gameName: string;
  tagLine: string;
  puuid: string;

  // 티어 정보 (Riot API에서 자동)
  currentTier: Tier;           // 현재 티어
  currentRank: Rank;           // I, II, III, IV
  currentLP: number;

  // 유저 직접 입력
  peakTier: Tier;              // 최고 티어 (자기신고, 검증용)
  mainRole: Role;              // 주 라인
  subRole: Role;               // 부 라인

  // 라인별 선호 챔피언 (최소 3개)
  championsByRole: {
    [Role.TOP]: string[];      // 최소 3개
    [Role.JUNGLE]: string[];
    [Role.MID]: string[];
    [Role.ADC]: string[];
    [Role.SUPPORT]: string[];
  };

  // 추가 정보
  playStyle?: PlayStyle;       // 공격적/수비적/밸런스
  voiceChat: boolean;          // 음성채팅 가능 여부
  preferredTime?: string[];    // 선호 시간대
}

enum Tier {
  IRON = 'IRON',
  BRONZE = 'BRONZE',
  SILVER = 'SILVER',
  GOLD = 'GOLD',
  PLATINUM = 'PLATINUM',
  EMERALD = 'EMERALD',
  DIAMOND = 'DIAMOND',
  MASTER = 'MASTER',
  GRANDMASTER = 'GRANDMASTER',
  CHALLENGER = 'CHALLENGER',
}

enum Role {
  TOP = 'TOP',
  JUNGLE = 'JUNGLE',
  MID = 'MID',
  ADC = 'ADC',
  SUPPORT = 'SUPPORT',
  FILL = 'FILL',
}
```

### 2.3 위장티어 방지

```typescript
// 티어 검증 로직
async function validateTier(userId: string): Promise<ValidationResult> {
  const profile = await getRiotProfile(userId);

  // 1. Riot API 티어와 자기신고 비교
  const reportedPeak = profile.peakTier;
  const actualTier = profile.currentTier;

  // 2. 최근 경기 데이터 분석
  const recentMatches = await getRecentMatches(profile.puuid, 20);
  const avgKDA = calculateAvgKDA(recentMatches);
  const winRate = calculateWinRate(recentMatches);

  // 3. 스머프 의심 플래그
  const suspicionScore = calculateSmurfScore({
    accountLevel: profile.level,
    winRate,
    avgKDA,
    championPool: profile.championsByRole,
  });

  return {
    isVerified: suspicionScore < 0.7,
    suspicionScore,
    flags: generateFlags(suspicionScore),
  };
}
```

---

## 3. 내전 방 시스템

### 3.1 방 생성

```typescript
interface CreateRoomDto {
  title: string;                    // 방 제목
  description?: string;             // 설명
  maxPlayers: 10 | 15 | 20;        // 참여 인원
  mode: RoomMode;                   // 래더/경매
  isPrivate: boolean;               // 비공개 여부
  password?: string;                // 비밀번호

  // 경매 모드 설정
  auctionSettings?: {
    baseBudget: number;            // 기본 골드 (2000~3000)
    tierBudgetBonus: TierBudget;   // 티어별 추가 골드
    minBidIncrement: number;       // 최소 입찰 단위 (100)
    bidTimeLimit: number;          // 입찰 제한 시간 (초)
  };

  // Discord 연동
  discordGuildId: string;
  createVoiceChannels: boolean;
}

// 티어별 기본 골드 (낮은 티어일수록 높음)
const TierBudget: Record<Tier, number> = {
  IRON: 3000,
  BRONZE: 2900,
  SILVER: 2800,
  GOLD: 2600,
  PLATINUM: 2400,
  EMERALD: 2200,
  DIAMOND: 2000,
  MASTER: 2000,
  GRANDMASTER: 2000,
  CHALLENGER: 2000,
};
```

### 3.2 방 참가 & 대기

```typescript
// 방 상태
enum RoomStatus {
  WAITING = 'WAITING',           // 대기 중
  CAPTAIN_SELECT = 'CAPTAIN',    // 팀장 선출
  DRAFTING = 'DRAFTING',         // 팀 구성 중 (사다리/경매)
  LANE_SELECT = 'LANE_SELECT',   // 라인 선택
  READY = 'READY',               // 게임 준비 완료
  IN_GAME = 'IN_GAME',           // 게임 중
  FINISHED = 'FINISHED',         // 종료
}

// 실시간 채팅
interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  content: string;
  type: 'chat' | 'system' | 'auction';
  timestamp: Date;
}
```

### 3.3 Discord 채널 생성

```typescript
// 인원별 채널 구성
async function createDiscordChannels(room: Room): Promise<DiscordChannels> {
  const guild = await client.guilds.fetch(room.discordGuildId);

  // 카테고리 생성
  const category = await guild.channels.create({
    name: `내전-${room.id.slice(0, 6)}`,
    type: ChannelType.GuildCategory,
  });

  // 채널 구성 (인원별)
  // 10명: 메인, 1팀, 2팀
  // 15명: 메인, 1팀, 2팀, 3팀, 대기
  // 20명: 메인, 1팀, 2팀, 3팀, 4팀, 대기

  const channels: VoiceChannel[] = [];
  const teamCount = room.maxPlayers / 5;

  // 메인 채널
  channels.push(await guild.channels.create({
    name: '🎮 메인 로비',
    type: ChannelType.GuildVoice,
    parent: category.id,
  }));

  // 팀 채널들
  for (let i = 1; i <= teamCount; i++) {
    channels.push(await guild.channels.create({
      name: `🔵 ${i}팀`,
      type: ChannelType.GuildVoice,
      parent: category.id,
    }));
  }

  // 대기 채널 (15명 이상)
  if (room.maxPlayers > 10) {
    channels.push(await guild.channels.create({
      name: '⏳ 대기실',
      type: ChannelType.GuildVoice,
      parent: category.id,
    }));
  }

  return { category, channels };
}
```

---

## 4. 팀 구성 시스템

### 4.1 팀장 선출

```typescript
// 팀장 선출 방식
enum CaptainSelectMode {
  RANDOM = 'random',           // 랜덤 선출
  VOLUNTEER = 'volunteer',     // 자원자 중 선출
  HIGHEST_TIER = 'tier',       // 최고 티어 자동
  HOST_PICK = 'host_pick',     // 방장 지정
}

async function selectCaptains(room: Room, mode: CaptainSelectMode): Promise<Captain[]> {
  const participants = room.participants;
  const teamCount = room.maxPlayers / 5;

  switch (mode) {
    case CaptainSelectMode.RANDOM:
      return shuffleArray(participants).slice(0, teamCount);

    case CaptainSelectMode.VOLUNTEER:
      const volunteers = participants.filter(p => p.wantsCaptain);
      if (volunteers.length < teamCount) {
        throw new Error('팀장 지원자가 부족합니다');
      }
      return shuffleArray(volunteers).slice(0, teamCount);

    case CaptainSelectMode.HIGHEST_TIER:
      return participants
        .sort((a, b) => getTierValue(b.tier) - getTierValue(a.tier))
        .slice(0, teamCount);
  }
}
```

### 4.2 사다리타기 (Snake Draft)

```typescript
// 사다리타기 드래프트
interface SnakeDraft {
  roomId: string;
  captains: Captain[];
  pickOrder: string[];        // 뽑기 순서 (랜덤)
  currentPickIndex: number;
  availablePlayers: Player[];
  teams: Team[];
}

// 순서 결정: 앞/뒤 선택 후 랜덤 배치
async function determinePickOrder(captains: Captain[]): Promise<string[]> {
  // 1. 각 팀장이 앞면/뒷면 선택
  const choices = await Promise.all(
    captains.map(c => getCaptainChoice(c.userId)) // 'front' | 'back'
  );

  // 2. 랜덤 결과 생성
  const result = Math.random() > 0.5 ? 'front' : 'back';

  // 3. 순서 배정 (Snake: 1-2-2-1-1-2-2-1...)
  const order: string[] = [];
  const winners = captains.filter((c, i) => choices[i] === result);
  const losers = captains.filter((c, i) => choices[i] !== result);

  // 승자가 먼저, 스네이크 방식으로 진행
  // Round 1: 1, 2, 3, 4
  // Round 2: 4, 3, 2, 1
  // Round 3: 1, 2, 3, 4
  // ...

  return generateSnakeOrder([...winners, ...losers], room.maxPlayers - captains.length);
}
```

### 4.3 경매 시스템 (핵심)

```typescript
// 경매 상태
interface AuctionState {
  roomId: string;
  status: AuctionStatus;

  // 팀장 정보
  captains: {
    id: string;
    name: string;
    gold: number;           // 남은 골드
    team: Player[];         // 현재 팀원
    needsPlayers: number;   // 필요한 인원 수
  }[];

  // 현재 경매
  currentAuction: {
    player: Player;         // 현재 매물
    currentBid: number;     // 현재 입찰가
    currentBidder: string;  // 현재 최고 입찰자
    timerEnd: number;       // 타이머 종료 시간
  } | null;

  // 대기 명단
  waitingList: Player[];    // 아직 올라오지 않은 플레이어
  yuchalList: Player[];     // 유찰된 플레이어 (재경매 대상)

  // 사이클 관리
  currentCycle: number;     // 현재 사이클 (1사이클 = 모든 대기자 1회)
  auctionHistory: AuctionRecord[];
}

// 경매 로직
class AuctionEngine {
  // 다음 매물 선정
  async getNextPlayer(state: AuctionState): Promise<Player | null> {
    // 1. 대기 명단에서 랜덤 선택 (중복 없이 1사이클 1회)
    if (state.waitingList.length > 0) {
      const randomIndex = Math.floor(Math.random() * state.waitingList.length);
      const player = state.waitingList.splice(randomIndex, 1)[0];
      return player;
    }

    // 2. 대기 명단 소진 시 유찰 명단에서 선택
    if (state.yuchalList.length > 0) {
      // 유찰 명단을 새 대기 명단으로 이동
      state.waitingList = [...state.yuchalList];
      state.yuchalList = [];
      state.currentCycle++;

      return this.getNextPlayer(state);
    }

    // 3. 모든 플레이어 배치 완료
    return null;
  }

  // 입찰 처리
  async placeBid(
    state: AuctionState,
    captainId: string,
    amount: number
  ): Promise<BidResult> {
    const captain = state.captains.find(c => c.id === captainId);

    // 검증
    if (!captain) throw new Error('팀장이 아닙니다');
    if (amount > captain.gold) throw new Error('골드가 부족합니다');
    if (amount <= state.currentAuction.currentBid) {
      throw new Error('현재 입찰가보다 높아야 합니다');
    }
    if (amount % 100 !== 0) throw new Error('100 단위로 입찰해주세요');
    if (captain.team.length >= 4) throw new Error('팀이 가득 찼습니다');

    // 입찰 적용
    state.currentAuction.currentBid = amount;
    state.currentAuction.currentBidder = captainId;

    // 타이머 소프트 리셋 (5초로 초기화)
    const newTimerEnd = Date.now() + 5000;
    state.currentAuction.timerEnd = newTimerEnd;

    return { success: true, newBid: amount, timerEnd: newTimerEnd };
  }

  // 타이머 만료 처리
  async handleTimerExpired(state: AuctionState): Promise<void> {
    const auction = state.currentAuction;

    if (auction.currentBidder) {
      // 낙찰
      await this.handleSold(state, auction);
    } else {
      // 유찰
      await this.handleYuchal(state, auction.player);
    }

    // 다음 매물 또는 종료
    await this.processNext(state);
  }

  // 낙찰 처리
  async handleSold(state: AuctionState, auction: CurrentAuction): Promise<void> {
    const captain = state.captains.find(c => c.id === auction.currentBidder);

    captain.gold -= auction.currentBid;
    captain.team.push(auction.player);
    captain.needsPlayers--;

    // 기록
    state.auctionHistory.push({
      player: auction.player,
      buyer: captain.id,
      price: auction.currentBid,
      cycle: state.currentCycle,
    });

    // 브로드캐스트
    this.emit('auction:sold', {
      player: auction.player,
      captain: captain.id,
      price: auction.currentBid,
    });
  }

  // 유찰 처리
  async handleYuchal(state: AuctionState, player: Player): Promise<void> {
    // 유찰 명단에 추가
    state.yuchalList.push(player);

    this.emit('auction:yuchal', { player });
  }

  // 골드 부족 상황 처리
  async handleLowGold(state: AuctionState): Promise<void> {
    const captainsNeedingPlayers = state.captains.filter(c => c.needsPlayers > 0);
    const captainsWithGold = captainsNeedingPlayers.filter(c => c.gold > 0);
    const captainsWithoutGold = captainsNeedingPlayers.filter(c => c.gold === 0);

    // 모든 팀장이 돈이 없는 경우
    if (captainsWithGold.length === 0 && captainsWithoutGold.length > 0) {
      // 500골드 추가 지급
      for (const captain of captainsWithoutGold) {
        captain.gold += 500;
      }

      this.emit('auction:bonus_gold', {
        captains: captainsWithoutGold.map(c => c.id),
        amount: 500,
      });
    }

    // 한 팀장만 돈이 없고 다른 팀장은 있는 경우
    // -> 돈 있는 팀장이 경매 진행, 돈 없는 팀장은 남은 인원 자동 배정
    if (captainsWithGold.length > 0 && captainsWithoutGold.length > 0) {
      const remainingPlayers = [...state.waitingList, ...state.yuchalList];

      for (const captain of captainsWithoutGold) {
        while (captain.needsPlayers > 0 && remainingPlayers.length > 0) {
          const player = remainingPlayers.shift();
          captain.team.push(player);
          captain.needsPlayers--;

          this.emit('auction:auto_assign', {
            player,
            captain: captain.id,
          });
        }
      }

      // 대기 명단 업데이트
      state.waitingList = remainingPlayers.filter(p => !state.yuchalList.includes(p));
      state.yuchalList = remainingPlayers.filter(p => state.yuchalList.includes(p));
    }
  }

  // 경매 종료 조건 체크
  isAuctionComplete(state: AuctionState): boolean {
    return state.captains.every(c => c.needsPlayers === 0);
  }
}
```

### 4.4 라인 선택

```typescript
// 라인 선택 (자율)
interface LaneSelection {
  teamId: string;
  selections: {
    [Role.TOP]: string | null;
    [Role.JUNGLE]: string | null;
    [Role.MID]: string | null;
    [Role.ADC]: string | null;
    [Role.SUPPORT]: string | null;
  };
  isComplete: boolean;
}

// 라인 선택 완료 후 Discord 봇이 팀 채널로 이동
async function movePlayersToTeamChannels(room: Room): Promise<void> {
  for (const team of room.teams) {
    const voiceChannel = room.discordChannels.find(
      c => c.name.includes(`${team.number}팀`)
    );

    for (const player of team.players) {
      await moveToVoiceChannel(player.discordId, voiceChannel.id);
    }
  }
}
```

---

## 5. 대진표 & 매치 시스템

### 5.1 대진표 생성

```typescript
// 인원별 대진표 유형
function generateBracket(room: Room): Bracket {
  const teamCount = room.maxPlayers / 5;

  switch (teamCount) {
    case 2:  // 10인 내전 - 단판
      return {
        type: 'SINGLE',
        matches: [{
          id: generateId(),
          round: 1,
          teamA: room.teams[0],
          teamB: room.teams[1],
        }],
      };

    case 3:  // 15인 내전 - 리그전 또는 3자 토너먼트
      return {
        type: 'ROUND_ROBIN',
        matches: [
          { round: 1, teamA: room.teams[0], teamB: room.teams[1] },
          { round: 2, teamA: room.teams[1], teamB: room.teams[2] },
          { round: 3, teamA: room.teams[2], teamB: room.teams[0] },
        ],
      };

    case 4:  // 20인 내전 - 토너먼트
      return {
        type: 'TOURNAMENT',
        matches: [
          // 4강
          { round: 1, match: 1, teamA: room.teams[0], teamB: room.teams[1] },
          { round: 1, match: 2, teamA: room.teams[2], teamB: room.teams[3] },
          // 결승 (승자 vs 승자)
          { round: 2, match: 3, teamA: null, teamB: null, waitingFor: [1, 2] },
          // 3/4위전 (선택)
          { round: 2, match: 4, teamA: null, teamB: null, waitingFor: [1, 2], isLoserMatch: true },
        ],
      };
  }
}
```

### 5.2 Tournament Code 생성

```typescript
// Riot Tournament API 연동
class TournamentService {
  private providerId: number;
  private tournamentId: number;

  async initialize(): Promise<void> {
    // Provider 등록 (최초 1회)
    this.providerId = await this.registerProvider({
      region: 'KR',
      url: `${process.env.API_URL}/riot/callback`,
    });

    // Tournament 생성
    this.tournamentId = await this.createTournament({
      providerId: this.providerId,
      name: 'Project Nexus In-House',
    });
  }

  async generateMatchCode(match: Match): Promise<string> {
    const codes = await this.riotApi.post(
      '/lol/tournament/v5/codes',
      {
        count: 1,
        tournamentId: this.tournamentId,
        metadata: JSON.stringify({
          matchId: match.id,
          roomId: match.roomId,
        }),
        teamSize: 5,
        pickType: 'TOURNAMENT_DRAFT',
        mapType: 'SUMMONERS_RIFT',
        spectatorType: 'ALL',
      }
    );

    return codes[0];
  }

  // Callback 수신 (게임 종료 시)
  async handleCallback(data: TournamentCallback): Promise<void> {
    const metadata = JSON.parse(data.metaData);
    const match = await this.matchService.findById(metadata.matchId);

    // 결과 저장
    await this.matchService.recordResult({
      matchId: match.id,
      riotMatchId: data.gameId,
      winningTeam: data.winningTeam,
      gameDuration: data.gameDuration,
      participants: data.participants,
    });

    // 대진표 업데이트 (토너먼트인 경우)
    await this.bracketService.advanceWinner(match);

    // 전적 업데이트
    await this.statsService.updatePlayerStats(match);
  }
}

// Production Key 없을 경우 대안: LCU API + 수동 입력
class FallbackMatchService {
  // 수동 결과 입력 (양 팀 확인 필요)
  async submitManualResult(
    matchId: string,
    winnerId: string,
    submitterId: string
  ): Promise<void> {
    const match = await this.findById(matchId);

    // 양 팀에서 각각 1명 이상 확인해야 확정
    const confirmations = match.confirmations || [];
    confirmations.push({ usId: submitterId, winnerId, timestamp: new Date() });

    const teamAConfirmed = confirmations.some(c =>
      match.teamA.players.some(p => p.userId === c.userId)
    );
    const teamBConfirmed = confirmations.some(c =>
      match.teamB.players.some(p => p.userId === c.userId)
    );

    if (teamAConfirmed && teamBConfirmed) {
      // 결과 확정
      await this.recordResult({ matchId, winnerId, isManual: true });
    }
  }
}
```

---

## 6. Riot Data Dragon API (이미지 리소스)

### 6.1 개요
Riot Data Dragon은 챔피언, 아이템, 스킬 등의 정적 리소스를 제공하는 CDN입니다.
**API 키 불필요**, 자유롭게 사용 가능.

### 6.2 버전 확인

```typescript
// 최신 버전 가져오기
async function getLatestVersion(): Promise<string> {
  const response = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
  const versions = await response.json();
  return versions[0]; // 예: "14.24.1"
}

// 버전 캐싱 (1시간)
const VERSION_CACHE_TTL = 3600;
let cachedVersion: string | null = null;
```

### 6.3 이미지 URL 패턴

```typescript
const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com/cdn';

// 챔피언 초상화
function getChampionSquare(version: string, championId: string): string {
  return `${DDRAGON_BASE}/${version}/img/champion/${championId}.png`;
  // 예: https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion/Ahri.png
}

// 챔피언 로딩 화면 (전신)
function getChampionLoading(championId: string, skinNum: number = 0): string {
  return `${DDRAGON_BASE}/img/champion/loading/${championId}_${skinNum}.jpg`;
  // 예: https://ddragon.leagueoflegends.com/cdn/img/champion/loading/Ahri_0.jpg
}

// 챔피언 스플래시 아트
function getChampionSplash(championId: string, skinNum: number = 0): string {
  return `${DDRAGON_BASE}/img/champion/splash/${championId}_${skinNum}.jpg`;
}

// 아이템 이미지
function getItemImage(version: string, itemId: number): string {
  return `${DDRAGON_BASE}/${version}/img/item/${itemId}.png`;
  // 예: https://ddragon.leagueoflegends.com/cdn/14.24.1/img/item/1001.png
}

// 소환사 주문
function getSummonerSpell(version: string, spellKey: string): string {
  return `${DDRAGON_BASE}/${version}/img/spell/${spellKey}.png`;
  // 예: https://ddragon.leagueoflegends.com/cdn/14.24.1/img/spell/SummonerFlash.png
}

// 룬 이미지
function getRuneImage(runeIcon: string): string {
  return `${DDRAGON_BASE}/img/${runeIcon}`;
}

// 프로필 아이콘
function getProfileIcon(version: string, iconId: number): string {
  return `${DDRAGON_BASE}/${version}/img/profileicon/${iconId}.png`;
}

// 티어 엠블럼 (Community Dragon 사용)
function getTierEmblem(tier: string): string {
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${tier.toLowerCase()}.png`;
}
```

### 6.4 데이터 JSON

```typescript
// 챔피언 전체 목록
async function getAllChampions(version: string, locale: string = 'ko_KR') {
  const url = `${DDRAGON_BASE}/${version}/data/${locale}/champion.json`;
  const response = await fetch(url);
  return response.json();
}

// 챔피언 상세 정보
async function getChampionDetail(version: string, championId: string, locale: string = 'ko_KR') {
  const url = `${DDRAGON_BASE}/${version}/data/${locale}/champion/${championId}.json`;
  const response = await fetch(url);
  return response.json();
}

// 아이템 전체 목록
async function getAllItems(version: string, locale: string = 'ko_KR') {
  const url = `${DDRAGON_BASE}/${version}/data/${locale}/item.json`;
  const response = await fetch(url);
  return response.json();
}

// 소환사 주문 목록
async function getSummonerSpells(version: string, locale: string = 'ko_KR') {
  const url = `${DDRAGON_BASE}/${version}/data/${locale}/summoner.json`;
  const response = await fetch(url);
  return response.json();
}
```

### 6.5 프로젝트 적용

```typescript
// Next.js Image 최적화와 함께 사용
// next.config.js
module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ddragon.leagueoflegends.com',
      },
      {
        protocol: 'https',
        hostname: 'raw.communitydragon.org',
      },
    ],
  },
};

// React 컴포넌트 예시
function ChampionIcon({ championId, size = 48 }: { championId: string; size?: number }) {
  const { version } = useDataDragon();

  return (
    <Image
      src={getChampionSquare(version, championId)}
      alt={championId}
      width={size}
      height={size}
      className="rounded-md"
    />
  );
}

function TierBadge({ tier, rank }: { tier: Tier; rank?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Image
        src={getTierEmblem(tier)}
        alt={tier}
        width={32}
        height={32}
      />
      <span className="font-bold">{tier} {rank}</span>
    </div>
  );
}
```

---

## 7. 평판 & 리포트 시스템

### 7.1 평판 시스템

```typescript
// 평판 점수 (기본 100점)
interface Reputation {
  userId: string;
  score: number;           // 0 ~ 200
  level: ReputationLevel;
  history: ReputationEvent[];
}

enum ReputationLevel {
  EXCELLENT = 'EXCELLENT',   // 150+
  GOOD = 'GOOD',             // 100-149
  NORMAL = 'NORMAL',         // 80-99
  WARNING = 'WARNING',       // 50-79
  RESTRICTED = 'RESTRICTED', // 0-49
}

// 매치 종료 후 팀원 평가
interface PostMatchEvaluation {
  matchId: string;
  evaluatorId: string;
  targetId: string;
  rating: 'positive' | 'neutral' | 'negative';
  tags?: EvaluationTag[];
}

enum EvaluationTag {
  // Positive
  GREAT_CALLS = 'great_calls',
  FRIENDLY = 'friendly',
  SKILLED = 'skilled',
  GOOD_COMMS = 'good_comms',

  // Negative
  TOXIC = 'toxic',
  AFK = 'afk',
  TROLL = 'troll',
  NO_COMMS = 'no_comms',
}

// 평판 점수 계산
function calculateReputationChange(evaluation: PostMatchEvaluation): number {
  const weights = {
    positive: +2,
    neutral: 0,
    negative: -5,
  };

  let change = weights[evaluation.rating];

  // 태그에 따른 추가 변동
  if (evaluation.tags?.includes(EvaluationTag.TOXIC)) change -= 3;
  if (evaluation.tags?.includes(EvaluationTag.AFK)) change -= 5;
  if (evaluation.tags?.includes(EvaluationTag.GREAT_CALLS)) change += 1;

  return change;
}
```

### 7.2 제재 시스템

```typescript
// 평판 임계값 기반 자동 제재
async function checkAutoRestriction(userId: string): Promise<Restriction | null> {
  const reputation = await getReputation(userId);

  if (reputation.score < 50) {
    return {
      type: 'QUEUE_BAN',
      duration: 24 * 60 * 60 * 1000, // 24시간
      reason: '평판 점수 부족',
    };
  }

  if (reputation.score < 30) {
    return {
      type: 'QUEUE_BAN',
      duration: 7 * 24 * 60 * 60 * 1000, // 7일
      reason: '심각한 평판 점수 부족',
    };
  }

  return null;
}

// 리포트 처리
interface Report {
  id: string;
  reporterId: string;
  targetId: string;
  matchId?: string;
  reason: ReportReason;
  description: string;
  evidence?: string[];  // 스크린샷 URL
  status: 'PENDING' | 'REVIEWED' | 'ACCEPTED' | 'REJECTED';
}

enum ReportReason {
  VERBAL_ABUSE = 'verbal_abuse',
  AFK_LEAVING = 'afk_leaving',
  INTENTIONAL_FEEDING = 'int_feeding',
  CHEATING = 'cheating',
  SMURFING = 'smurfing',
  MATCH_FIXING = 'match_fixing',
  OTHER = 'other',
}
```

---

## 8. 클랜 시스템

### 8.1 클랜 기능

```typescript
interface Clan {
  id: string;
  name: string;
  tag: string;              // [TAG] 형식
  description: string;
  logoUrl?: string;
  bannerUrl?: string;

  // 멤버
  leaderId: string;
  officers: string[];       // 부클랜장
  members: ClanMember[];
  maxMembers: number;       // 기본 50명

  // 설정
  isRecruiting: boolean;
  recruitMessage?: string;
  minTier?: Tier;           // 최소 티어 조건

  // 통계
  stats: {
    totalGames: number;
    wins: number;
    avgTier: number;
  };

  createdAt: Date;
}

interface ClanMember {
  userId: string;
  role: 'LEADER' | 'OFFICER' | 'MEMBER';
  joinedAt: Date;
  contribution: number;     // 클랜전 참여 횟수
}

// 클랜 채팅 (친구 기능에 통합)
interface ClanChat {
  clanId: string;
  messages: ChatMessage[];
}
```

### 8.2 클랜 모집

```typescript
// 클랜 모집 게시판
interface ClanRecruitment {
  id: string;
  clanId: string;
  title: string;
  content: string;
  requirements: {
    minTier?: Tier;
    mainRoles?: Role[];
    playTime?: string;      // "평일 저녁", "주말" 등
    voiceChat: boolean;
  };
  isActive: boolean;
  createdAt: Date;
  expiresAt?: Date;
}
```

---

## 9. 커뮤니티 (게시판)

### 9.1 게시판 구조

```typescript
// 게시판 카테고리
enum BoardCategory {
  NOTICE = 'notice',        // 공지사항 (관리자만)
  FREE = 'free',            // 자유게시판
  TIPS = 'tips',            // 팁/공략
  QNA = 'qna',              // Q&A
  CLAN_RECRUIT = 'clan',    // 클랜 모집
  PARTY = 'party',          // 파티 모집
  BUG_REPORT = 'bug',       // 버그 제보
}

interface Post {
  id: string;
  category: BoardCategory;
  authorId: string;

  title: string;
  content: string;          // Markdown 지원
  images?: string[];

  // 메타
  views: number;
  likes: number;
  commentCount: number;

  isPinned: boolean;        // 상단 고정
  isHot: boolean;           // 인기글

  createdAt: Date;
  updatedAt: Date;
}

interface Comment {
  id: string;
  postId: string;
  authorId: string;
  parentId?: string;        // 대댓글

  content: string;
  likes: number;

  isDeleted: boolean;
  createdAt: Date;
}
```

### 9.2 추천 시스템

```typescript
// 추천/비추천
interface Vote {
  userId: string;
  targetType: 'POST' | 'COMMENT';
  targetId: string;
  type: 'UP' | 'DOWN';
  createdAt: Date;
}

// 인기글 기준
function isHotPost(post: Post): boolean {
  const hoursSinceCreation = (Date.now() - post.createdAt.getTime()) / (1000 * 60 * 60);
  const score = (post.likes * 2 + post.commentCount + post.views * 0.1) / Math.pow(hoursSinceCreation + 2, 1.5);

  return score > HOT_THRESHOLD;
}
```

---

## 10. 데이터베이스 스키마 (Prisma)

```prisma
// schema.prisma - 확장된 버전

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================
// USER & AUTH
// ============================================

model User {
  id              String    @id @default(cuid())

  // OAuth 연동
  email           String?   @unique
  googleId        String?   @unique
  discordId       String?   @unique
  discordUsername String?
  discordAvatar   String?

  // 프로필
  username        String    @unique
  nickname        String?
  avatar          String?

  // 평판
  reputation      Int       @default(100)
  reputationLevel ReputationLevel @default(NORMAL)

  // 제재
  isBanned        Boolean   @default(false)
  bannedUntil     DateTime?
  banReason       String?

  // 약관 동의
  termsAgreedAt   DateTime?
  privacyAgreedAt DateTime?
  marketingAgreed Boolean   @default(false)

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  // Relations
  riotAccounts    RiotAccount[]
  roomsCreated    Room[]           @relation("RoomHost")
  participations  RoomParticipant[]
  captainHistory  CaptainRecord[]

  // Social
  friendsInitiated  Friendship[]   @relation("FriendshipInitiator")
  friendsReceived   Friendship[]   @relation("FriendshipReceiver")

  // Clan
  clanMembership  ClanMember?
  clanInvites     ClanInvite[]     @relation("ClanInviteReceiver")

  // Community
  posts           Post[]
  comments        Comment[]
  votes           Vote[]

  // Reputation
  evaluationsGiven    MatchEvaluation[] @relation("EvaluationGiver")
  evaluationsReceived MatchEvaluation[] @relation("EvaluationReceiver")
  reportsSent         Report[]          @relation("ReportSender")
  reportsReceived     Report[]          @relation("ReportReceiver")

  @@index([discordId])
  @@index([reputation])
}

model RiotAccount {
  id              String    @id @default(cuid())
  puuid           String    @unique
  userId          String
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Riot 정보
  gameName        String
  tagLine         String
  summonerId      String
  accountId       String
  profileIconId   Int
  summonerLevel   Int

  // 티어 정보
  currentTier     Tier      @default(UNRANKED)
  currentRank     Rank?
  currentLP       Int       @default(0)
  peakTier        Tier?

  // 유저 입력 정보
  mainRole        Role?
  subRole         Role?
  playStyle       PlayStyle?
  voiceChatEnabled Boolean  @default(true)

  // 라인별 챔피언 (JSON)
  championsByRole Json?     // { TOP: ["Aatrox", "Darius"], ... }

  // 검증
  isVerified      Boolean   @default(false)
  verifiedAt      DateTime?
  isPrimary       Boolean   @default(false)

  // 마지막 동기화
  lastSyncAt      DateTime?

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([gameName, tagLine])
  @@index([userId])
}

// ============================================
// ROOM & MATCH
// ============================================

model Room {
  id              String      @id @default(cuid())
  hostId          String
  host            User        @relation("RoomHost", fields: [hostId], references: [id])

  // 기본 정보
  title           String
  description     String?
  maxPlayers      Int         // 10, 15, 20
  mode            RoomMode
  status          RoomStatus  @default(WAITING)

  // 설정
  isPrivate       Boolean     @default(false)
  password        String?

  // 경매 설정
  auctionSettings Json?       // { baseBudget, tierBonus, minBid, timeLimit }

  // Discord
  discordGuildId  String
  discordCategoryId String?
  discordChannels Json?       // 생성된 채널 ID들

  createdAt       DateTime    @default(now())
  startedAt       DateTime?
  finishedAt      DateTime?

  // Relations
  participants    RoomParticipant[]
  teams           Team[]
  bracket         Bracket?
  matches         Match[]
  chatMessages    RoomChat[]
  auctionState    AuctionState?

  @@index([status])
  @@index([hostId])
}

model RoomParticipant {
  id          String    @id @default(cuid())
  roomId      String
  room        Room      @relation(fields: [roomId], references: [id], onDelete: Cascade)
  userId      String
  user        User      @relation(fields: [userId], references: [id])

  // 상태
  isCaptain   Boolean   @default(false)
  teamId      String?
  team        Team?     @relation(fields: [teamId], references: [id])

  // 경매 결과
  soldPrice   Int?

  // 라인 선택
  selectedRole Role?

  joinedAt    DateTime  @default(now())

  @@unique([roomId, userId])
  @@index([roomId])
  @@index([userId])
}

model Team {
  id          String    @id @default(cuid())
  roomId      String
  room        Room      @relation(fields: [roomId], references: [id], onDelete: Cascade)

  number      Int       // 1, 2, 3, 4
  captainId   String?

  // Discord
  voiceChannelId String?

  // 경매
  budget      Int?
  spentBudget Int       @default(0)

  members     RoomParticipant[]

  // Match relations
  matchesAsTeamA Match[] @relation("MatchTeamA")
  matchesAsTeamB Match[] @relation("MatchTeamB")
  matchesWon     Match[] @relation("MatchWinner")

  @@unique([roomId, number])
  @@index([roomId])
}

model AuctionState {
  id              String    @id @default(cuid())
  roomId          String    @unique
  room            Room      @relation(fields: [roomId], references: [id], onDelete: Cascade)

  status          AuctionStatus @default(WAITING)

  // 현재 경매
  currentPlayerId String?
  currentBid      Int       @default(0)
  currentBidderId String?
  timerEndsAt     DateTime?

  // 대기 명단 (JSON)
  waitingList     Json      @default("[]")
  yuchalList      Json      @default("[]")

  currentCycle    Int       @default(1)

  updatedAt       DateTime  @updatedAt
}

model Bracket {
  id          String    @id @default(cuid())
  roomId      String    @unique
  room        Room      @relation(fields: [roomId], references: [id], onDelete: Cascade)

  type        BracketType
  structure   Json      // 대진표 구조

  createdAt   DateTime  @default(now())
}

model Match {
  id              String    @id @default(cuid())
  roomId          String
  room            Room      @relation(fields: [roomId], references: [id], onDelete: Cascade)

  // 팀
  teamAId         String
  teamA           Team      @relation("MatchTeamA", fields: [teamAId], references: [id])
  teamBId         String
  teamB           Team      @relation("MatchTeamB", fields: [teamBId], references: [id])

  // 대진표 위치
  round           Int
  matchNumber     Int

  // Riot 연동
  tournamentCode  String?   @unique
  riotMatchId     String?   @unique

  // 결과
  winnerId        String?
  winner          Team?     @relation("MatchWinner", fields: [winnerId], references: [id])

  gameDuration    Int?      // seconds
  gameData        Json?     // 상세 경기 데이터

  // 수동 입력
  isManualResult  Boolean   @default(false)
  confirmations   Json?     // 확인한 유저들

  status          MatchStatus @default(PENDING)

  createdAt       DateTime  @default(now())
  startedAt       DateTime?
  finishedAt      DateTime?

  // Post-match
  evaluations     MatchEvaluation[]

  @@index([roomId])
  @@index([tournamentCode])
  @@index([riotMatchId])
}

model RoomChat {
  id          String    @id @default(cuid())
  roomId      String
  room        Room      @relation(fields: [roomId], references: [id], onDelete: Cascade)
  userId      String

  content     String
  type        ChatType  @default(USER)

  createdAt   DateTime  @default(now())

  @@index([roomId])
}

// ============================================
// SOCIAL
// ============================================

model Friendship {
  id          String    @id @default(cuid())

  initiatorId String
  initiator   User      @relation("FriendshipInitiator", fields: [initiatorId], references: [id])
  receiverId  String
  receiver    User      @relation("FriendshipReceiver", fields: [receiverId], references: [id])

  status      FriendshipStatus @default(PENDING)

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@unique([initiatorId, receiverId])
  @@index([initiatorId])
  @@index([receiverId])
}

// ============================================
// CLAN
// ============================================

model Clan {
  id              String    @id @default(cuid())

  name            String    @unique
  tag             String    @unique  // 3-5자
  description     String?
  logoUrl         String?
  bannerUrl       String?

  leaderId        String
  maxMembers      Int       @default(50)

  // 모집
  isRecruiting    Boolean   @default(false)
  recruitMessage  String?
  minTier         Tier?

  // 통계
  totalGames      Int       @default(0)
  wins            Int       @default(0)

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  members         ClanMember[]
  invites         ClanInvite[]
  chatMessages    ClanChat[]
  recruitPosts    ClanRecruitment[]

  @@index([name])
  @@index([tag])
}

model ClanMember {
  id          String    @id @default(cuid())
  clanId      String
  clan        Clan      @relation(fields: [clanId], references: [id], onDelete: Cascade)
  userId      String    @unique
  user        User      @relation(fields: [userId], references: [id])

  role        ClanRole  @default(MEMBER)
  contribution Int      @default(0)

  joinedAt    DateTime  @default(now())

  @@index([clanId])
}

model ClanInvite {
  id          String    @id @default(cuid())
  clanId      String
  clan        Clan      @relation(fields: [clanId], references: [id], onDelete: Cascade)
  userId      String
  user        User      @relation("ClanInviteReceiver", fields: [userId], references: [id])

  invitedBy   String
  status      InviteStatus @default(PENDING)

  createdAt   DateTime  @default(now())
  expiresAt   DateTime

  @@unique([clanId, userId])
  @@index([userId])
}

model ClanChat {
  id          String    @id @default(cuid())
  clanId      String
  clan        Clan      @relation(fields: [clanId], references: [id], onDelete: Cascade)
  userId      String

  content     String

  createdAt   DateTime  @default(now())

  @@index([clanId])
}

model ClanRecruitment {
  id          String    @id @default(cuid())
  clanId      String
  clan        Clan      @relation(fields: [clanId], references: [id], onDelete: Cascade)

  title       String
  content     String
  requirements Json?

  isActive    Boolean   @default(true)

  createdAt   DateTime  @default(now())
  expiresAt   DateTime?

  @@index([clanId])
  @@index([isActive])
}

// ============================================
// COMMUNITY
// ============================================

model Post {
  id          String    @id @default(cuid())
  category    BoardCategory
  authorId    String
  author      User      @relation(fields: [authorId], references: [id])

  title       String
  content     String    @db.Text
  images      String[]

  views       Int       @default(0)
  likesCount  Int       @default(0)

  isPinned    Boolean   @default(false)
  isDeleted   Boolean   @default(false)

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  comments    Comment[]
  votes       Vote[]    @relation("PostVotes")

  @@index([category])
  @@index([authorId])
  @@index([createdAt])
}

model Comment {
  id          String    @id @default(cuid())
  postId      String
  post        Post      @relation(fields: [postId], references: [id], onDelete: Cascade)
  authorId    String
  author      User      @relation(fields: [authorId], references: [id])
  parentId    String?
  parent      Comment?  @relation("CommentReplies", fields: [parentId], references: [id])

  content     String
  likesCount  Int       @default(0)

  isDeleted   Boolean   @default(false)

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  replies     Comment[] @relation("CommentReplies")
  votes       Vote[]    @relation("CommentVotes")

  @@index([postId])
  @@index([authorId])
}

model Vote {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id])

  postId      String?
  post        Post?     @relation("PostVotes", fields: [postId], references: [id], onDelete: Cascade)
  commentId   String?
  comment     Comment?  @relation("CommentVotes", fields: [commentId], references: [id], onDelete: Cascade)

  type        VoteType

  createdAt   DateTime  @default(now())

  @@unique([userId, postId])
  @@unique([userId, commentId])
}

// ============================================
// REPUTATION & REPORTS
// ============================================

model MatchEvaluation {
  id          String    @id @default(cuid())
  matchId     String
  match       Match     @relation(fields: [matchId], references: [id], onDelete: Cascade)

  giverId     String
  giver       User      @relation("EvaluationGiver", fields: [giverId], references: [id])
  receiverId  String
  receiver    User      @relation("EvaluationReceiver", fields: [receiverId], references: [id])

  rating      EvaluationRating
  tags        EvaluationTag[]

  createdAt   DateTime  @default(now())

  @@unique([matchId, giverId, receiverId])
  @@index([receiverId])
}

model Report {
  id          String    @id @default(cuid())

  reporterId  String
  reporter    User      @relation("ReportSender", fields: [reporterId], references: [id])
  targetId    String
  target      User      @relation("ReportReceiver", fields: [targetId], references: [id])

  matchId     String?
  reason      ReportReason
  description String
  evidence    String[]

  status      ReportStatus @default(PENDING)
  reviewedBy  String?
  reviewNote  String?

  createdAt   DateTime  @default(now())
  reviewedAt  DateTime?

  @@index([targetId])
  @@index([status])
}

model CaptainRecord {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id])

  matchId     String
  teamNumber  Int
  won         Boolean

  totalSpent  Int
  playerCount Int
  avgCost     Int

  createdAt   DateTime  @default(now())

  @@index([userId])
}

// ============================================
// ENUMS
// ============================================

enum Tier {
  UNRANKED
  IRON
  BRONZE
  SILVER
  GOLD
  PLATINUM
  EMERALD
  DIAMOND
  MASTER
  GRANDMASTER
  CHALLENGER
}

enum Rank {
  I
  II
  III
  IV
}

enum Role {
  TOP
  JUNGLE
  MID
  ADC
  SUPPORT
  FILL
}

enum PlayStyle {
  AGGRESSIVE
  DEFENSIVE
  BALANCED
}

enum RoomMode {
  LADDER
  AUCTION
}

enum RoomStatus {
  WAITING
  CAPTAIN_SELECT
  DRAFTING
  LANE_SELECT
  READY
  IN_GAME
  FINISHED
  CANCELLED
}

enum AuctionStatus {
  WAITING
  BIDDING
  YUCHAL
  COMPLETED
}

enum BracketType {
  SINGLE
  ROUND_ROBIN
  TOURNAMENT
}

enum MatchStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  CANCELLED
}

enum ChatType {
  USER
  SYSTEM
  AUCTION
}

enum FriendshipStatus {
  PENDING
  ACCEPTED
  BLOCKED
}

enum ClanRole {
  LEADER
  OFFICER
  MEMBER
}

enum InviteStatus {
  PENDING
  ACCEPTED
  DECLINED
  EXPIRED
}

enum BoardCategory {
  NOTICE
  FREE
  TIPS
  QNA
  CLAN_RECRUIT
  PARTY
  BUG_REPORT
}

enum VoteType {
  UP
  DOWN
}

enum EvaluationRating {
  POSITIVE
  NEUTRAL
  NEGATIVE
}

enum EvaluationTag {
  GREAT_CALLS
  FRIENDLY
  SKILLED
  GOOD_COMMS
  TOXIC
  AFK
  TROLL
  NO_COMMS
}

enum ReportReason {
  VERBAL_ABUSE
  AFK_LEAVING
  INTENTIONAL_FEEDING
  CHEATING
  SMURFING
  MATCH_FIXING
  OTHER
}

enum ReportStatus {
  PENDING
  REVIEWING
  ACCEPTED
  REJECTED
}

enum ReputationLevel {
  EXCELLENT
  GOOD
  NORMAL
  WARNING
  RESTRICTED
}
```

---

## 11. 추가 제안 기능

### 11.1 래더 모드 (추가)

```typescript
// 래더 모드: 큐 기반 매칭 (솔로랭 처럼)
interface LadderQueue {
  userId: string;
  selectedRole: Role;      // 주 라인
  subRole: Role;           // 부 라인
  mmr: number;             // 내부 MMR
  queuedAt: Date;
}

// MMR 기반 밸런싱
async function balanceTeams(players: LadderQueue[]): Promise<Team[]> {
  // 10명을 MMR 기반으로 밸런스 맞춰 2팀으로 나눔
  const sorted = [...players].sort((a, b) => b.mmr - a.mmr);

  const teamA: LadderQueue[] = [];
  const teamB: LadderQueue[] = [];

  // Snake draft로 배분
  sorted.forEach((player, i) => {
    if (Math.floor(i / 2) % 2 === 0) {
      teamA.push(player);
    } else {
      teamB.push(player);
    }
  });

  return [
    { players: teamA, avgMmr: avg(teamA.map(p => p.mmr)) },
    { players: teamB, avgMmr: avg(teamB.map(p => p.mmr)) },
  ];
}
```

### 11.2 관전 모드

```typescript
// 관전자 기능
interface Spectator {
  roomId: string;
  userId: string;
  discordChannelId?: string; // 관전 전용 채널
}

// 관전 뷰
- 실시간 경매 현황 보기
- 팀 구성 결과 보기
- 대진표 보기 (실시간 업데이트)
```

### 11.3 시즌 & 리그 시스템

```typescript
// 시즌 시스템
model Season {
  id          String    @id @default(cuid())
  name        String    // "Season 1", "2025 Spring"
  startDate   DateTime
  endDate     DateTime
  isActive    Boolean   @default(false)

  // 시즌 보상
  rewards     Json?
}

// 리더보드
interface Leaderboard {
  seasonId: string;
  type: 'MMR' | 'WINS' | 'CAPTAIN' | 'VALUE'; // value = 낙찰가 대비 승률
  entries: LeaderboardEntry[];
}
```

### 11.4 업적 & 보상

```typescript
const ACHIEVEMENTS = [
  { id: 'first_win', name: '첫 승리', icon: '🏆' },
  { id: 'streak_5', name: '5연승', icon: '🔥' },
  { id: 'captain_master', name: '드래프트 장인', condition: 'captain_wins >= 10' },
  { id: 'mvp', name: 'MVP', condition: 'mvp_votes >= 5' },
  { id: 'value_pick', name: '가성비 픽', condition: 'avg_price < 200 && win_rate > 0.6' },
  { id: 'whale', name: '큰손', condition: 'max_price_paid > 1000' },
];
```

---

## 12. 기술 스택 요약

| 영역 | 기술 |
|------|------|
| **Frontend** | Next.js 14 (App Router), TypeScript, TailwindCSS, Zustand, TanStack Query, Socket.io-client |
| **Backend** | NestJS 10, TypeScript, Prisma, Socket.io, Passport.js |
| **Database** | PostgreSQL 16, Redis 7 |
| **Auth** | Google OAuth, Discord OAuth, NextAuth.js, JWT |
| **External API** | Riot API (Account, Summoner, League, Tournament), Discord API, Data Dragon |
| **Infrastructure** | Docker Compose, Cloudflare Tunnel |
| **Discord Bot** | Discord.js v14 |

---

## 13. 개발 우선순위

### Phase 1: MVP (4주)
1. 인증 (Google, Discord OAuth)
2. 롤 계정 연동 & 인증
3. 기본 내전 방 생성/참가
4. 경매 시스템 (핵심)
5. Discord 음성채널 연동

### Phase 2: 핵심 기능 (4주)
1. 대진표 & Tournament Code
2. 전적 기록 & 통계
3. 사다리타기 모드
4. 평판 시스템

### Phase 3: 소셜 (3주)
1. 클랜 시스템
2. 친구 & 채팅
3. 커뮤니티 게시판

### Phase 4: 고도화 (2주)
1. 래더 모드
2. 시즌 & 리더보드
3. 업적 시스템
4. 관전 모드

---

## 14. 다음 단계

### 필요한 결정사항
- [ ] Discord 서버 구조 (채널 풀 개수)
- [ ] Riot API 키 종류 (Personal vs Production)
- [ ] 첫 시즌 시작 시점
- [ ] 베타 테스트 계획
- [ ] 도메인 결정

### 즉시 시작 가능
1. 프로젝트 구조 완성 (이미 생성됨)
2. 인증 시스템 구현
3. Riot API 연동 테스트
4. Discord Bot 기본 구현
