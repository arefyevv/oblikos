import json
import re
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET

origin = 'https://oblikos.ru'
def fetch(path):
    request = urllib.request.Request(origin + path, headers={'User-Agent': 'Mozilla/5.0 (compatible; YandexBot/3.0)'})
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.status, response.headers, response.read().decode()

status, headers, html = fetch('/')
assert status == 200 and 'noindex' not in html
assert len(re.findall(r'<h1\b', html)) == 1
assert re.search(r'rel="canonical" href="https://oblikos.ru/"', html)
for value in re.findall(r'<script type="application/ld\+json">(.*?)</script>', html):
    json.loads(value)
for asset in set(re.findall(r'(?:src|href)="(/assets/[^"?#]+)"', html)):
    with urllib.request.urlopen(origin + asset, timeout=20) as response:
        assert response.status == 200, asset
_, _, robots = fetch('/robots.txt')
assert 'Allow: /' in robots.splitlines() and 'Disallow: /' not in robots.splitlines()
_, _, sitemap = fetch('/sitemap.xml')
urls = [node.text for node in ET.fromstring(sitemap).findall('.//{*}loc')]
for url in urls:
    status, _, page = fetch(url.removeprefix(origin))
    assert status == 200
    assert not re.search(r'<meta[^>]+(?:content="[^"]*noindex|name="robots"[^>]+noindex)', page), url
    print('INDEXABLE', url)
for path in ['/favicon.svg', '/social-preview.jpg']:
    with urllib.request.urlopen(origin + path, timeout=20) as response:
        assert response.status == 200
        print('ASSET', path, response.headers.get_content_type())
try:
    fetch('/seo-check-page-does-not-exist')
    raise AssertionError('Missing page must return 404')
except urllib.error.HTTPError as error:
    assert error.code == 404
print('PASS: sitemap, indexability, metadata, structured data, assets and 404')
