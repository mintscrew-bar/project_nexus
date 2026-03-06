# Discord 봇 (Nexus Bot)

---

## 🖼️ Discord 봇 자동화/연동 구조 다이어그램

```mermaid
flowchart TD
	ROOM_CREATE[룸 생성 (WAITING)]
	TEAM_CHANNEL[팀별 음성채널 생성]
	CAPTAIN_ROLE[팀장 역할 부여]
	TEAM_MOVE[팀원 음성채널 이동]
	BRACKET_CREATE[대진표 생성]
	NOTIFY[알림 채널 연동]
	ROOM_COMPLETE[토너먼트 완료]
	REMOVE_ROLE[팀장 역할 제거]
	DELETE_CHANNEL[채널/카테고리 삭제]

	ROOM_CREATE --> TEAM_CHANNEL
	TEAM_CHANNEL --> CAPTAIN_ROLE
	CAPTAIN_ROLE --> TEAM_MOVE
	TEAM_MOVE --> BRACKET_CREATE
	BRACKET_CREATE --> NOTIFY
	NOTIFY --> ROOM_COMPLETE
	ROOM_COMPLETE --> REMOVE_ROLE
	ROOM_COMPLETE --> DELETE_CHANNEL
```

---

Nexus 내전 플랫폼과 연동되는 Discord 슬래시 봇입니다. 웹과 동일한 **내전 진행 흐름**에 맞춰 방·팀·경매·매치·대진표를 조회할 수 있으며, **자동으로 음성채널 관리 및 팀장 역할 부여**를 수행합니다.

---

## 🤖 Discord 봇 자동화/중복 체크/연동 요약

### 주요 자동화 기능

- 내전 진행 단계별 음성채널 생성/이동/삭제
- 팀장 역할 자동 부여/제거
- 대기실/팀별 채널 스캔 및 할당
- 대진표 생성 후 참가자 자동 이동
- 알림 채널 연동 및 웹 링크 제공

### 중복 체크/예외 처리

- 음성채널/팀장 역할/대기실 중복 생성 방지
- 기존 채널/역할 존재 시 재사용 및 예외 처리
- 대기실/팀별 채널 스캔 후 빈 채널 우선 할당

### 연동 구조

- 웹/API와 동일한 상태 흐름 및 명령어 제공
- 슬래시 명령어로 내전/토너먼트 정보 조회 가능
- Nexus 계정 연동 및 대진표/매치/팀 정보 실시간 제공

---

## 흐름과의 연동

봇에서 사용하는 **방 상태**는 웹/API와 동일합니다.

| 상태              | 한글 표시             | 설명                          |
| ----------------- | --------------------- | ----------------------------- |
| `WAITING`         | 대기 중               | 방 생성 후 대기               |
| `TEAM_SELECTION`  | 팀 선택 대기          | 경매/드래프트 시작 전         |
| `DRAFT`           | 드래프트/경매 진행 중 | 팀 편성 중                    |
| `DRAFT_COMPLETED` | 드래프트 완료         | 역할 선택 전                  |
| `ROLE_SELECTION`  | 역할 선택 중          | 역할 선택 및 대진표 생성 대기 |
| `IN_PROGRESS`     | 대진표 진행 중        | 매치 진행                     |
| `COMPLETED`       | 완료됨                | 토너먼트 종료                 |

## 명령어

## 대진표 (`/nexus bracket`)

## 자동화 기능

Discord 봇은 내전 진행 흐름에 따라 자동으로 다음 작업을 수행합니다:

### 1. 룸 생성 시 (`WAITING`)

- 2팀: Blue Team, Red Team
- 3팀 이상: 추가 팀 채널 및 대기실 생성

### 2. 팀장 선출 시 (`DRAFT`)

### 3. 팀 구성 완료 시 (`DRAFT_COMPLETED` → `ROLE_SELECTION`)

### 4. 토너먼트 완료 시 (`COMPLETED`)

## 환경 변수

### 필수

### 선택 (자동화 기능용)

- 봇이 이 이름을 포함하는 음성채널을 대기실로 인식합니다
- 이 이름의 역할이 서버에 존재해야 합니다

위 값이 비어 있거나 `your-` 로 시작하면 봇은 초기화되지 않고, API는 그대로 동작합니다. 자동화 기능도 비활성화됩니다.

## 관련 파일

## 내전 흐름 문서
