#!/usr/bin/env python3
"""把「数据采集工厂端到端流程(优化版)」布局成 data/optimized.json。
单源:改这里重跑即可,不要手改 JSON。"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

W, H = 5000, 3420
COL_X0, COL_W, COL_GAP = 420, 600, 40
BAND_X, BAND_W = 92, 4816

GREY   = '#6b7684'   # 主流程箭头
RED    = '#d95757'   # 异常/否分支
BLUE   = '#2f6bff'
TEAL   = '#0f9aa8'
PURPLE = '#7c4dff'
ORANGE = '#e08b2c'
GREEN  = '#1f8a4c'
BOX_ST = '#d7dde8'
TXT    = '#172033'

nodes, edges = [], []

CONTENT_W = 6 * (COL_W + COL_GAP) + COL_W      # 七列布满的总宽

def col(i):                      # 第 i 列(0 起,七列基准)的左上角 x
    return COL_X0 + i * (COL_W + COL_GAP)

def spread(n, i, w=COL_W):       # n 个盒子在同一内容宽度内均分,取第 i 个的 x
    gap = (CONTENT_W - n * w) / (n - 1)
    return round(COL_X0 + i * (w + gap))

def add(n):
    nodes.append({k: v for k, v in n.items() if v not in (None, '')})
    return n['id']

def step(nid, i, y, lines, w=COL_W, h=230, x=None, fill='#ffffff', stroke=BOX_ST,
         text=TXT, fs=26, n=None):
    if x is None and n:
        x = spread(n, i, w)
    return add({'id': nid, 'kind': 'step', 'shape': 'rounded',
                'x': col(i) if x is None else x, 'y': y, 'w': w, 'h': h,
                'fill': fill, 'stroke': stroke, 'textColor': text,
                'lines': lines, 'fontSize': fs, 'rx': 14})

def diamond(nid, i, y, lines, w=COL_W, h=230, fill='#fffaf0', stroke=ORANGE,
            text='#7a4a08', fs=26, n=None):
    x = spread(n, i, w) if n else col(i)
    return add({'id': nid, 'kind': 'decision', 'shape': 'diamond',
                'x': x, 'y': y, 'w': w, 'h': h, 'fill': fill,
                'stroke': stroke, 'textColor': text, 'lines': lines,
                'fontSize': fs})

def fail(nid, x, y, lines, w=520, h=90, fs=22):
    return add({'id': nid, 'kind': 'fail', 'shape': 'rounded', 'x': x, 'y': y,
                'w': w, 'h': h, 'fill': '#ffffff', 'stroke': RED,
                'textColor': RED, 'lines': lines, 'fontSize': fs, 'rx': 10})

def band(nid, y, h, fill):
    return add({'id': nid, 'kind': 'band', 'shape': 'rounded', 'x': BAND_X,
                'y': y, 'w': BAND_W, 'h': h, 'fill': fill, 'rx': 20})

def pill(nid, x, y, w, h, fill, lines, fs=34):
    return add({'id': nid, 'kind': 'pill', 'shape': 'rounded', 'x': x, 'y': y,
                'w': w, 'h': h, 'fill': fill, 'textColor': '#ffffff',
                'lines': lines, 'fontSize': fs, 'bold': True, 'rx': 18})

def text(nid, x, y, w, h, lines, fs=26, color='#667085', bold=False):
    return add({'id': nid, 'kind': 'text', 'shape': 'rounded', 'x': x, 'y': y,
                'w': w, 'h': h, 'lines': lines, 'fontSize': fs,
                'textColor': color, 'bold': bold})

def link(a, b, color=GREY, label='', dash=None):
    e = {'id': 'e%d' % len(edges), 'from': a, 'to': b, 'color': color}
    if label: e['label'] = label
    if dash:  e['dash'] = dash
    edges.append(e)

def chain(ids, color=GREY):
    for a, b in zip(ids, ids[1:]):
        link(a, b, color)

# ---------- 页眉 ----------
text('t1', BAND_X + 30, 60, 1800, 80, ['数据采集工厂端到端流程（优化版）'],
     fs=52, color='#0b1220', bold=True)
text('t2', BAND_X + 30, 148, 2400, 50,
     ['默认80%配额 + 20%任务广场｜滚动质检最长5天｜采集、标注、训练和商业交付分别闭环'],
     fs=26, color='#667085')
text('t3', 2700, 148, 2200, 50,
     ['200工位｜192台采集设备｜满开时每班约192名数采员 + 47名监控员 + 11名组长'],
     fs=24, color=BLUE, bold=True)

# ---------- 泳道底色与标签 ----------
LANES = [
    ('bg1', 250,  520, '#eaf1ff', BLUE,   ['1', '需求', '立项']),
    ('bg2', 810,  520, '#e6f7f8', TEAL,   ['2', '试采', '定版']),
    ('bg3', 1370, 600, '#f1edff', PURPLE, ['3', '排产', '采集']),
    ('bg4', 2010, 520, '#fdf0e2', ORANGE, ['4', '验收', '入库']),
    ('bg5', 2570, 800, '#eaf7ee', GREEN,  ['5', '交付', '闭环']),
]
for bid, by, bh, bfill, pfill, label in LANES:
    band(bid, by, bh, bfill)
    pill('p' + bid, 150, by + 60, 200, bh - 120, pfill, label)

# ---------- 1 需求立项(左→右) ----------
Y1 = 340
A1 = step('A1', 0, Y1, ['提交采集需求', '主责  算法需求人', '协同  数据产品、法务/安全'], n=6)
A2 = step('A2', 1, Y1, ['完整性与权利校验', '主责  平台/数据运营', '协同  算法、法务、数据安全'], n=6)
A3 = step('A3', 2, Y1, ['联合可行性评审', '主责  工厂管理员', '协同  算法、QC、设备/IT、数据平台'], n=6)
D1 = diamond('D1', 3, Y1, ['是否承接？', '主责  工厂管理员', '协同  业务负责人、算法需求人'], n=6)
A4 = step('A4', 4, Y1, ['立项并指派试采', '主责  工厂管理员', '协同  当班组长、设备运维'],
          stroke=BLUE, n=6)
A5 = step('A5', 5, Y1, ['试采10条 + 难度录入', '主责  组长', '协同  数采员、监控员'], n=6)
F1 = fail('F1', spread(6, 3) + 40, Y1 + 270, ['否：退回 / 排队 / 改期 / 缩量'])
chain([A1, A2, A3, D1])
link(D1, A4)
link(A4, A5)
link(D1, F1, RED, '否')

# ---------- 2 试采定版(右→左) ----------
Y2 = 900
B1 = step('B1', 5, Y2, ['盲选Demo + 全样本评审', '主责  算法需求人', '协同  QC、组长、保留10条统计'], n=6)
B2 = step('B2', 4, Y2, ['难度系数校准', '主责  工厂运营', '协同  组长、数据分析、QC'], n=6)
B3 = step('B3', 3, Y2, ['冻结任务版本', '主责  算法需求人/数据产品', '协同  QC、工厂管理员'],
          stroke=TEAL, n=6)
B4 = step('B4', 2, Y2, ['测算总量与标准工时', '主责  数据运营/平台', '协同  工厂管理员、QC'], n=6)
B5 = step('B5', 1, Y2, ['排产与资源锁定', '主责  工厂管理员', '协同  组长、设备/场务、IT'], n=6)
B6 = step('B6', 0, Y2, ['配置80% + 市场20%', '主责  工厂管理员/系统', '协同  组长、数采员'],
          fill='#f3efff', stroke=PURPLE, n=6)
F2 = fail('F2', spread(6, 5) + 40, Y2 + 270, ['试采不通过：改剧本后重试'])
chain([B1, B2, B3, B4, B5, B6])
link(B1, F2, RED)
link(A5, B1, BLUE)          # 泳道 1 → 2

# ---------- 3 排产采集(左→右) ----------
Y3 = 1450
C1 = step('C1', 0, Y3, ['派发/领取工单', '主责  平台任务中心', '协同  组长、数采员'])
C2 = step('C2', 1, Y3, ['登录扫码预检', '主责  数采员', '协同  组长、设备运维'])
C3 = step('C3', 2, Y3, ['采集 Episode', '主责  数采员', '协同  组长'])
D2 = diamond('D2', 3, Y3, ['监控粗筛', '主责  监控员/未来AI', '协同  数采员、组长'])
C4 = step('C4', 4, Y3, ['运营云入库', '主责  数据平台', '协同  IT/云运维、监控员'])
C5 = step('C5', 5, Y3, ['滚动复核 ≤5天', '主责  质检员', '协同  质检组长、数据平台'])
D3 = diamond('D3', 6, Y3, ['质检结果', '主责  质检员', '协同  算法、工厂、数据运营'])
F3 = fail('F3', col(3) - 20, Y3 + 280, ['不合格：本地隔离 + 原因码 + 重采',
                                        '抽样复核监控误杀率'], w=640, h=120)
F4 = fail('F4', col(6) - 20, Y3 + 280, ['失败：修复复检 / 补采 / 争议仲裁',
                                        '原因回传到人员、设备和任务版本'], w=640, h=120)
chain([C1, C2, C3, D2, C4, C5, D3])
link(D2, F3, RED)
link(D3, F4, RED)
link(B6, C1, TEAL)          # 泳道 2 → 3

# ---------- 4 验收入库(右→左) ----------
Y4 = 2100
E1 = step('E1', 4, Y4, ['总公司云验收入库', '主责  数据平台', '协同  QC、云运维、数据安全'],
          stroke=ORANGE, n=5)
D4 = diamond('D4', 3, Y4, ['有效量与配额达标？', '主责  数据运营', '协同  算法需求人、QC'], n=5)
E2 = step('E2', 2, Y4, ['关闭采集任务', '主责  工厂管理员/数据运营', '协同  算法需求人、财务运营'], n=5)
E3 = step('E3', 1, Y4, ['数据目录 + 权利标签', '主责  数据治理', '协同  法务、销售、数据安全'], n=5)
D5 = diamond('D5', 0, Y4, ['用途路由', '主责  数据产品负责人', '协同  算法、销售、法务'],
             fill='#eefaf1', stroke=GREEN, text='#125c34', n=5)
F5 = fail('F5', spread(5, 3) - 10, Y4 + 270, ['未达标：差额分析 → 定向补采工单'], w=620)
chain([E1, D4, E2, E3, D5])
link(D4, F5, RED)
link(D3, E1, PURPLE)        # 泳道 3 → 4

# ---------- 5 交付闭环(两条支线) ----------
SUB_X, SUB_W = 340, 300
R1, R2, RH = 2660, 2970, 220
CW, CG, CX0 = 760, 60, 720

def col5(i):
    return CX0 + i * (CW + CG)

def step5(nid, i, y, lines, **kw):
    return step(nid, 0, y, lines, x=col5(i), w=CW, h=RH, **kw)

pill('sub1', SUB_X, R1, SUB_W, RH, GREEN,  ['内部训练'], fs=32)
pill('sub2', SUB_X, R2, SUB_W, RH, ORANGE, ['商业交付'], fs=32)

G1 = step5('G1', 0, R1, ['创建标注需求', '主责  算法需求人', '协同  标注PM、数据产品'])
G2 = step5('G2', 1, R1, ['标注 + 复核', '主责  标注PM/质检', '协同  标注员、算法'])
G3 = step5('G3', 2, R1, ['发布 Dataset 版本', '主责  数据工程', '协同  QC、算法、数据治理'],
           stroke=GREEN)
G4 = step5('G4', 3, R1, ['训练消费', '主责  训练算法', '协同  数据工程、模型评测'])
G5 = step5('G5', 4, R1, ['难例反馈 → 新需求', '主责  算法负责人', '协同  数据产品、工厂运营'])
H1 = step5('H1', 0, R2, ['销售订单 + 授权核验', '主责  销售/法务', '协同  数据治理、客户'])
H2 = step5('H2', 1, R2, ['选择原始/标注服务', '主责  客户/销售', '协同  数据产品、标注PM'])
H3 = step5('H3', 2, R2, ['总公司或受控三方标注', '主责  标注PM', '协同  数据安全、第三方、QC'])
H4 = step5('H4', 3, R2, ['客户交付与验收', '主责  销售/数据平台', '协同  客户、法务、QC'])
H5 = step5('H5', 4, R2, ['商业关闭与审计', '主责  销售运营', '协同  财务、法务、数据治理'],
           fill='#fdf0e2', stroke=ORANGE)
chain([G1, G2, G3, G4, G5], GREEN)
chain([H1, H2, H3, H4, H5], ORANGE)
link(D5, G1, GREEN, '内部')
link(D5, H1, ORANGE, '商业')

doc = {'meta': {'id': 'optimized', 'title': '优化版五阶段（09-01）',
                'W': W, 'H': H, 'fs': {'title': 36, 'body': 26}},
       'nodes': nodes, 'edges': edges}
out = os.path.join(ROOT, 'data', 'optimized.json')
with open(out, 'w', encoding='utf-8') as f:
    json.dump(doc, f, ensure_ascii=False, indent=1)
    f.write('\n')
print('写出', out, '|', len(nodes), '节点', len(edges), '边')
