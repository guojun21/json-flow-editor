#!/usr/bin/env python3
"""P2606 用例全集(usecases.py) → 编辑器 JSON:1 张总览 + 每个节点 1 张用例图(各自一个文件,打开就是一屏,看得清)。
读得清的关键:按「主角色」分行——角色在左,它主责的用例横排在同一行;协同角色不画虚线,写进椭圆第二行;
系统类角色(平台任务中心/引擎)当标签块放右侧,只连主责的用例。规约(触发/前置/主流程/异常)进节点 spec,图上不铺开。
单源在 P2606/01_方案/用例图_排产采集/usecases.py。"""
import json, os, sys, math, re
sys.path.insert(0, os.path.expanduser('~/PUDUAIINFRA/10_Projects/P2606_数采工厂基础设施/01_方案/用例图_排产采集'))
import usecases as U

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILL = {"done": "#e3f1ec", "part": "#f8eedc", "todo": "#ffffff", "out": "#eef0f2"}
STROKE = {"done": "#1e755d", "part": "#a1691a", "todo": "#48586a", "out": "#9aa4ae"}
is_sys = lambda a: U.ACTORS.get(a, "").startswith("【")
EW, EH, GX, GY, PER_ROW = 360, 96, 40, 30, 3
old_files = [f for f in os.listdir(os.path.join(ROOT, "data")) if f.startswith("uc_")]
for f in old_files: os.remove(os.path.join(ROOT, "data", f))

def write(fid, title, W, H, nodes, edges):
    doc = {"meta": {"id": fid, "title": title, "date": "2026-09-02", "W": W, "H": H, "fs": {"title": 24, "body": 18}}, "nodes": nodes, "edges": edges}
    out = os.path.join(ROOT, "data", fid + ".json")
    json.dump(doc, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1); open(out, "a").write("\n")
    print(f"{fid:14s} {len(nodes):3d} 节点 {len(edges):3d} 边  {W}x{H}  {title}")

# ---------------- 每个节点一张 ----------------
for k, node in enumerate(U.NODES, 1):
    ucs = [u for u in U.UC if u[1] == node]
    nodes, edges = [], []
    add = lambda **n: nodes.append({a: b for a, b in n.items() if b not in (None, "", [])}) or n["id"]
    def link(a, b): edges.append({"id": f"e{len(edges)}", "from": a, "to": b, "color": "#1f6389", "width": 2, "arrow": "none", "router": "manhattan"})
    # 主角色分行:真人角色按其主责用例数排序;系统角色放最后几行
    groups = {}
    for u in ucs: groups.setdefault(u[3], []).append(u)
    humans = sorted([a for a in groups if not is_sys(a)], key=lambda a: -len(groups[a]))
    systems = [a for a in groups if is_sys(a)]
    y = 40
    add(id="title", kind="text", x=40, y=y, w=1500, h=50, lines=[f"排产采集 · {node} · 用例图（{len(ucs)} 个用例）"], fontSize=30, bold=True, textColor="#0b1220"); y += 54
    add(id="legend", kind="text", x=40, y=y, w=1600, h=34, lines=["左列=主责角色,实线=主责;椭圆第二行=协同角色;绿=已实现 橙=部分 白=待做 灰=不入一期;选中用例右侧看规约,双击可编辑"], fontSize=16, textColor="#48586a"); y += 50
    BX = 300; BW = PER_ROW * EW + (PER_ROW + 1) * GX
    top = y
    add(id="b", kind="boundary", x=BX, y=top, w=BW, h=10, lines=[f"《系统》排产采集 · {node}"], fontSize=22)
    y = top + 60
    for gi, actor in enumerate(humans + systems):
        us = groups[actor]
        rows = math.ceil(len(us) / PER_ROW)
        band_h = rows * (EH + GY)
        aid = f"actor{gi}"
        if is_sys(actor):
            add(id=aid, kind="pill", x=60, y=y + band_h / 2 - 36, w=200, h=72, lines=[actor.replace("(", "\n(")], fontSize=16, fill="#edf1f4", textColor="#17212d", stroke="#48586a")
        else:
            add(id=aid, kind="actor", x=130, y=y + band_h / 2 - 50, w=64, h=84, lines=[actor], fontSize=17)
        for i, u in enumerate(us):
            r, c = divmod(i, PER_ROW)
            x = BX + GX + c * (EW + GX); yy = y + r * (EH + GY)
            co = [a for a in u[4] if a != actor]
            lines = [u[2]] + ([f"协同 {' / '.join(co)}"] if co else [])
            add(id=u[0], kind="usecase", shape="ellipse", x=x, y=yy, w=EW, h=EH, lines=lines, fontSize=17,
                fill=FILL[u[10]], stroke=STROKE[u[10]], textColor="#17212d",
                spec={"id": u[0], "trigger": u[5], "pre": u[6], "flow": u[7], "alt": u[8], "priority": u[9], "status": u[10]})
            link(aid, u[0])
        y += band_h + 16
    for n in nodes:
        if n["id"] == "b": n["h"] = y - top + 10
    write(f"uc_{k}", f"用例·{node}（09-02）", BX + BW + 60, y + 40, nodes, edges)

# ---------------- 总览 ----------------
from collections import Counter
cnt = Counter(u[1] for u in U.UC); done = Counter(u[1] for u in U.UC if u[10] == "done"); part = Counter(u[1] for u in U.UC if u[10] == "part")
nodes, edges = [], []
add = lambda **n: nodes.append({a: b for a, b in n.items() if b not in (None, "", [])}) or n["id"]
add(id="title", kind="text", x=40, y=30, w=1500, h=56, lines=[f"排产采集 · 一期用例总览（{len(U.UC)} 个用例 · {len(U.ACTORS)} 类角色）"], fontSize=32, bold=True, textColor="#0b1220")
add(id="sub", kind="text", x=40, y=90, w=1700, h=34, lines=["每个节点一张用例图,见文件列表「用例·xxx（09-02）」;数字 = 用例数(已实现 / 部分 / 待做)"], fontSize=17, textColor="#48586a")
add(id="ov", kind="boundary", x=40, y=140, w=1720, h=470, lines=["《系统》排产采集 = 优化版流程图第 3 泳道"], fontSize=22)
for i, n in enumerate(U.NODES):
    r, c = divmod(i, 4); x = 80 + c * 420; yy = 210 + r * 190
    add(id=f"p{i}", kind="package", x=x, y=yy, w=390, h=160, lines=[f"{i+1}. {n}"], fontSize=20)
    add(id=f"t{i}", kind="text", x=x + 20, y=yy + 56, w=350, h=90,
        lines=[f"{cnt[n]} 个用例", f"已实现 {done[n]} · 部分 {part[n]} · 待做 {cnt[n]-done[n]-part[n]}"], fontSize=18, textColor="#1f6389")
# 角色总表
add(id="actors", kind="package", x=40, y=640, w=1720, h=300, lines=["角色（真人 + 系统）"], fontSize=20)
hum = [a for a in U.ACTORS if not is_sys(a)]; sysa = [a for a in U.ACTORS if is_sys(a)]
for i, a in enumerate(hum):
    add(id=f"h{i}", kind="actor", x=90 + i * 160, y=690, w=64, h=84, lines=[a], fontSize=15)
for i, a in enumerate(sysa):
    add(id=f"s{i}", kind="pill", x=90 + i * 330, y=840, w=300, h=64, lines=[a], fontSize=15, fill="#edf1f4", textColor="#17212d", stroke="#48586a")
write("uc_0_overview", "用例·总览 排产采集（09-02）", 1800, 980, nodes, edges)
os.path.exists(os.path.join(ROOT, "data", "usecase_paichan.json")) and os.remove(os.path.join(ROOT, "data", "usecase_paichan.json"))
