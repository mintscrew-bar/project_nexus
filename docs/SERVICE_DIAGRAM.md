# Nexus 전체 서비스 다이어그램

> 프로젝트 전체 구조, 주요 도메인(유저 가입, 내전, 클랜 등)별 흐름을 시각적으로 정리한 문서입니다.

---

## 🏗️ 전체 아키텍처

```mermaid
flowchart TD
  subgraph Frontend
    WEB[Next.js 14]
    STATE[Zustand]
    HOOKS[React Hooks]
    COMPONENTS[UI Components]
  end
  subgraph Backend
    API[NestJS]
    SOCKET[Socket.io]
    PRISMA[Prisma]
    DB[PostgreSQL]
    DISCORD[Discord Bot]
    RIOT[Riot API]
  end
  WEB -->|API/WS| API
  API -->|DB| PRISMA
  PRISMA --> DB
  API --> SOCKET
  API --> DISCORD
  API --> RIOT
```

---

## 👤 유저 가입/인증 흐름

```mermaid
sequenceDiagram
  participant User
  participant Web
  participant API
  participant DB
  participant Discord
  participant Riot
  User->>Web: 회원가입/로그인 요청
  Web->>API: OAuth/Email 인증 요청
  API->>DB: 유저 정보 저장/조회
  API->>Discord: Discord 연동
  API->>Riot: Riot 계정 인증
  API-->>Web: 인증 결과 반환
  Web-->>User: 가입/로그인 완료
```

---

## 🏆 내전/토너먼트 흐름

```mermaid
flowchart LR
  WAITING[대기]
  TEAM_SELECTION[팀 선택]
  DRAFT[드래프트/경매]
  DRAFT_COMPLETED[드래프트 완료]
  ROLE_SELECTION[역할 선택]
  IN_PROGRESS[대진표 진행]
  COMPLETED[토너먼트 완료]
  WAITING --> TEAM_SELECTION --> DRAFT --> DRAFT_COMPLETED --> ROLE_SELECTION --> IN_PROGRESS --> COMPLETED
```

---

## 🏰 클랜/커뮤니티 흐름

```mermaid
flowchart LR
  CLAN_CREATE[클랜 생성]
  CLAN_JOIN[클랜 가입]
  CLAN_CHAT[클랜 채팅]
  CLAN_MANAGE[클랜 관리]
  CLAN_CREATE --> CLAN_JOIN --> CLAN_CHAT --> CLAN_MANAGE
```

---

## 🔗 기타 주요 도메인 흐름

- 친구 관리: 친구 요청 → 수락/차단 → 목록 관리
- 평판/신고: 신고 → 자동 밴/평판 점수 → 운영자 확인
- 커뮤니티: 게시글 작성 → 댓글/추천 → 신고/관리

---

> 각 도메인별 상세 다이어그램은 필요시 추가/보완 가능합니다.

**Last Updated**: 2026-02-23
