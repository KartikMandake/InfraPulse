# ==============================================================================
# InfraPulse - Database Backup Automation Script
# Usage: .\scripts\backup-db.ps1 [-BackupDir ".\backups"]
# ==============================================================================
param(
    [string]$BackupDir = ".\backups",
    [string]$DbName = $env:PGDATABASE,
    [string]$DbUser = $env:PGUSER,
    [string]$DbHost = $env:PGHOST,
    [string]$DbPort = $env:PGPORT
)

if (-not $DbName) { $DbName = "infrapulse" }
if (-not $DbUser) { $DbUser = "postgres" }
if (-not $DbHost) { $DbHost = "localhost" }
if (-not $DbPort) { $DbPort = "5434" }

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$OutputFile = Join-Path $BackupDir "infrapulse_backup_$Timestamp.sql"

Write-Host "[Backup] Creating PostgreSQL snapshot for database '$DbName' on $DbHost:$DbPort..." -ForegroundColor Cyan

try {
    # Check if pg_dump is available locally or execute via docker
    if (Get-Command pg_dump -ErrorAction SilentlyContinue) {
        & pg_dump -h $DbHost -p $DbPort -U $DbUser -d $DbName -F c -f $OutputFile
    } else {
        Write-Host "[Backup] Local pg_dump CLI not detected in PATH. Attempting Docker snapshot..." -ForegroundColor Yellow
        docker exec infrapulse-postgres pg_dump -U $DbUser -d $DbName > $OutputFile
    }

    if (Test-Path $OutputFile) {
        $FileSize = (Get-Item $OutputFile).Length
        Write-Host "[Backup Complete] Backup successfully written to $OutputFile ($FileSize bytes)." -ForegroundColor Green
    } else {
        throw "Backup file was not created."
    }
} catch {
    Write-Host "[Backup Error]: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

