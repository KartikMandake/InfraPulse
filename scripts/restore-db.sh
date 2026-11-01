#!/usr/bin/env bash
# ==============================================================================
# InfraPulse - Staging Database Restore Automation Script (POSIX / Linux / Docker)
# Usage: ./scripts/restore-db.sh <backup_file_path>
# ==============================================================================
set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <path_to_backup_file.sql>" >&2
    exit 1
fi

BACKUP_FILE="$1"
DB_NAME="${PGDATABASE:-infrapulse_staging}"
DB_USER="${PGUSER:-postgres}"
DB_HOST="${PGHOST:-localhost}"
DB_PORT="${PGPORT:-5432}"

if [[ ! -f "${BACKUP_FILE}" ]]; then
    echo "[Restore Error] Backup file does not exist: ${BACKUP_FILE}" >&2
    exit 1
fi

echo "[Restore] Restoring database '${DB_NAME}' from ${BACKUP_FILE}..."

if command -v pg_restore >/dev/null 2>&1; then
    pg_restore -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists "${BACKUP_FILE}"
elif command -v docker >/dev/null 2>&1; then
    CONTAINER_NAME="infrapulse-postgres-staging"
    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        CONTAINER_NAME="infrapulse-postgres"
    fi
    echo "[Restore] Using Docker container: ${CONTAINER_NAME}..."
    docker exec -i "${CONTAINER_NAME}" pg_restore -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists < "${BACKUP_FILE}"
else
    echo "[Restore Error] Neither pg_restore nor docker is available in PATH." >&2
    exit 1
fi

echo "[Restore Complete] Database '${DB_NAME}' restored successfully."

