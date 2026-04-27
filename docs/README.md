# Project Nexus - Documentation

> League of Legends In-House Tournament Platform

---

## 📚 문서 목록

### 🚀 시작하기

- **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** - 개발 환경 설정 (필독!)
  - 의존성 설치
  - 환경 변수 설정
  - 데이터베이스 설정
  - Discord/Riot API 설정

- **[API_REFERENCE.md](./API_REFERENCE.md)** - 전체 API 엔드포인트 (100+ endpoints)
  - REST API 명세
  - WebSocket 이벤트
  - 요청/응답 예시

- **[IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)** - 프로젝트 현황
  - 코드 통계

  ***

  ### 🏗️ 아키텍처 요약
  - **Backend**: NestJS + Prisma + PostgreSQL + Socket.io
  - **Frontend**: Next.js 14 + React + TailwindCSS + Zustand
  - **Auth**: JWT + Discord OAuth2, Riot API 연동
  - **실시간**: WebSocket(방, 경매, 매치 등)

  ***

  ### 🧩 주요 기능
  - 인증(회원가입, 로그인, 리프레시, 로그아웃, OAuth, Riot 연동)
  - WebSocket 이벤트(방, 경매, 매치 등 실시간)
  - DB 스키마/마이그레이션/모델 관리
  - 성능/보안/최적화/이슈 관리 등 실무적 고려사항

  ***

  ### 📝 문서 보완/추가
  - API 문서에 실제 응답 예시, 에러 케이스, 인증 흐름, WebSocket 연결/실패/재연결 등 상세 시나리오
  - 프론트엔드 주요 페이지/컴포넌트 구조, 상태관리 흐름, 디자인 시스템/UX 가이드
  - DB 스키마/ERD, 마이그레이션/버전 관리, 데이터 흐름
  - 운영/배포/테스트 자동화(CI/CD, Docker, 환경변수, 린트/포맷/테스트 등)
  - 실제 서비스 운영 시 발생한 이슈/해결 사례(문서화)

### 🔧 개발 가이드

- **[DATABASE_SCHEMA_ANALYSIS.md](./DATABASE_SCHEMA_ANALYSIS.md)** - 데이터베이스 최종 분석 문서
  - Prisma 모델/관계/인덱스
  - 삭제 정책과 운영 리스크
  - 마이그레이션 현황과 권장 작업

- **[QUICK_FIX_GUIDE.md](./QUICK_FIX_GUIDE.md)** - 즉시 해결 방법
  - 컴파일 오류 해결
  - 임시 해결책
  - 빌드 가능하게 하는 방법

  - API 키 발급
  - Tournament API 신청
  - Rate Limit 처리
  - 계정 인증 구현

---

## 🎯 빠른 시작 (3분 설정)

```bash
# 1. 저장소 클론 및 설치
git clone <repository-url>

npm install

# 2. 환경 변수 설정
cp .env.example .env
# .env 파일 편집 (DATABASE_URL, API 키 등)


cd packages/database
npx prisma migrate dev
npx prisma generate

# 4. 개발 서버 실행
cd ../../apps/api && npm run dev    # 터미널 1
cd ../../apps/web && npm run dev    # 터미널 2
```

자세한 내용: [SETUP_GUIDE.md](./SETUP_GUIDE.md)

---

## 📊 프로젝트 개요

### 기술 스택

- **Backend**: NestJS + Prisma + PostgreSQL + Socket.io
- **Frontend**: Next.js 14 + React + TailwindCSS + Zustand
- **Auth**: JWT + Discord OAuth2
- **External APIs**: Riot Games API, Discord Bot

### 주요 기능 (11개 모듈)

1. ✅ **인증 시스템** - Discord, Email/Password
2. ✅ **Riot API 통합** - 계정 인증, 티어 동기화
3. ✅ **Room 시스템** - 방 생성/관리, 실시간 채팅
4. ✅ **Auction 시스템** - 티어별 골드, 실시간 입찰
5. ✅ **Snake Draft** - 스네이크 드래프트 팀 선택
6. ✅ **Match/Tournament** - 자동 브래킷 생성 (10/15/20인)
7. ✅ **Discord 통합** - 자동 음성 채널 생성/관리
8. ✅ **Clan 시스템** - 클랜 관리, 실시간 채팅
9. ✅ **Community/Forum** - 게시판, 댓글, 추천
10. ✅ **Reputation/Report** - 평판, 신고, 자동 밴
11. ✅ **Friend 시스템** - 친구 관리, 차단

---

### 주요 모듈/도메인

- 인증/세션/유저
- 방/경매/스네이크드래프트/매치/토너먼트
- 클랜/커뮤니티/평판/친구
- 실시간 WebSocket 이벤트
- 관리자/운영/보안/성능

- **REST API**: 100+ 엔드포인트
- **WebSocket**: 5개 namespace (room, auction, snake-draft, match, clan)
- **코드**: 8,000+ 라인
- **구현 진행도**: MVP 백엔드 95% 완료

---

## 🗂️ 프로젝트 구조

```
nexus/
├── apps/
│   ├── api/              # NestJS 백엔드 ✅
│   │   └── src/modules/  # 11개 기능 모듈
│   └── web/              # Next.js 프론트엔드 🚧
│       └── src/
│           ├── lib/      # API/Socket clients ✅
│           ├── stores/   # Zustand stores ✅
│           ├── hooks/    # React hooks ✅
│           └── components/ # UI 컴포넌트 🚧
├── packages/
│   └── database/         # Prisma schema
└── docs/                 # 문서 (이 폴더)
```

---

## ⚠️ 현재 상태

### ✅ 완료

- 백엔드 11개 모듈 구현
- API/Socket 클라이언트 통합
- Zustand 상태 관리
- React hooks

### ⏳ 진행 중

- **우선순위 1**: 프론트엔드 컴포넌트 개발
- **우선순위 2**: 통합 테스트
- **우선순위 3**: 배포/운영 문서 정리

### ❌ 미완료

- 테스트 작성
- 배포 설정
- 성능 최적화

---

## 🔍 문서 찾기

### 설정/설치 관련

→ [SETUP_GUIDE.md](./SETUP_GUIDE.md)

### API 사용법

→ [API_REFERENCE.md](./API_REFERENCE.md)

### 컴파일 오류

→ [QUICK_FIX_GUIDE.md](./QUICK_FIX_GUIDE.md)

### 데이터베이스 구조

→ [DATABASE_SCHEMA_ANALYSIS.md](./DATABASE_SCHEMA_ANALYSIS.md)

### Riot API 설정

→ [RIOT_SETUP.md](./RIOT_SETUP.md)

### 프로젝트 현황

→ [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)

---

## 🤝 개발 워크플로우

1. **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** 따라 개발 환경 설정
2. **[DATABASE_SCHEMA_ANALYSIS.md](./DATABASE_SCHEMA_ANALYSIS.md)** 참고하여 DB 구조 확인
3. **[API_REFERENCE.md](./API_REFERENCE.md)** 보면서 API 통합
4. **[QUICK_FIX_GUIDE.md](./QUICK_FIX_GUIDE.md)** 참고하여 문제 해결

---

## 📞 추가 정보

### Git 히스토리

```bash
git log --oneline --graph
```

모든 주요 커밋에 상세한 설명 포함

### Prisma Studio (DB GUI)

```bash
cd packages/database
npx prisma studio
# http://localhost:5555
```

---

**Last Updated**: 2026-01-20
**Version**: MVP v1.0 (Backend 95% Complete)
