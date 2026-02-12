# Discord 봇 (Nexus Bot)

Nexus 내전 플랫폼과 연동되는 Discord 슬래시 봇입니다. 웹과 동일한 **내전 진행 흐름**에 맞춰 방·팀·경매·매치·대진표를 조회할 수 있으며, **자동으로 음성채널 관리 및 팀장 역할 부여**를 수행합니다.

## 흐름과의 연동

봇에서 사용하는 **방 상태**는 웹/API와 동일합니다.

| 상태 | 한글 표시 | 설명 |
|------|-----------|------|
| `WAITING` | 대기 중 | 방 생성 후 대기 |
| `TEAM_SELECTION` | 팀 선택 대기 | 경매/드래프트 시작 전 |
| `DRAFT` | 드래프트/경매 진행 중 | 팀 편성 중 |
| `DRAFT_COMPLETED` | 드래프트 완료 | 역할 선택 전 |
| `ROLE_SELECTION` | 역할 선택 중 | 역할 선택 및 대진표 생성 대기 |
| `IN_PROGRESS` | 대진표 진행 중 | 매치 진행 |
| `COMPLETED` | 완료됨 | 토너먼트 종료 |

## 명령어

- **`/nexus help`** – 도움말
- **`/nexus link`** – Discord 계정을 Nexus에 연동
- **`/nexus profile [@유저]`** – 프로필 보기
- **`/nexus stats`** – 내 통계
- **`/nexus rooms`** – 활성 방 목록 (대기 ~ 역할선택 ~ 진행중)
- **`/nexus team`** – 현재 참가 중인 팀 정보 (드래프트/역할선택/진행 중 모두 포함)
- **`/nexus auction`** – 경매 상태 (경매 방 참가 시, 팀 선택 대기 또는 드래프트 진행 중)
- **`/nexus match`** – 현재 진행 중인 매치 정보
- **`/nexus bracket`** – **참가 중인 방의 대진표(브래킷)** 보기 (역할 선택 완료 후 생성된 대진)

## 대진표 (`/nexus bracket`)

- **조건**: Nexus 계정 연동 + 대진표가 있는 방에 참가 중 (룸 상태 `IN_PROGRESS` 또는 `COMPLETED`)
- **표시**: 라운드별 매치 목록, 팀명, 진행 상태(대기/진행중/완료), 웹 대진표 페이지 링크

## 자동화 기능

Discord 봇은 내전 진행 흐름에 따라 자동으로 다음 작업을 수행합니다:

### 1. 룸 생성 시 (`WAITING`)
- **빈 대기실 스캔 및 할당**: `DISCORD_LOBBY_CHANNEL_NAME`으로 지정된 대기실 채널을 스캔하여 빈 채널을 찾아 할당
- **팀별 음성채널 생성**: 룸의 최대 인원수에 맞춰 팀 수를 계산하고, 각 팀별 음성채널을 생성
  - 2팀: Blue Team, Red Team
  - 3팀 이상: 추가 팀 채널 및 대기실 생성

### 2. 팀장 선출 시 (`DRAFT`)
- **팀장 역할 부여**: 경매/드래프트 시작 시 선출된 팀장에게 `DISCORD_CAPTAIN_ROLE_NAME`으로 지정된 역할을 자동 부여

### 3. 팀 구성 완료 시 (`DRAFT_COMPLETED` → `ROLE_SELECTION`)
- **팀별 음성채널 배치**: 모든 팀원을 해당 팀의 음성채널로 자동 이동

### 4. 토너먼트 완료 시 (`COMPLETED`)
- **대기실로 이동**: 모든 참가자를 대기실로 이동
- **팀장 역할 제거**: 팀장 역할 자동 제거
- **채널 삭제**: 생성했던 모든 음성채널 및 카테고리 삭제

## 환경 변수

### 필수
- `DISCORD_BOT_TOKEN` – 봇 토큰
- `DISCORD_CLIENT_ID` – 애플리케이션(봇) 클라이언트 ID
- `DISCORD_GUILD_ID` – 슬래시 명령을 등록할 서버(Guild) ID

### 선택 (자동화 기능용)
- `DISCORD_LOBBY_CHANNEL_NAME` – 대기실 채널 이름 (기본값: "내전 대기실")
  - 봇이 이 이름을 포함하는 음성채널을 대기실로 인식합니다
- `DISCORD_CAPTAIN_ROLE_NAME` – 팀장 역할 이름 (기본값: "팀장")
  - 이 이름의 역할이 서버에 존재해야 합니다
- `DISCORD_NOTIFICATION_CHANNEL_ID` – 알림을 보낼 텍스트 채널 ID (선택사항)
- `APP_URL` – 웹 URL (연동/대진표 링크에 사용)

위 값이 비어 있거나 `your-` 로 시작하면 봇은 초기화되지 않고, API는 그대로 동작합니다. 자동화 기능도 비활성화됩니다.

## 관련 파일

- `apps/api/src/modules/discord/discord-bot.service.ts` – 슬래시 명령 및 응답
- `apps/api/src/modules/discord/discord-voice.service.ts` – 음성 채널 생성/이동
- `apps/api/src/modules/discord/discord.service.ts` – 채널 풀 등 유틸
- `apps/api/src/modules/discord/discord.module.ts` – 모듈 등록

## 내전 흐름 문서

- [MATCH_FLOW_ANALYSIS.md](./MATCH_FLOW_ANALYSIS.md) – 내전 진행 흐름 및 대진표 생성 시점
