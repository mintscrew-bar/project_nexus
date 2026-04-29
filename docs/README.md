# Project Nexus - Documentation Hub

> League of Legends In-House Tournament Platform

이 디렉토리는 Project Nexus의 설계, API 명세, 개발 가이드 및 프로젝트 관리 문서를 포함하고 있습니다. 모든 문서는 카테고리별로 분류되어 관리됩니다.

---

## 📂 문서 카테고리

### 🚀 [Setup & Guides](./setup/)
개발 환경 설정 및 외부 서비스 연동을 위한 가이드입니다.
- **[SETUP_GUIDE.md](./setup/SETUP_GUIDE.md)**: 전체 개발 환경 설정 (필독)
- **[RIOT_SETUP.md](./setup/RIOT_SETUP.md)**: Riot API 발급 및 설정
- **[DEPLOYMENT.md](./setup/DEPLOYMENT.md)**: 배포 가이드
- **[lab_workflow.md](./setup/lab_workflow.md)**: Lab 기능 개발 워크플로우

### 🏗️ [Technical Specs](./technical/)
시스템 설계, 데이터베이스 구조 및 API 명세입니다.
- **[DATABASE_SCHEMA_ANALYSIS.md](./technical/DATABASE_SCHEMA_ANALYSIS.md)**: DB 스키마 분석 및 운영 리스크
- **[API_REFERENCE.md](./technical/API_REFERENCE.md)**: REST API 엔드포인트 명세
- **[WEBSOCKET_EVENTS.md](./technical/WEBSOCKET_EVENTS.md)**: 실시간 WebSocket 이벤트 명세
- **[SERVICE_DIAGRAM.md](./technical/SERVICE_DIAGRAM.md)**: 시스템 아키텍처 다이어그램
- **[DESIGN_SYSTEM.md](./technical/DESIGN_SYSTEM.md)**: 프론트엔드 디자인 시스템
- **[DISCORD_BOT.md](./technical/DISCORD_BOT.md)**: Discord 봇 연동 명세
- **[MATCH_SYSTEM_ANALYSIS.md](./technical/MATCH_SYSTEM_ANALYSIS.md)**: 매치 시스템 로직 분석

### 📊 [Status & Issues](./status/)
프로젝트 진행 현황 및 알려진 문제점들입니다.
- **[PROJECT_STATUS.md](./status/PROJECT_STATUS.md)**: 현재 개발 현황 및 모듈별 상태
- **[KNOWN_ISSUES.md](./status/KNOWN_ISSUES.md)**: 해결이 필요한 알려진 이슈 목록
- **[BETA_PUBLIC_TEST_PLAN.md](./status/BETA_PUBLIC_TEST_PLAN.md)**: 공개 베타 테스트 계획

### 🛡️ [Security](./security/)
보안 취약점 보고 및 보안 관련 작업 목록입니다.
- **[SYSTEM_VULNERABILITY_REPORT.md](./security/SYSTEM_VULNERABILITY_REPORT.md)**: 시스템 취약점 분석 보고서
- **[SECURITY_TODO.md](./security/SECURITY_TODO.md)**: 보안 개선 작업 목록

### 🧩 [Feature Improvements](./features/)
개별 기능별 상세 개선안 및 TODO 목록입니다.
- **Auction**: [Spectator Improvement](./features/TODO_auction_spectator_improvement.md)
- **Clan**: [Clan Improvement](./features/TODO_clan_improvement.md)
- **Lab**: [Dashboard](./features/TODO_lab_dashboard.md), [Dashboard Refactor](./features/TODO_lab_dashboard_refactor.md), [Ranked/Custom Split](./features/TODO_lab_ranked_custom_split.md)
- **Match**: [Matches Crawling](./features/TODO_matches_crawling.md)
- **Discord**: [Voice Validation](./features/DISCORD_VOICE_VALIDATION_TODO.md)

---

## 🛠️ 빠른 시작 (Quick Start)

```bash
# 1. 의존성 설치
pnpm install

# 2. 환경 변수 설정
cp .env.example .env

# 3. 데이터베이스 설정
pnpm db:push
pnpm db:generate

# 4. 개발 서버 실행
pnpm dev
```

상세한 설정 방법은 **[SETUP_GUIDE.md](./setup/SETUP_GUIDE.md)**를 참조하세요.

---

**마지막 업데이트**: 2026-04-28
**,file_path: