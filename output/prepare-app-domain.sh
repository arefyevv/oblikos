#!/usr/bin/env bash
set -euo pipefail
target=/etc/nginx/sites-available/oblikos-app
if [[ -e "$target" || -e /etc/nginx/sites-enabled/oblikos-app ]]; then
  echo 'App vhost already exists; inspect before changing.' >&2
  exit 1
fi
install -d -m 755 /var/www/oblikos-acme
cat > "$target" <<'NGINX'
server {
    listen 80;
    server_name app.oblikos.ru;
    location /.well-known/acme-challenge/ { root /var/www/oblikos-acme; }
    location / { return 503; }
    access_log off;
}
NGINX
ln -s "$target" /etc/nginx/sites-enabled/oblikos-app
if ! nginx -t; then
  unlink /etc/nginx/sites-enabled/oblikos-app
  exit 1
fi
systemctl reload nginx
echo 'ACME HTTP vhost ready.'
