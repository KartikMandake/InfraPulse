#!/usr/bin/env bash
# ==============================================================================
# InfraPulse - Staging Database Backup Automation Script (POSIX / Linux / Docker)
# Usage: ./scripts/backup-db.sh [backup_directory]
# ==============================================================================
set -euo pipefail

BACKUP_DIR="${1:-./backups}"
DB_NAME="${PGDATABASE:-infrapulse_staging}"
DB_USER="${PGUSER:-postgres}"
DB_HOST="${PGHOST:-localhost}"
DB_PORT="${PGPORT:-5432}"

mkdir -p "${BACKUP_DIR}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
OUTPUT_FILE="${BACKUP_DIR}/infrapulse_${DB_NAME}_${TIMESTAMP}.sql"

echo "[Backup] Initiating PostgreSQL snapshot for database '${DB_NAME}' on ${DB_HOST}:${DB_PORT}..."

if command -v pg_dump >/dev/null 2>&1; then
    pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -F c -f "${OUTPUT_FILE}"
elif command -v docker >/dev/null 2>&1; then
    CONTAINER_NAME="infrapulse-postgres-staging"
    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        CONTAINER_NAME="infrapulse-postgres"
    fi
    echo "[Backup] Using Docker container: ${CONTAINER_NAME}..."
    docker exec "${CONTAINER_NAME}" pg_dump -U "${DB_USER}" -d "${DB_NAME}" -F c > "${OUTPUT_FILE}"
else
    echo "[Backup Error] Neither pg_dump nor docker is available in PATH." >&2
    exit 1
fi

if [[ -f "${OUTPUT_FILE}" && -s "${OUTPUT_FILE}" ]]; then
    SIZE=$(stat -c%s "${OUTPUT_FILE}" 2>/dev/null || stat -f%z "${OUTPUT_FILE}" 2>/dev/null || echo "unknown")
    echo "[Backup Complete] Snapshot successfully saved to ${OUTPUT_FILE} (${SIZE} bytes)."
else
    echo "[Backup Error] Snapshot file was not created or is empty." >&2
    exit 1
fi

