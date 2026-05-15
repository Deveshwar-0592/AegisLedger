#!/bin/bash
set -e
TS=$(date +%Y%m%d_%H%M%S)
FILE="aegisledger_backup_${TS}.sql.gz"
BUCKET="${BACKUP_S3_BUCKET:-s3://aegisledger-backups}"
echo "[BACKUP] Starting $TS"
PGPASSWORD="$DB_PASSWORD" pg_dump --host="$DB_HOST" --username="$DB_USER" --dbname="$DB_NAME" --compress=9 | gzip > "/tmp/$FILE"
aws s3 cp "/tmp/$FILE" "$BUCKET/$FILE" --sse aws:kms
echo "[BACKUP] Uploaded $FILE to $BUCKET"
# Note: Date-based rotation removed (Fix 18). 
# Setup S3 Lifecycle Rules for rotation instead:
# aws s3api put-bucket-lifecycle-configuration \
#   --bucket ${BACKUP_BUCKET} \
#   --lifecycle-configuration file://lifecycle.json
# (Rule: expire backups/ after 30 days, transition to Glacier after 7 days)

# Disaster Recovery Runbook (Fix 9):
# - RTO target: 4 hours
# - RPO target: 1 hour
# - Reminder: Conduct a quarterly failover drill to eu-west-1.

rm -f "/tmp/$FILE"
echo "[BACKUP] Done"
