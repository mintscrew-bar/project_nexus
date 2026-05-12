# WSL2 ext4.vhdx compact automation. Run as Administrator on Windows PowerShell.
# - Shut down WSL, compact vhdx, boot WSL back, restart Docker compose.
# - Site downtime ~5-15 min. Run only in maintenance window.
# - Discord webhook notifications (optional via env var or -WebhookUrl).
#
# Example Task Scheduler registration (one line):
#   schtasks /Create /TN "WSL Compact" /TR "powershell -ExecutionPolicy Bypass -File C:\nexus-ops\wsl-compact.ps1 -WslDistro Ubuntu-24.04" /SC MONTHLY /D 1 /ST 04:00 /RL HIGHEST /F
#
# Dry run (no downtime, verifies webhook + vhdx detection):
#   powershell -ExecutionPolicy Bypass -File C:\nexus-ops\wsl-compact.ps1 -WslDistro Ubuntu-24.04 -DryRun

param(
    [string]$WebhookUrl = $env:DISK_AUTOMATION_WEBHOOK_URL,
    [string]$WslDistro = "Ubuntu",
    [string]$ProjectPath = "/home/haru/projects/nexus",
    [string]$ComposeFile = "docker-compose.prod.yml",
    [string]$EnvFile = "/home/haru/projects/nexus/.env.production",
    # Explicit vhdx path override. If empty, auto-detect.
    [string]$VhdxPath = "",
    # DryRun: only verify detection + webhook, skip shutdown/compact (0 downtime).
    [switch]$DryRun
)

$ErrorActionPreference = "Continue"

function Send-Notify($content) {
    if (-not $WebhookUrl) { return }
    try {
        $body = @{ content = $content } | ConvertTo-Json -Compress
        Invoke-RestMethod -Uri $WebhookUrl -Method Post -ContentType "application/json" -Body $body | Out-Null
    } catch {
        Write-Host "[notify] webhook failed: $($_.Exception.Message)"
    }
}

function Get-VhdxSizeGB($path) {
    if (Test-Path $path) {
        return [math]::Round((Get-Item $path).Length / 1GB, 2)
    }
    return 0
}

# 1) Find vhdx
Write-Host "[1/6] Searching vhdx..."

if ($VhdxPath -and (Test-Path $VhdxPath)) {
    $vhdxPath = $VhdxPath
} else {
    # Search both legacy (Store-installed Packages) and modern (wsl --install) locations.
    $candidates = @()
    $candidates += Get-ChildItem -Path "$env:LOCALAPPDATA\wsl\*\ext4.vhdx" -ErrorAction SilentlyContinue
    $candidates += Get-ChildItem -Path "$env:LOCALAPPDATA\Packages\*\LocalState\ext4.vhdx" -ErrorAction SilentlyContinue

    # Prefer match on distro name when possible (legacy paths contain "Ubuntu" / "Canonical").
    $vhdx = $candidates | Where-Object { $_.FullName -match $WslDistro -or $_.FullName -match "Canonical" } | Select-Object -First 1
    if (-not $vhdx) { $vhdx = $candidates | Select-Object -First 1 }

    if (-not $vhdx) {
        Write-Error "ext4.vhdx not found. Pass -VhdxPath explicitly."
        Send-Notify "WSL compact FAILED: vhdx not found"
        exit 1
    }
    $vhdxPath = $vhdx.FullName
}
$sizeBefore = Get-VhdxSizeGB $vhdxPath
Write-Host "  target: $vhdxPath ($sizeBefore GB)"

if ($DryRun) {
    Write-Host "[DryRun] skipping actual compact. Verifying notify only."
    Send-Notify "WSL compact DRY RUN (no real work). vhdx: $sizeBefore GB"
    Send-Notify "DRY RUN done. webhook + script path verified."
    Write-Host ""
    Write-Host "=== DRY RUN done ==="
    Write-Host "vhdx: $sizeBefore GB (compact not executed)"
    exit 0
}

Send-Notify "WSL maintenance START (expected downtime 5-15 min). vhdx: $sizeBefore GB"

# 2) Stop containers gracefully
Write-Host "[2/6] Stopping containers..."
$cmd2 = "cd $ProjectPath; docker compose -f $ComposeFile --env-file $EnvFile stop"
wsl -d $WslDistro -- bash -c $cmd2 2>&1 | ForEach-Object { Write-Host "  $_" }

# 3) Shutdown WSL
Write-Host "[3/6] Shutting down WSL..."
wsl --shutdown
Start-Sleep -Seconds 5

# 4) Compact vhdx via diskpart (no Hyper-V module required)
Write-Host "[4/6] Compacting vhdx (takes time)..."
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
Write-Host "  diskpart output:"
$diskpartOutput | ForEach-Object { Write-Host "    $_" }

$sizeAfter = Get-VhdxSizeGB $vhdxPath
$reclaimed = [math]::Round($sizeBefore - $sizeAfter, 2)
Write-Host "  reclaimed: $reclaimed GB ($sizeBefore -> $sizeAfter GB)"

# 5) Boot WSL back up
Write-Host "[5/6] Booting WSL..."
wsl -d $WslDistro -- echo "WSL booted"
Start-Sleep -Seconds 10

# 6) Restart containers
Write-Host "[6/6] Restarting containers..."
$cmd6 = "cd $ProjectPath; docker compose -f $ComposeFile --env-file $EnvFile up -d"
wsl -d $WslDistro -- bash -c $cmd6 2>&1 | ForEach-Object { Write-Host "  $_" }

Write-Host ""
Write-Host "=== done ==="
Write-Host "vhdx: $sizeBefore GB -> $sizeAfter GB (-$reclaimed GB)"

Send-Notify "WSL maintenance DONE. vhdx: $sizeBefore GB -> $sizeAfter GB (reclaimed $reclaimed GB). containers up."
