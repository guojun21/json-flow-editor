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

class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        if self.path.startswith('/data/'):
            self.send_header('Cache-Control', 'no-store')
        super().end_headers()

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
