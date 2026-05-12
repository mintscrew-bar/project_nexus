# WSL2 ext4.vhdx compact 자동화 — Windows PowerShell 관리자 권한으로 실행.
# - WSL 종료 → vhdx compact → WSL 부팅 → 컨테이너 재기동
# - 사이트 다운타임 ~5~15분 발생 (정비 창에만 실행 권장)
# - Discord webhook 으로 시작/종료 알림 (옵션)
#
# 사용 (Task Scheduler 등록 예시):
#   schtasks /Create /TN "WSL Compact" /TR "powershell -ExecutionPolicy Bypass -File C:\path\wsl-compact.ps1" /SC MONTHLY /D 1 /ST 04:00 /RL HIGHEST
#
# 환경 변수(또는 -WebhookUrl 인자):
#   DISK_AUTOMATION_WEBHOOK_URL  Discord webhook URL

param(
    [string]$WebhookUrl = $env:DISK_AUTOMATION_WEBHOOK_URL,
    [string]$WslDistro = "Ubuntu",
    [string]$ProjectPath = "/home/haru/projects/nexus",
    [string]$ComposeFile = "docker-compose.prod.yml",
    [string]$EnvFile = "/home/haru/projects/nexus/.env.production"
)

$ErrorActionPreference = "Continue"

function Send-Notify($content) {
    if (-not $WebhookUrl) { return }
    try {
        $body = @{ content = $content } | ConvertTo-Json -Compress
        Invoke-RestMethod -Uri $WebhookUrl -Method Post -ContentType "application/json" -Body $body | Out-Null
    } catch {
        Write-Host "[notify] webhook 실패: $($_.Exception.Message)"
    }
}

function Get-VhdxSizeGB($path) {
    if (Test-Path $path) {
        return [math]::Round((Get-Item $path).Length / 1GB, 2)
    }
    return 0
}

# 1) vhdx 파일 찾기
Write-Host "[1/6] vhdx 파일 검색 중..."
$vhdx = Get-ChildItem -Path "$env:LOCALAPPDATA\Packages\*\LocalState\ext4.vhdx" -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match $WslDistro -or $_.FullName -match "Canonical" } |
        Select-Object -First 1

if (-not $vhdx) {
    # 폴백: 첫 번째 ext4.vhdx 사용
    $vhdx = Get-ChildItem -Path "$env:LOCALAPPDATA\Packages\*\LocalState\ext4.vhdx" -ErrorAction SilentlyContinue |
            Select-Object -First 1
}

if (-not $vhdx) {
    Write-Error "ext4.vhdx 를 찾지 못했습니다. WslDistro 인자를 확인하세요."
    Send-Notify "❌ **WSL compact 실패** — vhdx 파일을 찾지 못함"
    exit 1
}

$vhdxPath = $vhdx.FullName
$sizeBefore = Get-VhdxSizeGB $vhdxPath
Write-Host "  대상: $vhdxPath ($sizeBefore GB)"

Send-Notify "🔧 **WSL 정비 시작** (예상 다운타임 5~15분)`n- vhdx: \`$sizeBefore GB\`"

# 2) 컨테이너 graceful stop (WSL 내부에서)
Write-Host "[2/6] Docker 컨테이너 정지 중..."
wsl -d $WslDistro -- bash -c "cd $ProjectPath && docker compose -f $ComposeFile --env-file $EnvFile stop" 2>&1 | ForEach-Object { Write-Host "  $_" }

# 3) WSL 종료
Write-Host "[3/6] WSL 종료 중..."
wsl --shutdown
Start-Sleep -Seconds 5

# 4) vhdx compact (diskpart 사용 — Hyper-V 모듈 없이도 동작)
Write-Host "[4/6] vhdx compact 중 (시간 소요)..."
$diskpartScript = @"
select vdisk file="$vhdxPath"
attach vdisk readonly
compact vdisk
detach vdisk
exit
"@
$tmpScript = New-TemporaryFile
Set-Content -Path $tmpScript -Value $diskpartScript -Encoding ASCII
$diskpartOutput = & diskpart /s $tmpScript 2>&1
Remove-Item $tmpScript -Force
Write-Host "  diskpart 출력:"
$diskpartOutput | ForEach-Object { Write-Host "    $_" }

$sizeAfter = Get-VhdxSizeGB $vhdxPath
$reclaimed = [math]::Round($sizeBefore - $sizeAfter, 2)
Write-Host "  회수: $reclaimed GB ($sizeBefore → $sizeAfter GB)"

# 5) WSL 재부팅 (echo 명령으로 distro 깨우기)
Write-Host "[5/6] WSL 재부팅 중..."
wsl -d $WslDistro -- echo "WSL 부팅됨"
Start-Sleep -Seconds 10  # systemd / docker 데몬 시작 대기

# 6) 컨테이너 재기동
Write-Host "[6/6] Docker 컨테이너 재기동 중..."
wsl -d $WslDistro -- bash -c "cd $ProjectPath && docker compose -f $ComposeFile --env-file $EnvFile up -d" 2>&1 | ForEach-Object { Write-Host "  $_" }

Write-Host "`n=== 완료 ==="
Write-Host "vhdx: $sizeBefore GB → $sizeAfter GB (-$reclaimed GB)"

Send-Notify "✅ **WSL 정비 완료**`n- vhdx: \`$sizeBefore GB → $sizeAfter GB\` (\`-$reclaimed GB\` 회수)`n- 컨테이너 재기동 완료"
