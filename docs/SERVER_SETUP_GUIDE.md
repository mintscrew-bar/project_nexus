# Project Nexus - Server Setup Guide

## 1. 서버 PC 하드웨어 준비

### 필요 부품
- CPU: Ryzen 3500X (보유)
- RAM: DDR4 8GB x 2 = 16GB (보유)
- 메인보드: MSI B450 Carbon Gaming AC WiFi (보유)
- 파워: Micronics 700W (보유)
- **SSD: 500GB 이상 권장 (구매 필요, ~5-7만원)**
- **케이스: 미니타워/미들타워 (구매 필요, ~3-5만원)**

### 네트워크 준비
- 유선 LAN 연결 권장 (안정성)
- 공유기에서 DHCP 고정 IP 할당 또는 서버에서 Static IP 설정

---

## 2. Ubuntu Server 설치

### 2.1 설치 미디어 준비

1. **Ubuntu Server 22.04 LTS 다운로드**
   ```
   https://ubuntu.com/download/server
   ```

2. **Rufus로 부팅 USB 만들기** (메인 PC에서)
   - Rufus 다운로드: https://rufus.ie
   - USB (8GB 이상) 연결
   - ISO 파일 선택 후 부팅 USB 생성

### 2.2 BIOS 설정 (서버 PC)

메인 PC의 GPU를 임시로 장착 후:

1. 서버 PC 부팅 → DEL 키로 BIOS 진입
2. 설정 변경:
   ```
   - Boot Priority: USB First
   - Wake on LAN: Enabled (원격 부팅용)
   - Power On after Power Failure: Always On (정전 후 자동 부팅)
   ```

### 2.3 Ubuntu Server 설치 과정

1. USB 부팅 → "Install Ubuntu Server" 선택

2. **언어/키보드**: English (권장)

3. **네트워크 설정**:
   - DHCP 자동 또는 수동 IP 설정
   - 예시 Static IP:
     ```
     IP: 192.168.0.100
     Subnet: 255.255.255.0
     Gateway: 192.168.0.1
     DNS: 8.8.8.8, 8.8.4.4
     ```

4. **디스크 파티션**: "Use entire disk" 선택

5. **사용자 설정**:
   ```
   Your name: nexus
   Server name: nexus-server
   Username: nexus
   Password: [강력한 비밀번호]
   ```

6. **SSH 설치**: "Install OpenSSH server" 체크

7. **추가 패키지**: 선택 안 함 (나중에 설치)

8. 설치 완료 후 재부팅

---

## 3. 초기 서버 설정

### 3.1 SSH로 원격 접속 (메인 PC에서)

```bash
# Windows PowerShell 또는 Terminal
ssh nexus@192.168.0.100

# 또는 PuTTY 사용
```

### 3.2 시스템 업데이트

```bash
sudo apt update && sudo apt upgrade -y
```

### 3.3 필수 패키지 설치

```bash
# 기본 도구
sudo apt install -y curl wget git vim htop net-tools

# 방화벽 설정
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp   # Next.js
sudo ufw allow 4000/tcp   # NestJS API
sudo ufw enable
```

### 3.4 Timezone 설정

```bash
sudo timedatectl set-timezone Asia/Seoul
```

---

## 4. Docker & Docker Compose 설치

### 4.1 Docker 설치

```bash
# Docker 공식 GPG 키 추가
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Docker 레포지토리 추가
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Docker 설치
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 현재 사용자를 docker 그룹에 추가 (sudo 없이 docker 사용)
sudo usermod -aG docker $USER
newgrp docker
```

### 4.2 Docker 설치 확인

```bash
docker --version
docker compose version
```

---

## 5. Node.js 설치 (개발/빌드용)

```bash
# NVM 설치
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc

# Node.js LTS 설치
nvm install 20
nvm use 20
nvm alias default 20

# 확인
node --version  # v20.x.x
npm --version
```

---

## 6. 프로젝트 디렉토리 설정

```bash
# 프로젝트 디렉토리 생성
sudo mkdir -p /opt/nexus
sudo chown -R $USER:$USER /opt/nexus

# 데이터 디렉토리 (DB, 로그 등)
sudo mkdir -p /opt/nexus-data/{postgres,redis,logs}
sudo chown -R $USER:$USER /opt/nexus-data
```

---

## 7. Cloudflare Tunnel 설정 (외부 접속용)

### 7.1 Cloudflared 설치

```bash
# Cloudflare 패키지 레포 추가
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared jammy main' | sudo tee /etc/apt/sources.list.d/cloudflared.list

sudo apt-get update
sudo apt-get install -y cloudflared
```

### 7.2 Cloudflare 로그인 및 터널 생성

```bash
# 브라우저 인증 (메인 PC에서 URL 열기)
cloudflared tunnel login

# 터널 생성
cloudflared tunnel create nexus

# 터널 ID 확인
cloudflared tunnel list
```

### 7.3 터널 설정 파일

```bash
# 설정 파일 생성
mkdir -p ~/.cloudflared
vim ~/.cloudflared/config.yml
```

```yaml
# ~/.cloudflared/config.yml
tunnel: <TUNNEL_ID>
credentials-file: /home/nexus/.cloudflared/<TUNNEL_ID>.json

ingress:
  # 프론트엔드 (Next.js)
  - hostname: nexus.yourdomain.com
    service: http://localhost:3000

  # API (NestJS)
  - hostname: api.nexus.yourdomain.com
    service: http://localhost:4000

  # WebSocket
  - hostname: ws.nexus.yourdomain.com
    service: http://localhost:4000

  # 404 fallback
  - service: http_status:404
```

### 7.4 터널 서비스 등록

```bash
# 시스템 서비스로 등록
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared

# 상태 확인
sudo systemctl status cloudflared
```

---

## 8. Git 설정 (배포용)

### 8.1 SSH 키 생성

```bash
ssh-keygen -t ed25519 -C "nexus-server"
cat ~/.ssh/id_ed25519.pub
```

### 8.2 GitHub/GitLab에 Deploy Key 등록

1. 위 공개키를 복사
2. GitHub Repository → Settings → Deploy keys → Add deploy key

---

## 9. 서버 모니터링 설정

### 9.1 시스템 모니터링 스크립트

```bash
vim ~/check-server.sh
```

```bash
#!/bin/bash
echo "=== Nexus Server Status ==="
echo ""
echo "=== System ==="
uptime
echo ""
echo "=== Memory ==="
free -h
echo ""
echo "=== Disk ==="
df -h /
echo ""
echo "=== Docker Containers ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "=== Recent Logs ==="
docker compose -f /opt/nexus/docker-compose.yml logs --tail=10
```

```bash
chmod +x ~/check-server.sh
```

### 9.2 자동 재시작 설정

```bash
# Docker 컨테이너 자동 재시작은 docker-compose.yml에서 설정
# restart: unless-stopped
```

---

## 10. 백업 스크립트

```bash
vim ~/backup.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/opt/nexus-data/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# PostgreSQL 백업
docker exec nexus-postgres pg_dump -U nexus nexus > $BACKUP_DIR/postgres_$DATE.sql

# 30일 이상 된 백업 삭제
find $BACKUP_DIR -type f -mtime +30 -delete

echo "Backup completed: $DATE"
```

```bash
chmod +x ~/backup.sh

# Cron 등록 (매일 새벽 3시 백업)
crontab -e
# 추가: 0 3 * * * /home/nexus/backup.sh
```

---

## 11. GPU 분리 후 Headless 운영

서버 설정이 완료되면:

1. 서버 PC 종료
2. GPU를 메인 PC로 반환
3. 서버 PC 전원 ON (모니터 없이)
4. 메인 PC에서 SSH로 접속하여 관리

### Headless 확인

```bash
# 메인 PC에서
ssh nexus@192.168.0.100

# 서버 상태 확인
~/check-server.sh
```

---

## 12. 유용한 명령어 모음

```bash
# 서버 재부팅
sudo reboot

# Docker 컨테이너 전체 재시작
cd /opt/nexus && docker compose restart

# 로그 실시간 확인
docker compose logs -f

# 특정 서비스 로그
docker compose logs -f api
docker compose logs -f web

# 리소스 사용량 확인
htop
docker stats

# 네트워크 포트 확인
sudo netstat -tlnp

# 방화벽 상태
sudo ufw status
```

---

## 다음 단계

서버 설정이 완료되면:

1. 개발 PC에서 프로젝트 생성 (Monorepo)
2. GitHub 레포지토리 생성 및 Push
3. 서버에서 `git clone` 후 Docker Compose로 실행
4. Cloudflare DNS 설정으로 도메인 연결

---

## 트러블슈팅

### SSH 접속 불가
```bash
# 서버 PC에 직접 접속하여
sudo systemctl status ssh
sudo systemctl restart ssh
```

### Docker 권한 오류
```bash
sudo usermod -aG docker $USER
# 로그아웃 후 다시 로그인
```

### 포트 이미 사용 중
```bash
sudo lsof -i :3000
sudo kill -9 <PID>
```
