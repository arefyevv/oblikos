#!/usr/bin/env bash
set -euo pipefail
umask 077
# Requires root; production env uses shell-compatible KEY=value, quotes if needed.
# Neither database passwords nor dump content are printed.
source /etc/oblikos/production.env
: "${MEDIA_STORAGE_DIR:?}" "${POSTGRES_USER:?}" "${POSTGRES_DB:?}"
[[ "$MEDIA_STORAGE_DIR" = /* && -d "$MEDIA_STORAGE_DIR" && ! -L "$MEDIA_STORAGE_DIR" ]] || exit 1
backup_root=/var/backups/oblikos
backup_dir="$backup_root/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"
chmod 700 "$backup_root" "$backup_dir"
cd /opt/oblikos/current
# Releases do not include the installation's compose file. Locate the running
# database using its stable Compose labels, independently of the current release.
postgres_container=$(docker ps --filter label=com.docker.compose.project=oblikos --filter label=com.docker.compose.service=postgres --format '{{.ID}}')
[[ "$postgres_container" =~ ^[a-f0-9]{12}$ ]] || { echo 'Expected exactly one running Oblik OS PostgreSQL container.' >&2; exit 1; }
# Stop writes for a consistent DB/media pair. Restart on failure too.
was_running=false
worker_running=false
if systemctl is-active --quiet oblikos-video-worker; then worker_running=true; systemctl stop oblikos-video-worker; fi
trap 'if $was_running; then systemctl start oblikos; fi; if $worker_running; then systemctl start oblikos-video-worker; fi' EXIT
if systemctl is-active --quiet oblikos; then was_running=true; systemctl stop oblikos; fi
docker exec "$postgres_container" pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format=custom > "$backup_dir/database.dump"
tar -C "$MEDIA_STORAGE_DIR" -czf "$backup_dir/media.tar.gz" .
docker exec -i "$postgres_container" pg_restore --list < "$backup_dir/database.dump" > /dev/null
tar -tzf "$backup_dir/media.tar.gz" > /dev/null
(cd "$backup_dir" && sha256sum database.dump media.tar.gz > SHA256SUMS)
touch "$backup_dir/COMPLETE"
echo "Backup pair complete: $backup_dir"
