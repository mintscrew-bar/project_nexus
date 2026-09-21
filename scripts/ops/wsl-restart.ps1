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
#     6. reopen the Claude Code session that was killed along with the VM,
#        and verify it actually came back instead of assuming it did
#
#   It MUST run outside WSL. Launched from inside, it dies at step 1.
#   Everything is logged, because the caller is gone by step 2.
#
# HOW TO LAUNCH IT (this part is not optional)
#   Register it as a scheduled task and run that. Do NOT launch it with
#   Start-Process from inside WSL: verified 2026-09-21, an interop-launched
#   child survives the parent but never executes its body, so the restart
#   silently never happens and the site stays down. Task Scheduler runs under
#   its own service and is unaffected by the VM going away.
#
#     $s = Join-Path $env:APPDATA 'CodexWslKeepAlive\wsl-restart.ps1'
#     schtasks /Create /TN NexusWslPlannedRestart /F /SC ONCE /ST 23:59 /IT ^
#       /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"$s\" -ResumeSession <id>"
#     schtasks /Run /TN NexusWslPlannedRestart
#
#   /IT is required for step 6 to be able to open a window. The task deletes
#   itself at the end.
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
    [string]$TaskName = "NexusWslPlannedRestart",
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
#
# The resume command goes into a .cmd launcher instead of being handed to
# Start-Process directly. Measured 2026-09-21 under Task Scheduler - the same
# context this script really runs in - old launch vs new launch: old=False,
# new=True. The old form was
#   -ArgumentList "-NoExit","-Command","& '$Wsl' ... bash -lc `"$resumeCmd`""
# and it never ran anything. Win32_Process shows a command line that still has
# the quotes, which is what makes this so easy to misdiagnose, but by the time
# the child PowerShell re-parses everything after -Command the CRT has already
# eaten them, so it sees a bare
#   bash -lc cd /home/haru/projects/nexus && claude --resume <id> '/rc'
# and dies with "'&&' is not a valid statement separator in this version".
# A window opens, shows a parse error, and that is all. Meanwhile this script
# logged "opened a terminal running: ..." because nothing ever checked.
#
# cmd.exe has no such re-parse and keeps the quotes. The file also stays on
# disk, so a failed launch is one double click away from being fixed by hand.
Write-Log "step 6/6: Claude session"
if ($ResumeSession) {
    $resumeCmd = "cd $ProjectDir && claude --resume $ResumeSession '$ResumePrompt'"
    $cmdPath   = Join-Path $LogDir "claude-resume.cmd"
    $hintPath  = Join-Path $LogDir "claude-resume.txt"

    # ASCII on purpose - cmd.exe is fussier about encoding than PowerShell is.
    $cmdBody = @"
@echo off
title Nexus - resume Claude session
"$Wsl" -d $Distro -- bash -lc "$resumeCmd"
echo.
echo Session ended. Press any key to close.
pause >nul
"@
    Set-Content -Path $cmdPath -Value $cmdBody -Encoding ASCII

    Set-Content -Path $hintPath -Value @"
Resume the Claude Code session that was killed by this restart.

Easiest: double click
  $cmdPath

Or from a Windows shell:
  wsl -d $Distro -- bash -lc "$resumeCmd"

Or from a shell already inside WSL:
  $resumeCmd

The trailing '$ResumePrompt' turns remote control back on - the operator drives
this box from another device, so a session that resumes without it is
unreachable to them. If the session comes up without it, just type it as the
first message.
"@
    Write-Log "  resume command written to $cmdPath"

    if ($NoResumeWindow) {
        Write-Log "  -NoResumeWindow given, not launching. See $hintPath"
    } else {
        # Claude stores transcripts per project, encoding the path by turning
        # / and . into -. Note the launch time first: the check below is "did
        # any transcript get written after this moment", which also catches the
        # case where claude forks to a new id instead of appending.
        $slug   = ($ProjectDir -replace '[/.]', '-')
        $txDir  = "`$HOME/.claude/projects/$slug"
        $marker = "$(Invoke-InWsl 'date +%s' | Select-Object -First 1)".Trim()

        Start-Process -FilePath $cmdPath -WorkingDirectory $LogDir
        Write-Log "  launched $cmdPath (transcript dir $txDir, marker $marker)"

        # Do NOT report success just because Start-Process returned. That is
        # exactly the lie the old version told. A live session appends to its
        # .jsonl within a couple of seconds of answering the first prompt.
        $resumed = $false
        $waited  = 0
        for ($i = 1; $i -le 12; $i++) {
            Start-Sleep -Seconds 5
            $waited = $i * 5
            $hits = "$(Invoke-InWsl "find $txDir -maxdepth 1 -name '*.jsonl' -newermt '@$marker' 2>/dev/null | wc -l" | Select-Object -First 1)".Trim()
            if (($hits -as [int]) -gt 0) { $resumed = $true; break }
        }
        if ($resumed) {
            Write-Log "  session resumed - transcript activity after ${waited}s"
        } else {
            Write-Log "  FAIL: no transcript activity in ${waited}s. The session did NOT resume."
            Write-Log "        Everything else is up; this is the one step that needs a hand."
            Write-Log "        Re-run by hand: $cmdPath   (details in $hintPath)"
        }
    }
} else {
    Write-Log "  no -ResumeSession given, skipping"
}

# --- 7. clean up ------------------------------------------------------------
# One-shot task. Leaving it registered would keep a stale -ResumeSession id
# around and invite someone to re-run it by accident.
if ($TaskName) {
    & schtasks /Delete /TN $TaskName /F 2>&1 | Out-Null
    Write-Log "step 7/7: removed scheduled task $TaskName"
}

Write-Log "=== done (containers $running/$ExpectedContainers, site ok=$siteOk) ==="
