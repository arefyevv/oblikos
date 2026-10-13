import fs from 'node:fs'
import assert from 'node:assert/strict'
const html = fs.readFileSync('dist/index.html', 'utf8')
assert.equal((html.match(/<h1\b/g) ?? []).length, 1)
assert(!html.includes('noindex'))
assert(html.includes('rel="canonical" href="https://oblikos.ru/"'))
assert(html.includes('href="/blog"'))
assert(html.includes('application/ld+json'))
for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)) {
  assert(fs.existsSync(`dist${match[1]}`), `Missing asset ${match[1]}`)
}
assert(fs.existsSync('dist/social-preview.jpg'))
assert(fs.readFileSync('dist/robots.txt', 'utf8').includes('Allow: /'))
console.log(`SEO checks passed; prerendered HTML: ${html.length} characters`)
