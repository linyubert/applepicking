#!/usr/bin/env python3
"""把 index.html 的 CSS / JS / 圖檔內嵌，產出單檔 dist/apple-picking.html"""
import base64, mimetypes, os, re, pathlib

ROOT = pathlib.Path(__file__).parent
OUT = ROOT / 'dist' / 'apple-picking.html'

def read(p):
    return (ROOT / p).read_text(encoding='utf-8')

def data_uri(p):
    mime, _ = mimetypes.guess_type(p)
    b = (ROOT / p).read_bytes()
    return 'data:%s;base64,%s' % (mime or 'application/octet-stream', base64.b64encode(b).decode())

html = read('index.html')
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">',
              lambda m: '<style>\n' + read(m.group(1)) + '\n</style>', html)
html = re.sub(r'<script src="([^"]+)"></script>',
              lambda m: '<script>\n' + read(m.group(1)) + '\n</script>', html)
html = re.sub(r'(<img[^>]*?src=")(?!data:)([^"]+\.(?:png|jpe?g|svg|webp))(")',
              lambda m: m.group(1) + data_uri(m.group(2)) + m.group(3), html)

OUT.parent.mkdir(exist_ok=True)
OUT.write_text(html, encoding='utf-8')
print('rebuilt %s (%d chars)' % (OUT.name, len(html)))
