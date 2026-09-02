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
    order = 10 if fid.endswith('overview') else 10 + int(fid.split('_')[1])
    doc = {"meta": {"id": fid, "title": title, "date": "2026-09-02", "order": order, "W": W, "H": H, "fs": {"title": 24, "body": 18}}, "nodes": nodes, "edges": edges}
    out = os.path.join(ROOT, "data", fid + ".json")
    json.dump(doc, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1); open(out, "a").write("\n")
    print(f"{fid:14s} {len(nodes):3d} 节点 {len(edges):3d} 边  {W}x{H}  {title}")

# ---------------- 每个节点一张(v3:按 SOL 评审重排) ----------------
# 布局:左右两半,每半若干「角色块」;角色在左,它主责的用例在右边**单列竖排**,角色与每个用例一对一直连(router=normal)。
# 椭圆只写动宾用例名 + 第二行状态词;协同角色进规约(右侧面板)。系统类参与者画方框标 «system»;定时/自动类用例归 «timer» 调度器。
TIMER = "«timer» 调度器"
def main_actor(u):
    if re.search(r"定时|超时|自动回流|当日未用完", u[5] + u[2]) and is_sys(u[3]): return TIMER
    return u[3]
def clean_name(n):
    n = re.sub(r"^【[^】]*】", "", n)           # 去掉【分配池】【抢单池】前缀
    return n
STATUS_WORD = {"done": "已实现", "part": "部分实现", "todo": "待做", "out": "不入一期"}
EW, EH, GAP, FS = 400, 92, 22, 19
for k, node in enumerate(U.NODES, 1):
    ucs = [u for u in U.UC if u[1] == node]
    groups = {}
    for u in ucs: groups.setdefault(main_actor(u), []).append(u)
    order = sorted(groups, key=lambda a: (-len(groups[a]), a))
    # 两半均衡:按用例数贪心分配
    sides = {0: [], 1: []}; load = {0: 0, 1: 0}
    for a in order:
        t = 0 if load[0] <= load[1] else 1; sides[t].append(a); load[t] += len(groups[a]) + 0.6
    nodes, edges = [], []
    add = lambda **n: nodes.append({a: b for a, b in n.items() if b not in (None, "", [])}) or n["id"]
    def link(a, b): edges.append({"id": f"e{len(edges)}", "from": a, "to": b, "color": "#1f6389", "width": 2, "arrow": "none", "router": "normal"})
    y0 = 40
    add(id="title", kind="text", x=40, y=y0, w=1500, h=52, lines=[f"排产采集 · {node} · 用例图"], fontSize=32, bold=True, textColor="#0b1220")
    add(id="legend", kind="text", x=40, y=y0 + 56, w=1700, h=34, lines=["火柴人=真人角色 · «system»=外部系统 · «timer»=定时触发 · 实线=主责关联(一对一) · 协同角色/触发/前置/主流程在右侧规约面板(选中即显示)"], fontSize=16, textColor="#48586a")
    top = y0 + 110
    # 参与者在边界外:左侧角色 | 边界(两列用例) | 右侧角色
    XA_L, XU_L, XU_R, XA_R = 70, 330, 860, 1330
    BX, BW = XU_L - 40, (XU_R + EW + 40) - (XU_L - 40)
    add(id="b", kind="boundary", x=BX, y=top, w=BW, h=10, lines=[f"«system» 排产采集 · {node}"], fontSize=22)
    maxy = top
    for side in (0, 1):
        x_actor = XA_L if side == 0 else XA_R
        x_uc = XU_L if side == 0 else XU_R
        y = top + 64
        for gi, actor in enumerate(sides[side]):
            us = groups[actor]
            band_h = len(us) * (EH + GAP) - GAP
            aid = f"a{side}_{gi}"
            if actor == TIMER or is_sys(actor):
                add(id=aid, kind="pill", x=x_actor, y=y + band_h / 2 - 34, w=190, h=68, lines=[("«timer»" if actor == TIMER else "«system»"), actor.replace("«timer» ", "").replace("(", "\n(")], fontSize=15, fill="#edf1f4", textColor="#17212d", stroke="#48586a")
            else:
                add(id=aid, kind="actor", x=x_actor + 60, y=y + band_h / 2 - 46, w=64, h=84, lines=[actor], fontSize=17)
            for i, u in enumerate(us):
                yy = y + i * (EH + GAP)
                add(id=u[0], kind="usecase", shape="ellipse", x=x_uc, y=yy, w=EW, h=EH, lines=[clean_name(u[2])], fontSize=FS,
                    fill="#ffffff", stroke="#48586a", textColor="#17212d",
                    spec={"id": u[0], "trigger": u[5], "pre": u[6], "flow": u[7], "alt": u[8], "priority": u[9],
                          "co": " / ".join(a for a in u[4] if a != actor)})
                link(aid, u[0])
            y += band_h + 44
        maxy = max(maxy, y)
    for n in nodes:
        if n["id"] == "b": n["h"] = maxy - top + 10
    write(f"uc_{k}", f"用例·{node}（09-02）", XA_R + 260, maxy + 50, nodes, edges)

# ---------------- 总览 ----------------
from collections import Counter
cnt = Counter(u[1] for u in U.UC); done = Counter(u[1] for u in U.UC if u[10] == "done"); part = Counter(u[1] for u in U.UC if u[10] == "part")
nodes, edges = [], []
add = lambda **n: nodes.append({a: b for a, b in n.items() if b not in (None, "", [])}) or n["id"]
add(id="title", kind="text", x=40, y=30, w=1500, h=56, lines=[f"排产采集 · 一期用例总览（{len(U.UC)} 个用例 · {len(U.ACTORS)} 类角色）"], fontSize=32, bold=True, textColor="#0b1220")
add(id="sub", kind="text", x=40, y=90, w=1700, h=34, lines=["每个节点一张用例图,见文件列表「用例·xxx（09-02）」;方框里是该节点的用例数"], fontSize=17, textColor="#48586a")
add(id="ov", kind="boundary", x=40, y=140, w=1720, h=470, lines=["《系统》排产采集 = 优化版流程图第 3 泳道"], fontSize=22)
for i, n in enumerate(U.NODES):
    r, c = divmod(i, 4); x = 80 + c * 420; yy = 210 + r * 190
    add(id=f"p{i}", kind="package", x=x, y=yy, w=390, h=160, lines=[f"{i+1}. {n}"], fontSize=20)
    add(id=f"t{i}", kind="text", x=x + 20, y=yy + 56, w=350, h=90,
        lines=[f"{cnt[n]} 个用例"], fontSize=20, textColor="#1f6389")
# 角色总表
add(id="actors", kind="package", x=40, y=640, w=1720, h=300, lines=["角色（真人 + 系统）"], fontSize=20)
hum = [a for a in U.ACTORS if not is_sys(a)]; sysa = [a for a in U.ACTORS if is_sys(a)]
for i, a in enumerate(hum):
    add(id=f"h{i}", kind="actor", x=90 + i * 160, y=690, w=64, h=84, lines=[a], fontSize=15)
for i, a in enumerate(sysa):
    add(id=f"s{i}", kind="pill", x=90 + i * 330, y=840, w=300, h=64, lines=[a], fontSize=15, fill="#edf1f4", textColor="#17212d", stroke="#48586a")
write("uc_0_overview", "用例·总览 排产采集（09-02）", 1800, 980, nodes, edges)
os.path.exists(os.path.join(ROOT, "data", "usecase_paichan.json")) and os.remove(os.path.join(ROOT, "data", "usecase_paichan.json"))
