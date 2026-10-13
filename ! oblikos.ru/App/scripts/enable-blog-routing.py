#!/usr/bin/env python3
"""Connect the existing Oblik OS landing to public Next.js blog routes.

Run as root on the production VPS after deploying the app. The script reads
the actual systemd port, backs up only the two known vhosts and blog snippet,
validates nginx before reload and restores originals on failure.
"""
import datetime
import os
from pathlib import Path
import re
import shutil
import subprocess
import urllib.request


def run(*args):
    return subprocess.run(args, check=True, text=True, capture_output=True).stdout


def main():
    if os.geteuid() != 0:
        raise RuntimeError("Run as root")
    landing = Path("/etc/nginx/sites-available/oblikos")
    application = Path("/etc/nginx/sites-available/oblikos-app")
    snippet = Path("/etc/nginx/snippets/oblikos-blog.conf")
    source = Path("/opt/oblikos/current/deploy/blog-public-locations.conf")
    exec_start = run("systemctl", "show", "oblikos", "--property=ExecStart", "--value")
    port_match = re.search(r"--port[ =](\d+)", exec_start)
    if not port_match:
        raise RuntimeError("Cannot determine the actual application port")
    port = int(port_match[1])
    if not 1 <= port <= 65535:
        raise RuntimeError("Invalid port")
    with urllib.request.urlopen(f"http://127.0.0.1:{port}/blog", timeout=10) as response:
        if "Блог Oblik OS" not in response.read().decode():
            raise RuntimeError("The running release does not contain the blog")

    landing_text = landing.read_text()
    application_text = application.read_text()
    include = "    include /etc/nginx/snippets/oblikos-blog.conf;\n"
    if include.strip() not in landing_text:
        marker = "    index index.html;\n"
        if landing_text.count(marker) != 1:
            raise RuntimeError("Unexpected landing config; cannot safely insert include")
        # Stop before mutation if a location would collide with the new snippet.
        if re.search(r"location\s+(?:=\s+|\^~\s+)?/(?:blog|sitemap\.xml|robots\.txt|icon\.svg|_next)", landing_text):
            raise RuntimeError("Existing blog/SEO locations need manual reconciliation")
        landing_text = landing_text.replace(marker, marker + include)
    redirects = (
        "    location = /blog { return 301 https://oblikos.ru$request_uri; }\n"
        "    location ^~ /blog/ { return 301 https://oblikos.ru$request_uri; }\n"
    )
    if "location = /blog" not in application_text:
        marker = "    location / {\n"
        if application_text.count(marker) != 1:
            raise RuntimeError("Unexpected application config; cannot insert redirects")
        application_text = application_text.replace(marker, redirects + marker)
    snippet_text = re.sub(r"127\.0\.0\.1:\d+", f"127.0.0.1:{port}", source.read_text())

    backup = Path("/etc/nginx/blog-backups") / datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
    backup.mkdir(parents=True, mode=0o700)
    originals = {path: path.read_bytes() if path.exists() else None for path in (landing, application, snippet)}
    for path, content in originals.items():
        if content is not None:
            shutil.copy2(path, backup / path.name)
    try:
        snippet.parent.mkdir(exist_ok=True)
        snippet.write_text(snippet_text)
        landing.write_text(landing_text)
        application.write_text(application_text)
        run("nginx", "-t")
        run("systemctl", "reload", "nginx")
    except Exception:
        for path, content in originals.items():
            if content is None:
                path.unlink(missing_ok=True)
            else:
                path.write_bytes(content)
        run("nginx", "-t")
        run("systemctl", "reload", "nginx")
        raise
    print(f"Blog routing enabled on port {port}. Backups: {backup}")


if __name__ == "__main__":
    main()
