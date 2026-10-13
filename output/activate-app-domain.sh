#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ $(dig +short @ns1.reg.ru app.oblikos.ru A) == 159.194.211.8 ]] || { echo 'DNS_NOT_READY'; exit 2; }
[[ $(dig +short @ns2.reg.ru app.oblikos.ru A) == 159.194.211.8 ]] || { echo 'DNS_NOT_READY'; exit 2; }
exec 9>/opt/oblikos/deploy.lock
flock -w 300 9
certbot certonly --webroot -w /var/www/oblikos-acme --non-interactive --cert-name app.oblikos.ru -d app.oblikos.ru
backup=/etc/oblikos/domain-backup-$(date -u +%Y%m%d-%H%M%S)
install -d -m 700 "$backup"
cp -p /etc/oblikos/production.env "$backup/production.env"
cp -p /etc/nginx/sites-available/oblikos "$backup/oblikos"
cp -p /etc/nginx/sites-available/oblikos-app "$backup/oblikos-app"
rollback() {
  trap - ERR
  cp -p "$backup/production.env" /etc/oblikos/production.env
  cp -p "$backup/oblikos" /etc/nginx/sites-available/oblikos
  cp -p "$backup/oblikos-app" /etc/nginx/sites-available/oblikos-app
  nginx -t && systemctl reload nginx
  systemctl restart oblikos
  echo "Activation failed; restored configuration from $backup" >&2
  exit 1
}
trap rollback ERR
sed 's/oblikos\.ru/app.oblikos.ru/g' "$backup/oblikos" > /etc/nginx/sites-available/oblikos-app
cat > /etc/nginx/sites-available/oblikos <<'NGINX'
# Temporary service redirect until the marketing landing is published here.
server {
    listen 80;
    server_name oblikos.ru;
    location /.well-known/acme-challenge/ { root /var/www/oblikos-acme; }
    location / { return 302 https://app.oblikos.ru$request_uri; }
    access_log off;
}
server {
    listen 443 ssl;
    server_name oblikos.ru;
    ssl_certificate /etc/letsencrypt/live/oblikos.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/oblikos.ru/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header Strict-Transport-Security "max-age=31536000" always;
    location / { return 302 https://app.oblikos.ru$request_uri; }
    access_log off;
}
NGINX
nginx -t
sed -i 's|^NEXTAUTH_URL=.*|NEXTAUTH_URL=https://app.oblikos.ru|' /etc/oblikos/production.env
systemctl restart oblikos
healthy=false
for attempt in $(seq 1 30); do
  if curl --fail --silent --max-time 2 http://127.0.0.1:3001/api/health >/dev/null; then healthy=true; break; fi
  sleep 2
done
[[ "$healthy" == true ]]
systemctl reload nginx
https_ready=false
for attempt in $(seq 1 20); do
  if curl --fail --silent --max-time 3 --resolve app.oblikos.ru:443:127.0.0.1 https://app.oblikos.ru/api/health; then https_ready=true; break; fi
  sleep 1
done
[[ "$https_ready" == true ]]
curl --fail --silent --show-error --resolve app.oblikos.ru:443:127.0.0.1 https://app.oblikos.ru/login -o /dev/null
trap - ERR
echo "APP_DOMAIN_ACTIVE; protected rollback files: $backup"
