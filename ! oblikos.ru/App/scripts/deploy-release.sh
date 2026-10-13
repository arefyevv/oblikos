#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
release=${1:?Release ID required}
[[ "$release" =~ ^[0-9]{8}-[0-9]{6}-[a-f0-9]{8}$ ]] || exit 1
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
root=/opt/oblikos
exec 9>"$root/deploy.lock"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
[[ -L "$root/current" ]] || { echo 'current must be a release symlink.' >&2; exit 1; }
previous=$(readlink -f "$root/current")
[[ "$previous" == "$root/releases/"* && -d "$previous" ]] || exit 1
available_kb=$(df -Pk "$root/releases" | awk 'NR==2 {print $4}')
[[ "$available_kb" =~ ^[0-9]+$ ]] || { echo 'Cannot determine available disk space.' >&2; exit 1; }
if (( available_kb < 2097152 )); then
  echo "Not enough disk space to build a release: ${available_kb} KB available, at least 2 GB required. Clean old release build files before retrying." >&2
  exit 1
fi
target="$root/releases/$release"
[[ ! -e "$target" ]] || exit 1
mkdir "$target"
tar -xzf "$root/releases/$release.tar.gz" -C "$target" --no-same-owner

# Ordinary updates never alter the database. Changed Prisma files require proof
# that the separately migrated database already matches this release.
prisma_changed=false
if ! diff -qr "$previous/prisma" "$target/prisma" >/dev/null; then
  prisma_changed=true
  for old_migration in "$previous"/prisma/migrations/*; do
    name=$(basename "$old_migration")
    diff -qr "$old_migration" "$target/prisma/migrations/$name" >/dev/null || {
      echo "Existing migration changed or missing: $name. Deployment stopped." >&2
      exit 1
    }
  done
fi
app_user=$(systemctl show oblikos --property=User --value)
app_group=$(systemctl show oblikos --property=Group --value)
[[ -n "$app_user" ]] || app_user=root
[[ -n "$app_group" ]] || app_group=$(id -gn "$app_user")
exec_start=$(systemctl show oblikos --property=ExecStart --value)
node_path=$(printf '%s' "$exec_start" | sed -n 's/.*path=\([^ ;]*\).*/\1/p')
[[ -x "$node_path" ]] || { echo 'Cannot find service Node executable.' >&2; exit 1; }
export PATH="$(dirname "$node_path"):$PATH"
[[ $(node -p 'process.versions.node.split(".")[0]') == 24 ]] || { echo 'Node 24 required.' >&2; exit 1; }
set -a
source /etc/oblikos/production.env
set +a
export NODE_ENV=production
chown -R "$app_user:$app_group" "$target"
echo 'Installing dependencies and building the new release. Current site stays online.'
runuser -u "$app_user" -- bash -c 'cd "$1" && npm ci --include=dev' bash "$target"
if [[ "$prisma_changed" == true ]]; then
  echo 'Checking separately applied migrations and database schema. No database changes will be made.'
  runuser -u "$app_user" -- bash -c 'cd "$1" && npm run db:status && node node_modules/prisma/build/index.js migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code' bash "$target"
fi
runuser -u "$app_user" -- bash -c 'cd "$1" && npm run build' bash "$target"

port=$(printf '%s' "$exec_start" | sed -n 's/.*--port[ =]\([0-9][0-9]*\).*/\1/p')
port=${port:-${PORT:-3000}}
[[ "$port" =~ ^[0-9]+$ ]] || exit 1
switched=false
worker_running=false
if systemctl is-active --quiet oblikos-video-worker; then worker_running=true; fi
rollback() {
  local status=${1:-$?}
  trap - ERR INT TERM
  if [[ "$switched" == true ]]; then
    echo 'New release failed. Restoring the previous release.' >&2
    ln -s "$previous" "$root/current.rollback-$release"
    mv -Tf "$root/current.rollback-$release" "$root/current"
    systemctl restart oblikos || true
    if [[ "$worker_running" == true ]]; then systemctl restart oblikos-video-worker || true; fi
  fi
  exit "$status"
}
trap rollback ERR
trap 'rollback 130' INT
trap 'rollback 143' TERM
ln -s "$target" "$root/current.next-$release"
switched=true
mv -Tf "$root/current.next-$release" "$root/current"
systemctl restart oblikos
if [[ "$worker_running" == true ]]; then systemctl restart oblikos-video-worker; fi
healthy=false
for attempt in $(seq 1 20); do
  if systemctl is-active --quiet oblikos && curl --fail --silent --max-time 2 "http://127.0.0.1:$port/api/health" >/dev/null; then
    healthy=true
    break
  fi
  sleep 2
done
[[ "$healthy" == true ]] || { echo 'Health check failed.' >&2; false; }
if [[ "$worker_running" == true ]]; then systemctl is-active --quiet oblikos-video-worker; fi
trap - ERR INT TERM
rm -f "$root/releases/$release.tar.gz" "$root/releases/$release.sh"
echo "Deployment successful: $release. Previous release retained: $previous"
