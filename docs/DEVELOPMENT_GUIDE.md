# Project Nexus - 개발 환경 설정 가이드

집/회사 어디서든 개발할 수 있도록 환경 설정하는 방법입니다.

## 새 PC에서 처음 시작하기

### 1. 필수 프로그램 설치

```powershell
# Windows에서 winget으로 설치 (PowerShell 관리자 모드)

# Node.js 20
winget install OpenJS.NodeJS.LTS

# Git
winget install Git.Git

# Docker Desktop
winget install Docker.DockerDesktop

# VS Code
winget install Microsoft.VisualStudioCode

# pnpm
npm install -g pnpm
```

### 2. 프로젝트 클론

```bash
# 원하는 위치에 클론
git clone https://github.com/mintscrew-bar/project_nexus.git
cd project_nexus
```

### 3. 환경 변수 설정

```bash
# .env 파일 생성
cp .env.example .env

# .env 파일을 열어서 값 입력
```

**주의**: `.env` 파일은 Git에 올라가지 않으므로, 각 PC마다 별도로 설정해야 합니다.

### 4. 의존성 설치 및 실행

```bash
# 의존성 설치
pnpm install

# 개발용 DB 시작 (Docker Desktop 실행 후)
docker compose -f docker-compose.dev.yml up -d

# Prisma 클라이언트 생성
pnpm db:generate

# DB 스키마 적용
pnpm db:push

# 개발 서버 시작
pnpm dev
```

---

## 일상적인 개발 워크플로우

### 작업 시작할 때

```bash
# 1. 최신 코드 받기
git pull origin main

# 2. 의존성 변경 확인
pnpm install

# 3. DB 변경 확인
pnpm db:generate

# 4. 개발 서버 시작
docker compose -f docker-compose.dev.yml up -d
pnpm dev
```

### 작업 끝날 때

```bash
# 1. 변경사항 커밋
git add .
git commit -m "작업 내용 설명"

# 2. GitHub에 푸시
git push origin main

# 3. Docker 종료 (선택)
docker compose -f docker-compose.dev.yml down
```

---

## 환경 변수 동기화 팁

`.env` 파일은 Git에 올라가지 않으므로, 다음 방법 중 하나로 관리하세요:

### 방법 1: 개인 메모 (추천)
- Notion, 메모장 등에 `.env` 내용을 암호화하여 저장
- 새 PC에서 복사/붙여넣기

### 방법 2: 클라우드 동기화
```bash
# OneDrive/Google Drive에 .env 파일 저장 후 심볼릭 링크
# Windows (관리자 PowerShell)
mklink .env "C:\Users\사용자\OneDrive\.env.nexus"
```

### 방법 3: 1Password / Bitwarden
- 환경 변수를 비밀번호 관리자에 저장
- CLI로 자동 주입

---

## 자주 사용하는 명령어

```bash
# 개발 서버
pnpm dev                    # 전체 실행
pnpm --filter @nexus/api dev   # API만 실행
pnpm --filter @nexus/web dev   # Web만 실행

# 데이터베이스
pnpm db:generate            # Prisma 클라이언트 생성
pnpm db:push               # 스키마 적용 (개발용)
pnpm db:migrate            # 마이그레이션 생성 (배포용)
pnpm db:studio             # Prisma Studio (DB GUI)

# 빌드
pnpm build                 # 전체 빌드
pnpm lint                  # 린트 체크

# Docker
docker compose -f docker-compose.dev.yml up -d    # DB 시작
docker compose -f docker-compose.dev.yml down     # DB 종료
docker compose -f docker-compose.dev.yml logs     # 로그 확인
```

---

## 트러블슈팅

### pnpm install 오류
```bash
# node_modules 삭제 후 재설치
rm -rf node_modules
rm -rf apps/*/node_modules
rm -rf packages/*/node_modules
pnpm install
```

### Prisma 오류
```bash
# Prisma 클라이언트 재생성
pnpm db:generate
```

### Docker 연결 오류
```bash
# Docker Desktop이 실행 중인지 확인
# 컨테이너 재시작
docker compose -f docker-compose.dev.yml restart
```

### 포트 충돌
```bash
# 사용 중인 포트 확인 (Windows)
netstat -ano | findstr :3000
netstat -ano | findstr :4000
netstat -ano | findstr :5432

# 프로세스 종료
taskkill /PID <PID> /F
```

---

## VS Code 추천 확장

```json
// .vscode/extensions.json (이미 포함됨)
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "prisma.prisma",
    "bradlc.vscode-tailwindcss",
    "ms-azuretools.vscode-docker"
  ]
}
```

---

## 개발 URL

- **Web**: http://localhost:3000
- **API**: http://localhost:4000
- **API Health**: http://localhost:4000/api/health
- **Prisma Studio**: http://localhost:5555 (`pnpm db:studio`)
