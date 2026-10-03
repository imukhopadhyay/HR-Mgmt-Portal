#!/usr/bin/env bash
# Restore a backup INTO AN EMPTY DATABASE (e.g. a fresh staging DB or a
# recovery instance). Refuses to run against a non-empty database.
# Usage: TARGET_DATABASE_URL=... ./scripts/restore.sh backups/hrportal-XXXX.dump
set -euo pipefail
FILE="${1:?backup file required}"
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required}"
URL="${TARGET_DATABASE_URL%%\?*}"
sha256sum -c "$FILE.sha256"
TABLES=$(psql "$URL" -Atc "select count(*) from information_schema.tables where table_schema='public'")
if [ "$TABLES" != "0" ]; then
  echo "Refusing to restore: target database is not empty ($TABLES tables)." >&2
  exit 1
fi
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$URL" "$FILE"
echo "Restore complete. Verify with: npx prisma migrate status && the audit chain check in Admin → Audit trail."
