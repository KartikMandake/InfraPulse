# ==============================================================================
# InfraPulse - Database Restore Automation Script (PowerShell)
# Usage: .\scripts\restore-db.ps1 -BackupFile ".\backups\infrapulse_backup_xxx.sql"
# ==============================================================================
param(
    [Parameter(Mandatory=$true)]
    [string]$BackupFile,
    [string]$DbName = $env:PGDATABASE,
    [string]$DbUser = $env:PGUSER,
    [string]$DbHost = $env:PGHOST,
    [string]$DbPort = $env:PGPORT
)

if (-not $DbName) { $DbName = "infrapulse" }
if (-not $DbUser) { $DbUser = "postgres" }
if (-not $DbHost) { $DbHost = "localhost" }
if (-not $DbPort) { $DbPort = "5434" }

if (-not (Test-Path $BackupFile)) {
    Write-Host "[Restore Error] Backup file not found: $BackupFile" -ForegroundColor Red
    exit 1
}

Write-Host "[Restore] Restoring database '$DbName' on ${DbHost}:$DbPort from '$BackupFile'..." -ForegroundColor Cyan

try {
    if (Get-Command pg_restore -ErrorAction SilentlyContinue) {
        & pg_restore -h $DbHost -p $DbPort -U $DbUser -d $DbName --clean --if-exists $BackupFile
        if ($LASTEXITCODE -ne 0) { throw "pg_restore failed with exit code $LASTEXITCODE." }
    } else {
        Write-Host "[Restore] Local pg_restore CLI not detected. Attempting Docker restore..." -ForegroundColor Yellow
        $container = "infrapulse-postgres-staging"
        $running = docker ps --format '{{.Names}}'
        if ($running -notcontains $container) {
            $container = "infrapulse-postgres"
        }
        # Copy the custom archive as bytes; PowerShell text pipelines corrupt it.
        $containerFile = "/tmp/infrapulse_restore_$([guid]::NewGuid().ToString('N')).dump"
        try {
            docker cp $BackupFile "${container}:$containerFile"
            if ($LASTEXITCODE -ne 0) { throw "Copying the restore archive failed with exit code $LASTEXITCODE." }
            docker exec $container pg_restore -U $DbUser -d $DbName --clean --if-exists $containerFile
            if ($LASTEXITCODE -ne 0) { throw "Container pg_restore failed with exit code $LASTEXITCODE." }
        } finally {
            docker exec $container rm -f $containerFile
        }
    }

    Write-Host "[Restore Complete] Database '$DbName' restored successfully from $BackupFile." -ForegroundColor Green
} catch {
    Write-Host "[Restore Error]: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

