$deprecated = @'
DEPRECATED:
This script targeted the old `Ubuntu` WSL distro name and duplicates the
current systemd-based recovery path. Use /etc/systemd/system/nexus.service and
the Windows CodexWslWatchdog keepalive instead.
'@
Write-Host $deprecated

$log = "C:\scripts\nexus.log"

function Log($msg) {
    Add-Content $log "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - $msg"
}

Log "=== 부팅 시작 ==="

# 1. WSL 준비 대기 (최대 3분)
Log "WSL 대기 시작"
$wslReady = $false
for ($i = 0; $i -lt 18; $i++) {
    Start-Sleep -Seconds 10
    $result = wsl -d Ubuntu -u haru -- bash -c "echo ready" 2>&1
    if ($result -eq "ready") {
        $wslReady = $true
        Log "WSL 준비 완료 ($($($i+1)*10)초)"
        break
    }
    Log "WSL 대기 중... ($($($i+1)*10)초)"
}

if (-not $wslReady) {
    Log "WSL 시작 실패 — 종료"
    exit 1
}

# 2. Docker 데몬 대기 (최대 2분)
Log "Docker 데몬 대기 시작"
$dockerReady = $false
for ($i = 0; $i -lt 12; $i++) {
    Start-Sleep -Seconds 10
    $result = wsl -d Ubuntu -u haru -- bash -c "docker info > /dev/null 2>&1 && echo ready" 2>&1
    if ($result -eq "ready") {
        $dockerReady = $true
        Log "Docker 데몬 준비 완료 ($($($i+1)*10)초)"
        break
    }
    Log "Docker 대기 중... ($($($i+1)*10)초)"
}

if (-not $dockerReady) {
    Log "Docker 데몬 시작 실패 — 종료"
    exit 1
}

# 3. 컨테이너 기동
Log "컨테이너 기동 시작"
wsl -d Ubuntu -u haru -- bash -c "cd /home/haru/projects/nexus && docker compose -f docker-compose.prod.yml --env-file .env.production up -d" 2>&1 | ForEach-Object { Log $_ }

# 4. 헬스체크 (최대 2분)
Log "헬스체크 시작"
$healthy = $false
for ($i = 0; $i -lt 12; $i++) {
    Start-Sleep -Seconds 10
    $result = wsl -d Ubuntu -u haru -- bash -c "docker inspect nexus-api --format='{{.State.Health.Status}}'" 2>&1
    Log "nexus-api 상태: $result"
    if ($result -eq "healthy") {
        $healthy = $true
        Log "=== 모든 서비스 정상 기동 완료 ==="
        break
    }
}

if (-not $healthy) {
    Log "=== 헬스체크 실패 — 컨테이너 상태 덤프 ==="
    wsl -d Ubuntu -u haru -- bash -c "docker compose -f /home/haru/projects/nexus/docker-compose.prod.yml --env-file /home/haru/projects/nexus/.env.production ps" 2>&1 | ForEach-Object { Log $_ }
}
