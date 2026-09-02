#!/usr/bin/env python3
"""json-flow-editor 服务:静态托管 + POST /api/save 把 JSON 写回 data/<id>.json。
用法: python3 server.py [port]  (默认 4244)"""
import json
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4244

def date_of(meta):
    """文件的语义日期:meta.date 优先;没有就从标题里的「（09-01）」「(2026-08-31)」抠;都没有给空串(排最后)。"""
    d = str(meta.get('date') or '').strip()
    if re.fullmatch(r'\d{4}-\d{2}-\d{2}', d):
        return d
    m = re.search(r'[（(](?:(\d{4})[-./])?(\d{1,2})[-./](\d{1,2})[)）]', str(meta.get('title') or ''))
    if m:
        y = m.group(1) or '2026'
        return f"{y}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    return ''

class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        # 全站禁缓存:没有 Cache-Control 时 Chrome 会按 Last-Modified 做「启发式缓存」,
        # 导致部署了新版用户刷新也看不到(实测踩过:侧栏还是旧的四个元素)。
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        if self.path.split('?')[0].rstrip('/') == '/api/list':
            out = []
            ddir = os.path.join(ROOT, 'data')
            for f in sorted(os.listdir(ddir)):
                if not f.endswith('.json'):
                    continue
                fid = f[:-5]
                path = os.path.join(ddir, f)
                mtime = os.path.getmtime(path)
                try:
                    meta = json.load(open(path)).get('meta', {})
                    out.append({'id': fid, 'title': meta.get('title', fid),
                                'date': date_of(meta), '_m': mtime})
                except Exception:
                    out.append({'id': fid, 'title': fid, 'date': '', '_m': mtime})
            # 最新的排最前:先按 meta.date 倒序(语义日期,重新部署不会乱),
            # 没写 date 的退回文件 mtime 倒序
            out.sort(key=lambda x: (x['date'] or '', x['_m']), reverse=True)
            for x in out:
                x.pop('_m', None)
            body = json.dumps(out, ensure_ascii=False).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def do_POST(self):
        if self.path.rstrip('/') != '/api/save':
            self.send_error(404)
            return
        try:
            n = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(n))
            did = body['id']
            if not re.fullmatch(r'[a-z0-9_-]{1,40}', did):
                raise ValueError('bad id')
            data = body['data']
            assert 'meta' in data and 'nodes' in data and 'edges' in data
            path = os.path.join(ROOT, 'data', did + '.json')
            if not data['meta'].get('date'):
                old_date = ''
                try:
                    old_date = json.load(open(path)).get('meta', {}).get('date', '')
                except Exception:
                    pass
                import datetime as _dt
                data['meta']['date'] = old_date or date_of(data['meta']) or _dt.date.today().isoformat()
            tmp = path + '.tmp'
            with open(tmp, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=1)
            os.replace(tmp, path)
            out = b'{"ok":true}'
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(out)))
            self.end_headers()
            self.wfile.write(out)
        except Exception as e:
            self.send_error(400, str(e))

    def log_message(self, fmt, *args):
        pass

if __name__ == '__main__':
    print(f'json-flow-editor on http://0.0.0.0:{PORT}  root={ROOT}')
    ThreadingHTTPServer(('0.0.0.0', PORT), H).serve_forever()
