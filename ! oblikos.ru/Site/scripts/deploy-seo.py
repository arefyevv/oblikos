#!/usr/bin/env python3
"""Apply an already checked landing build with backups and nginx rollback."""
from pathlib import Path
import datetime
import re
import shutil
import subprocess
import tarfile
import time
import urllib.request

root = Path('/var/www/oblikos-site')
config = Path('/etc/nginx/sites-available/oblikos')
snippet = Path('/etc/nginx/snippets/oblikos-blog.conf')
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S')
backup = Path('/var/backups/oblikos-seo') / stamp
backup.mkdir(parents=True)
shutil.copytree(root, backup / 'site')
shutil.copy2(config, backup / 'nginx-site.conf')
shutil.copy2(snippet, backup / 'blog.conf')
original_config = config.read_text()
original_snippet = snippet.read_text()
new_config = original_config.replace('try_files $uri $uri/ /index.html;', 'try_files $uri $uri/ =404;')
if 'gzip_types' not in new_config:
    new_config = new_config.replace('    index index.html;', '''    index index.html;
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/css application/javascript application/json application/xml image/svg+xml;''')
new_config = new_config.replace('location /assets/ { try_files $uri =404; }', '''location /assets/ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
        add_header Strict-Transport-Security "max-age=31536000" always;
    }''')
new_snippet, count = re.subn(r'location = /robots\.txt \{[^}]*\}', 'location = /robots.txt {\n    try_files /robots.txt =404;\n}', original_snippet)
if count != 1:
    raise RuntimeError('Unexpected robots routing; nothing changed')
try:
    with tarfile.open('/tmp/oblikos-seo-site.tar.gz') as archive:
        archive.extractall(root, filter='data')
    config.write_text(new_config)
    snippet.write_text(new_snippet)
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    with urllib.request.urlopen('https://oblikos.ru/') as response:
        html = response.read().decode()
        assert 'noindex' not in html and '<h1 ' in html
        assert 'rel="canonical"' in html and 'application/ld+json' in html
    for attempt in range(10):
        with urllib.request.urlopen('https://oblikos.ru/robots.txt') as response:
            rules = response.read().decode().splitlines()
        if 'Allow: /' in rules:
            break
        time.sleep(0.5)
    else:
        raise RuntimeError(f'Unexpected robots response: {rules}')
    with urllib.request.urlopen('https://oblikos.ru/favicon.svg') as response:
        assert response.headers.get_content_type() == 'image/svg+xml'
except Exception:
    # Restore overwritten entry files; leave extra immutable assets harmlessly available.
    for source in (backup / 'site').rglob('*'):
        if source.is_file():
            target = root / source.relative_to(backup / 'site')
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
    config.write_text(original_config)
    snippet.write_text(original_snippet)
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    raise
print(f'SEO landing deployed and verified. Backup: {backup}')
