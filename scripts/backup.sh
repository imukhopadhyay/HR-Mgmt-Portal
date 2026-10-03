#!/usr/bin/env bash
# Logical backup of the HR Portal database (custom format, compressed).
# Usage: DATABASE_URL=... ./scripts/backup.sh [output-dir]
# Uses the DIRECT (non-pooled) connection string. Store backups encrypted,
# off-site, with restricted access — they contain personal data.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
OUT_DIR="${1:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
mkdir -p "$OUT_DIR"
umask 077
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT_DIR/hrportal-$STAMP.dump"
URL="${DATABASE_URL%%\?*}"   # strip ?schema=… (pg_dump does not accept it)
pg_dump --format=custom --compress=9 --no-owner --no-privileges --file="$FILE" "$URL"
pg_restore --list "$FILE" > /dev/null   # verify archive is readable
sha256sum "$FILE" > "$FILE.sha256"
echo "Backup written: $FILE ($(du -h "$FILE" | cut -f1))"
find "$OUT_DIR" -name 'hrportal-*.dump*' -mtime +"$RETENTION_DAYS" -print -delete
