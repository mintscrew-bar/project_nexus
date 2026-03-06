# Riot Tournament API 설정 스크립트 (PowerShell)
# 사용법: .\scripts\setup-tournament.ps1

Write-Host "🚀 Riot Tournament API 설정 시작`n" -ForegroundColor Green

# .env 파일 경로
$envFile = ".\.env"

# .env 파일이 있는지 확인
if (-not (Test-Path $envFile)) {
    Write-Host "❌ .env 파일을 찾을 수 없습니다." -ForegroundColor Red
    exit 1
}

# .env 파일 읽기
$envContent = Get-Content $envFile -Raw
$env = @{}

foreach ($line in ($envContent -split "`n")) {
    $line = $line.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        $parts = $line -split "=", 2
        if ($parts.Count -eq 2) {
            $env[$parts[0].Trim()] = $parts[1].Trim()
        }
    }
}

# RIOT_API_KEY 확인
$apiKey = $env["RIOT_API_KEY"]

if (-not $apiKey) {
    Write-Host "❌ RIOT_API_KEY가 .env 파일에 설정되어 있지 않습니다." -ForegroundColor Red
    exit 1
}

Write-Host "✅ API Key 확인 완료`n" -ForegroundColor Green

# API Base URL
$baseUrl = "https://americas.api.riotgames.com"

# 1. Provider 생성
Write-Host "📡 Provider 생성 중..." -ForegroundColor Yellow

$providerBody = @{
    region = "KR"
    url = "http://localhost:4000/api/webhooks/riot/tournament"
} | ConvertTo-Json

$headers = @{
    "X-Riot-Token" = $apiKey
    "Content-Type" = "application/json"
}

try {
    $providerResponse = Invoke-RestMethod -Uri "$baseUrl/lol/tournament-stub/v5/providers" `
        -Method Post `
        -Headers $headers `
        -Body $providerBody

    $providerId = $providerResponse
    Write-Host "✅ Provider 생성 완료: $providerId`n" -ForegroundColor Green
}
catch {
    Write-Host "❌ Provider 생성 실패" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

# 잠시 대기 (Rate Limit 방지)
Start-Sleep -Seconds 1

# 2. Tournament 생성
Write-Host "📡 Tournament 생성 중..." -ForegroundColor Yellow

$tournamentBody = @{
    name = "Nexus In-House Tournament"
    providerId = [int]$providerId
} | ConvertTo-Json

try {
    $tournamentResponse = Invoke-RestMethod -Uri "$baseUrl/lol/tournament-stub/v5/tournaments" `
        -Method Post `
        -Headers $headers `
        -Body $tournamentBody

    $tournamentId = $tournamentResponse
    Write-Host "✅ Tournament 생성 완료: $tournamentId`n" -ForegroundColor Green
}
catch {
    Write-Host "❌ Tournament 생성 실패" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

# 3. .env 파일 업데이트
Write-Host "📝 .env 파일 업데이트 중..." -ForegroundColor Yellow

$envLines = Get-Content $envFile

$providerUpdated = $false
$tournamentUpdated = $false
$newLines = @()

foreach ($line in $envLines) {
    if ($line -match "^RIOT_TOURNAMENT_PROVIDER_ID=") {
        $newLines += "RIOT_TOURNAMENT_PROVIDER_ID=$providerId"
        $providerUpdated = $true
    }
    elseif ($line -match "^RIOT_TOURNAMENT_ID=") {
        $newLines += "RIOT_TOURNAMENT_ID=$tournamentId"
        $tournamentUpdated = $true
    }
    else {
        $newLines += $line
    }
}

# 새 값 추가 (존재하지 않으면)
if (-not $providerUpdated) {
    $newLines += "RIOT_TOURNAMENT_PROVIDER_ID=$providerId"
}
if (-not $tournamentUpdated) {
    $newLines += "RIOT_TOURNAMENT_ID=$tournamentId"
}

# 파일 저장
$newLines | Set-Content $envFile -Encoding UTF8

Write-Host "✅ .env 파일 업데이트 완료`n" -ForegroundColor Green

# 완료
Write-Host "🎉 Tournament API 설정 완료!`n" -ForegroundColor Green
Write-Host "생성된 ID:"
Write-Host "  Provider ID: $providerId" -ForegroundColor Yellow
Write-Host "  Tournament ID: $tournamentId" -ForegroundColor Yellow
Write-Host "`n이제 서버를 재시작하면 Tournament Code를 생성할 수 있습니다." -ForegroundColor Green
