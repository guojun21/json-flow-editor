#!/usr/bin/env python3
"""flow-editor 旧数据(js) → json-flow-editor v2 规范 JSON。
v2 原则:一个 JSON 完整表达一张图 —— meta + nodes(含背景元素) + edges。"""
import json
import re
import sys
import os

SRC = '/Users/m5pro/PUDUAIINFRA/10_Projects/P2606_数采工厂基础设施/50_原型/flow-editor/data'
DST = os.path.join(os.path.dirname(__file__), '..', 'data')

def load(fname, varname):
    txt = open(f'{SRC}/{fname}').read()
    return json.loads(re.sub(r'^window\.%s\s*=\s*' % varname, '', txt.strip()).rstrip(';\n'))

def convert(d):
    out = {
        'meta': {'id': d['id'], 'title': d['title'], 'W': d['W'], 'H': d['H'],
                 'fs': d['fs']},
        'nodes': [], 'edges': [],
    }
    i = 0
    for r in d['bg']['rects']:
        i += 1
        kind = 'pill' if (r['w'] < 320 and r['h'] > r['w']) else 'band'
        out['nodes'].append({
            'id': 'bg%d' % i, 'kind': kind, 'x': r['x'], 'y': r['y'],
            'w': r['w'], 'h': r['h'], 'fill': r['fill'], 'rx': r.get('rx', 0),
        })
    for t in d['bg']['texts']:
        i += 1
        w = t['size'] * 1.15 * (len(t['text']) + 1) if not t.get('vertical') else t['size'] * 2.4
        h = t['size'] * 1.9 if not t.get('vertical') else t['size'] * 1.35 * (len(t['text']) + 1)
        out['nodes'].append({
            'id': 'tx%d' % i, 'kind': 'text',
            'x': round(t['x'] - w / 2), 'y': round(t['y'] - h / 2),
            'w': round(w), 'h': round(h),
            'lines': [t['text']], 'textColor': t['color'],
            'fontSize': t['size'], 'bold': bool(t.get('bold')),
            'vertical': bool(t.get('vertical')),
        })
    for n in d['nodes']:
        kind = ('decision' if n['shape'] == 'diamond'
                else 'fail' if n.get('stroke') == '#c74444' or n.get('stroke') == '#d98b85'
                else 'step')
        out['nodes'].append({
            'id': n['id'], 'kind': kind, 'x': n['x'], 'y': n['y'],
            'w': n['w'], 'h': n['h'], 'fill': n['fill'], 'stroke': n['stroke'],
            'textColor': n['textColor'], 'bodyColor': n['bodyColor'],
            'lines': n['lines'],
        })
    for e in d['edges']:
        out['edges'].append({
            'id': e['id'], 'from': e['from'], 'to': e['to'],
            'color': e['color'], 'label': e.get('label', ''),
            'dashed': bool(e.get('dashed')), 'vertices': e.get('pts', []),
        })
    return out

os.makedirs(DST, exist_ok=True)
for fname, var, outname in [('final.js', 'FLOW_DATA_FINAL', 'final.json'),
                            ('swimlane.js', 'FLOW_DATA_SWIMLANE', 'swimlane.json')]:
    d = convert(load(fname, var))
    p = os.path.join(DST, outname)
    json.dump(d, open(p, 'w'), ensure_ascii=False, indent=1)
    print(outname, 'nodes', len(d['nodes']), 'edges', len(d['edges']))
