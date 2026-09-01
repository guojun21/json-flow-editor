#!/usr/bin/env python3
"""构建后给 index.html 里的 dist 资源打内容指纹(?v=<md5前8位>)。
浏览器只认 URL,指纹变了才会重新下载——这是防「部署了看不到」的第二道保险。"""
import hashlib, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def h(rel):
    with open(os.path.join(ROOT, rel), 'rb') as f:
        return hashlib.md5(f.read()).hexdigest()[:8]

p = os.path.join(ROOT, 'index.html')
s = open(p, encoding='utf-8').read()
for rel in ('dist/app.css', 'dist/app.js'):
    s = re.sub(re.escape(rel) + r'(\?v=[0-9a-f]+)?', rel + '?v=' + h(rel), s)
open(p, 'w', encoding='utf-8').write(s)
print('stamped:', re.findall(r'dist/app\.\w+\?v=\w+', s))
