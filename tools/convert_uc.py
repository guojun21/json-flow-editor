#!/usr/bin/env python3
"""P2606 用例全集(usecases.py) → data/usecase_paichan.json:总览 + 8 张节点用例图纵向堆在一张画布上。
单源在 P2606/01_方案/用例图_排产采集/usecases.py,改那边重跑这里。"""
import json, os, sys, math
sys.path.insert(0, os.path.expanduser('~/PUDUAIINFRA/10_Projects/P2606_数采工厂基础设施/01_方案/用例图_排产采集'))
import usecases as U

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W = 2200
FILL = {"done": "#e3f1ec", "part": "#f8eedc", "todo": "#ffffff", "out": "#eef0f2"}
STROKE = {"done": "#1e755d", "part": "#a1691a", "todo": "#48586a", "out": "#9aa4ae"}
nodes, edges = [], []
def add(**n): nodes.append({k: v for k, v in n.items() if v not in (None, "", [])}); return n["id"]
def link(a, b, primary=True, label=""):
    e = {"id": f"e{len(edges)}", "from": a, "to": b, "color": "#1f6389" if primary else "#9aa4ae",
         "width": 2 if primary else 1.4, "arrow": "none", "router": "normal"}
    if not primary: e["dash"] = "dashed"
    if label: e["label"] = label
    edges.append(e)
is_sys = lambda a: U.ACTORS.get(a, "").startswith("【")

y = 40
add(id="title", kind="text", x=60, y=y, w=1400, h=60, lines=["排产采集 · 一期用例全集（优化版流程图第 3 泳道）"], fontSize=36, bold=True, textColor="#0b1220"); y += 66
add(id="subtitle", kind="text", x=60, y=y, w=1800, h=40,
    lines=[f"{len(U.UC)} 个用例 · {len(U.ACTORS)} 类角色 · 绿=已实现(factory-core) 橙=部分 白=待做 灰=不入一期 · 实线=主角色 虚线=协同"], fontSize=20, textColor="#48586a"); y += 70

# ---- 总览:8 个分组包 + 计数 ----
from collections import Counter
cnt = Counter(u[1] for u in U.UC); done = Counter(u[1] for u in U.UC if u[10] == "done"); part = Counter(u[1] for u in U.UC if u[10] == "part")
add(id="ov", kind="boundary", x=60, y=y, w=W-120, h=430, lines=[f"《系统》排产采集 · 总览"], fontSize=22)
for i, n in enumerate(U.NODES):
    r, c = divmod(i, 4); x = 110 + c * 505; yy = y + 60 + r * 175
    add(id=f"ov{i}", kind="package", x=x, y=yy, w=460, h=150, lines=[n], fontSize=20)
    add(id=f"ovt{i}", kind="text", x=x+20, y=yy+50, w=420, h=80,
        lines=[f"{cnt[n]} 个用例", f"已实现 {done[n]} · 部分 {part[n]} · 待做 {cnt[n]-done[n]-part[n]}"], fontSize=18, textColor="#1f6389")
y += 470

# ---- 每个节点一张用例图 ----
EW, EH, GX, GY, COLS = 330, 70, 60, 34, 3
for k, node in enumerate(U.NODES):
    ucs = [u for u in U.UC if u[1] == node]
    prim = list(dict.fromkeys(u[3] for u in ucs)); sec = [a for a in dict.fromkeys(a for u in ucs for a in u[4]) if a not in prim]
    left = [a for a in prim + sec if not is_sys(a)]; right = [a for a in prim + sec if is_sys(a)]
    rows = math.ceil(len(ucs) / COLS)
    BX = 340; BW = COLS * EW + (COLS + 1) * GX; BH = rows * (EH + GY) + GY + 70
    H = max(BH + 40, 120 * max(len(left), len(right), 1) + 60)
    add(id=f"b{k}", kind="boundary", x=BX, y=y, w=BW, h=BH, lines=[f"《系统》排产采集 · {node}"], fontSize=22)
    pos = {}
    for i, u in enumerate(ucs):
        r, c = divmod(i, COLS)
        x = BX + GX + c * (EW + GX); yy = y + 70 + r * (EH + GY)
        pos[u[0]] = u[0]
        add(id=u[0], kind="usecase", shape="ellipse", x=x, y=yy, w=EW, h=EH, lines=[u[2]], fontSize=17,
            fill=FILL[u[10]], stroke=STROKE[u[10]], textColor="#17212d")
    for i, a in enumerate(left):
        aid = f"a{k}_{i}"; add(id=aid, kind="actor", x=120, y=y + 40 + i * 120, w=70, h=90, lines=[a], fontSize=16)
        for u in ucs:
            if u[3] == a: link(aid, u[0], True)
            elif a in u[4]: link(aid, u[0], False)
    for i, a in enumerate(right):
        aid = f"s{k}_{i}"; add(id=aid, kind="pill", x=BX + BW + 80, y=y + 40 + i * 120, w=190, h=64, lines=[a.replace("(", "\n(")], fontSize=15, fill="#edf1f4", textColor="#17212d", stroke="#48586a")
        for u in ucs:
            if u[3] == a: link(aid, u[0], True)
            elif a in u[4]: link(aid, u[0], False)
    y += H + 60

doc = {"meta": {"id": "usecase_paichan", "title": "用例图 · 排产采集（09-02）", "date": "2026-09-02", "W": W, "H": y + 40, "fs": {"title": 24, "body": 17}},
       "nodes": nodes, "edges": edges}
out = os.path.join(ROOT, "data", "usecase_paichan.json")
json.dump(doc, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1); open(out, "a").write("\n")
print("写出", out, "|", len(nodes), "节点", len(edges), "边 | 画布", W, "x", y + 40)
