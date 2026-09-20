# wsl-restart.ps1 - planned WSL restart that applies .wslconfig and brings
#                   everything back up, including the Claude Code session.
#
# WHY THIS EXISTS
#   .wslconfig changes only take effect after `wsl --shutdown`, and that takes
#   the production stack (labs-nexus.com) down with it.
#
#   A bare `wsl --shutdown` is NOT safe on this box. On 2026-09-21 the
#   CodexWslKeepAlive watchdog was found dead - its last log entry was
#   2026-09-17 and no wsl-watchdog.ps1 process was running - so nothing would
#   have started WSL again. The site would have sat on Cloudflare 1033 until
#   somebody noticed.
#
#   This script therefore owns the whole cycle instead of just the shutdown:
#     1. shut the VM down
#     2. start it back up
#     3. wait for the seven containers to return
#     4. verify the public URL actually answers
#     5. restart the watchdog so the next unplanned reboot self-heals
#     6. reopen the Claude Code session that was killed along with the VM
#
#   It MUST run outside WSL. Launched from inside, it dies at step 1.
#   Everything is logged, because the caller is gone by step 2.
#
# USAGE (from Windows)
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\ops\wsl-restart.ps1
#
# NOTE ON ENCODING
#   ASCII only, matching scripts/wsl-compact.ps1. Windows PowerShell 5.1 reads
#   BOM-less UTF-8 as ANSI, and a mojibake comment is not worth the risk in a
#   script that runs while the site is down.

param(
    [int]$DelaySeconds = 8,
    [string]$Distro = "Ubuntu-24.04",
    [string]$ResumeSession = "",
    # Sent as the first message of the resumed session. Remote control has to
    # come back on with it - the operator drives this box from another device,
    # so a session that resumes without /rc is unreachable to them.
    [string]$ResumePrompt = "/rc",
    [string]$ProjectDir = "/home/haru/projects/nexus",
    [int]$ContainerTimeoutSeconds = 240,
    [switch]$NoResumeWindow
)

$ErrorActionPreference = "Continue"

$LogDir = Join-Path $env:APPDATA "CodexWslKeepAlive"
$LogPath = Join-Path $LogDir "wsl-restart.log"
$WatchdogPath = Join-Path $LogDir "wsl-watchdog.ps1"
$Wsl = "$env:WINDIR\System32\wsl.exe"
$ExpectedContainers = 7

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-Log {
    param([string]$Message)
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss K"
    $line = "[$stamp] $Message"
    Add-Content -Path $LogPath -Value $line
    Write-Host $line
}

function Invoke-InWsl {
    param([string]$Command)
    & $Wsl -d $Distro --exec sh -lc $Command 2>&1
}

Write-Log "=== planned WSL restart requested ==="
Write-Log "distro=$Distro delay=${DelaySeconds}s resume=$ResumeSession"

# Give the caller a moment to finish writing its final output before the VM
# disappears underneath it.
Start-Sleep -Seconds $DelaySeconds

# --- 1. shut down -----------------------------------------------------------
Write-Log "step 1/6: wsl --shutdown"
& $Wsl --shutdown
Start-Sleep -Seconds 10

# --- 2. start back up -------------------------------------------------------
# Any command boots the distro; /etc/wsl.conf has systemd=true so PID 1 comes
# up and with it docker, the restart-policy containers and nexus.timer.
Write-Log "step 2/6: starting distro"
$booted = $false
for ($i = 1; $i -le 6; $i++) {
    Invoke-InWsl "true" | Out-Null
    if ($LASTEXITCODE -eq 0) { $booted = $true; break }
    Write-Log "  boot attempt $i failed (exit $LASTEXITCODE), retrying in 10s"
    Start-Sleep -Seconds 10
}
if (-not $booted) {
    Write-Log "FATAL: distro would not start. Site is DOWN (Cloudflare 1033)."
    Write-Log "       Recover by hand: wsl -d $Distro"
    exit 1
}
Write-Log "  distro is up"

# --- 3. wait for containers -------------------------------------------------
# Docker's restart:unless-stopped brings most of them back; nexus.timer fires
# nexus.service 20s after boot to reconcile anything missing.
Write-Log "step 3/6: waiting for $ExpectedContainers containers"
$deadline = (Get-Date).AddSeconds($ContainerTimeoutSeconds)
$running = 0
while ((Get-Date) -lt $deadline) {
    $names = Invoke-InWsl "docker ps --format '{{.Names}}'"
    $running = @($names | Where-Object { $_ -match '^nexus-' }).Count
    if ($running -ge $ExpectedContainers) { break }
    Start-Sleep -Seconds 5
}
Write-Log "  containers running: $running / $ExpectedContainers"
if ($running -lt $ExpectedContainers) {
    Write-Log "  WARNING: short of expected. Check: wsl -d $Distro -- docker ps -a"
    Write-Log "           and: wsl -d $Distro -- systemctl status nexus.service"
}

# --- 4. verify the site actually answers ------------------------------------
# Containers being up is not the same as the tunnel being registered. 1033 is
# exactly the case where everything looks fine locally and the site is down.
Write-Log "step 4/6: checking https://labs-nexus.com/healthz"
$siteOk = $false
for ($i = 1; $i -le 12; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri "https://labs-nexus.com/healthz" -TimeoutSec 10 -UseBasicParsing
        if ($resp.StatusCode -eq 200) { $siteOk = $true; break }
        Write-Log "  attempt ${i}: HTTP $($resp.StatusCode)"
    } catch {
        Write-Log "  attempt ${i}: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds 10
}
if ($siteOk) {
    Write-Log "  site is answering 200"
} else {
    Write-Log "  WARNING: site did not answer within ~2min."
    Write-Log "           Check the tunnel: wsl -d $Distro -- docker logs --tail 50 nexus-cloudflared"
}

# --- 5. restart the watchdog ------------------------------------------------
# It was dead before this restart. Without it the next unplanned reboot does
# not self-heal, which is how 2026-09-20 turned into a five minute outage.
Write-Log "step 5/6: restarting keepalive watchdog"
$alive = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
    Where-Object { $_.CommandLine -like "*wsl-watchdog.ps1*" }
if ($alive) {
    Write-Log "  already running (pid $($alive.ProcessId))"
} elseif (Test-Path $WatchdogPath) {
    Start-Process -FilePath "powershell.exe" `
        -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", $WatchdogPath
    Start-Sleep -Seconds 3
    $now = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
        Where-Object { $_.CommandLine -like "*wsl-watchdog.ps1*" }
    if ($now) { Write-Log "  started (pid $($now.ProcessId))" }
    else { Write-Log "  WARNING: watchdog did not stay up - check $LogDir\wsl-watchdog.log" }
} else {
    Write-Log "  WARNING: $WatchdogPath not found, skipping"
}

# --- 6. bring the Claude session back ---------------------------------------
# The session lived inside WSL and died with it. The transcript survives on
# disk, so it can be resumed by id.
Write-Log "step 6/6: Claude session"
if ($ResumeSession) {
    $resumeCmd = "cd $ProjectDir && claude --resume $ResumeSession '$ResumePrompt'"
    $hintPath = Join-Path $LogDir "claude-resume.txt"
    Set-Content -Path $hintPath -Value @"
Resume the Claude Code session that was killed by this restart:

  wsl -d $Distro -- bash -lc "$resumeCmd"

Or from a shell already inside WSL:

  cd $ProjectDir && claude --resume $ResumeSession '$ResumePrompt'

The trailing '$ResumePrompt' turns remote control back on. If it does not run
by itself, the session is still interactive - just type it as the first message.
"@
    Write-Log "  resume command written to $hintPath"

    if (-not $NoResumeWindow) {
        Start-Process -FilePath "powershell.exe" `
            -ArgumentList "-NoExit", "-Command", "& '$Wsl' -d $Distro -- bash -lc `"$resumeCmd`""
        Write-Log "  opened a terminal running: $resumeCmd"
    }
} else {
    Write-Log "  no -ResumeSession given, skipping"
}

Write-Log "=== done (containers $running/$ExpectedContainers, site ok=$siteOk) ==="
