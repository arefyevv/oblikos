"""Render the reviewable Markdown documents as standalone legal-page previews."""
from pathlib import Path
import html
import re

base = Path(__file__).resolve().parent
def inline(value):
    value = html.escape(value)
    value = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', value)
    return value

def render(source):
    lines = source.splitlines()
    output = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if line.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].startswith('|'):
                cells = [cell.strip() for cell in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-+:?', cell) for cell in cells):
                    rows.append(cells)
                i += 1
            output.append('<div class="table"><table>')
            for n, row in enumerate(rows):
                tag = 'th' if n == 0 else 'td'
                output.append('<tr>' + ''.join(f'<{tag}>{inline(cell)}</{tag}>' for cell in row) + '</tr>')
            output.append('</table></div>')
            continue
        heading = re.match(r'^(#{1,3}) (.*)', line)
        if heading:
            level = len(heading[1])
            output.append(f'<h{level}>{inline(heading[2])}</h{level}>')
        else:
            paragraph = [line]
            while i + 1 < len(lines) and lines[i + 1].strip() and not lines[i + 1].startswith(('#', '|')):
                i += 1
                paragraph.append(lines[i])
            output.append('<p>' + inline(' '.join(paragraph)) + '</p>')
        i += 1
    return '\n'.join(output)

css = '''body{margin:0;background:#f7f7fa;color:#222;font:16px/1.7 system-ui,sans-serif}main{max-width:900px;margin:40px auto;padding:40px;background:white;border-radius:20px}h1{font-size:36px;line-height:1.2}h2{font-size:23px;margin-top:38px}nav{display:flex;flex-wrap:wrap;gap:18px;font-size:14px}a{color:#6553c7}p{margin:16px 0}.notice{padding:16px;background:#fff5d9;border-radius:10px}.table{overflow:auto}table{border-collapse:collapse;font-size:14px}th,td{border:1px solid #ddd;padding:12px;vertical-align:top;text-align:left}@media(max-width:600px){main{margin:0;padding:24px 18px;border-radius:0}h1{font-size:29px}}'''
for filename, slug in [('privacy-policy.md', 'privacy'), ('terms-of-use.md', 'terms')]:
    source = (base / filename).read_text(encoding='utf-8')
    title = source.splitlines()[0].removeprefix('# ')
    content = f'''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, follow"><title>{html.escape(title)}</title><style>{css}</style></head><body><main><nav><a href="https://oblikos.ru/">Oblik OS</a><a href="../privacy/">Политика</a><a href="../terms/">Условия</a></nav><p class="notice">Проект для проверки владельцем. На действующий сайт не опубликован.</p>{render(source)}</main></body></html>'''
    target = base / slug / 'index.html'
    target.parent.mkdir(exist_ok=True)
    target.write_text(content, encoding='utf-8')
    print(target)
