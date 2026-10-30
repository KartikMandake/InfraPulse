# ==============================================================================
# InfraPulse - Production Release Verification & Health Probe
# Usage: .\scripts\verify-release.ps1 [-BaseUrl "http://localhost:5000"]
# ==============================================================================
param(
    [string]$BaseUrl = "http://localhost:5000"
)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " InfraPulse - Release Verification & Health Probe" -ForegroundColor Cyan
Write-Host " Target: $BaseUrl" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Probe Liveness
Write-Host "`n[Probe 1/3] Checking Liveness Endpoint (/api/health/live)..." -NoNewline
try {
    $LiveRes = Invoke-RestMethod -Uri "$BaseUrl/api/health/live" -Method Get -TimeoutSec 5
    if ($LiveRes.status -eq "LIVE") {
        Write-Host " [PASS] (Uptime: $($LiveRes.uptimeSeconds)s, PID: $($LiveRes.pid))" -ForegroundColor Green
    } else {
        Write-Host " [FAIL] Status: $($LiveRes.status)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host " [FAIL] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 2. Probe Readiness (Database Connectivity)
Write-Host "[Probe 2/3] Checking Readiness Endpoint (/api/health/ready)..." -NoNewline
try {
    $ReadyRes = Invoke-RestMethod -Uri "$BaseUrl/api/health/ready" -Method Get -TimeoutSec 5
    if ($ReadyRes.status -eq "READY" -and $ReadyRes.dependencies.database -eq "CONNECTED") {
        Write-Host " [PASS] (DB: Connected, Latency: $($ReadyRes.dependencies.latencyMs)ms)" -ForegroundColor Green
    } else {
        Write-Host " [FAIL] Status: $($ReadyRes.status)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host " [FAIL] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 3. Probe Core Operational Services
Write-Host "[Probe 3/3] Verifying Core Services Registry (/api/services)..." -NoNewline
try {
    $ServicesRes = Invoke-RestMethod -Uri "$BaseUrl/api/services" -Method Get -TimeoutSec 5
    if ($ServicesRes.data -and $ServicesRes.data.Count -gt 0) {
        Write-Host " [PASS] ($($ServicesRes.data.Count) mesh services verified)" -ForegroundColor Green
    } else {
        Write-Host " [WARN] Services returned empty array" -ForegroundColor Yellow
    }
} catch {
    Write-Host " [FAIL] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "`n[Release Verification Succeeded] Service is healthy, responsive, and ready for production traffic." -ForegroundColor Green
exit 0

