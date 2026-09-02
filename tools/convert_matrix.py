#!/usr/bin/env python3
"""权限矩阵(角色 × 流程节点):从用例全集算出每个角色在每个节点是 主责 / 协同 / —。
格子 = 方框节点,可以在编辑器里双击改。单源:P2606 usecases.py。"""
import json, os, sys
sys.path.insert(0, os.path.expanduser('~/PUDUAIINFRA/10_Projects/P2606_数采工厂基础设施/01_方案/用例图_排产采集'))
import usecases as U
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
roles = [a for a in U.ACTORS if not U.ACTORS[a].startswith("【")] + [a for a in U.ACTORS if U.ACTORS[a].startswith("【")]; nodes_ = U.NODES
total = {}
for u in U.UC: total[u[1]] = total.get(u[1], 0) + 1
main = {(u[3], u[1]) for u in U.UC}; co = {(a, u[1]) for u in U.UC for a in u[4]}
cnt_main = {}; cnt_co = {}
for u in U.UC:
    cnt_main[(u[3], u[1])] = cnt_main.get((u[3], u[1]), 0) + 1
    for a in u[4]: cnt_co[(a, u[1])] = cnt_co.get((a, u[1]), 0) + 1
CW, CH, RW, X0, Y0, HH = 150, 54, 260, 40, 130, 70
nodes, edges = [], []
nodes.append({"id": "title", "kind": "text", "x": 40, "y": 30, "w": 1500, "h": 50, "lines": ["责任矩阵（R 执行 / C 协作） · 角色 × 排产采集节点（一期）"], "fontSize": 30, "bold": True, "textColor": "#0b1220"})
nodes.append({"id": "legend", "kind": "text", "x": 40, "y": 80, "w": 1700, "h": 30, "lines": ["这是责任口径不是权限口径:深色 R = 执行/主责(括号 = 该角色在此节点主责的用例数 / 节点用例总数);浅色 C = 协作;「—」= 不参与。真正的访问权限见另一张「访问权限矩阵」。上半人员角色(RBAC),下半系统/服务身份(ACL)"], "fontSize": 15, "textColor": "#48586a"})
nodes.append({"id": "h0", "kind": "pill", "x": X0, "y": Y0, "w": RW, "h": HH, "lines": ["角色 \\ 节点"], "fontSize": 16, "fill": "#17212d", "textColor": "#fff"})
for j, n in enumerate(nodes_):
    nodes.append({"id": f"h{j+1}", "kind": "pill", "x": X0 + RW + 10 + j * (CW + 6), "y": Y0, "w": CW, "h": HH, "lines": [f"{j+1}. {n}"], "fontSize": 14, "fill": "#17212d", "textColor": "#fff"})
for i, r in enumerate(roles):
    y = Y0 + HH + 8 + i * (CH + 6)
    sysr = U.ACTORS[r].startswith("【")
    nodes.append({"id": f"r{i}", "kind": "step", "shape": "rect", "x": X0, "y": y, "w": RW, "h": CH, "lines": [("«service» " if sysr else "") + r], "fontSize": 14 if sysr else 15, "fill": "#edf1f4" if sysr else "#ffffff", "stroke": "#48586a", "textColor": "#17212d"})
    for j, n in enumerate(nodes_):
        x = X0 + RW + 10 + j * (CW + 6)
        if (r, n) in main:
            cell = {"lines": [f"R {cnt_main[(r, n)]}/{total[n]}"], "fill": "#1e755d", "textColor": "#ffffff", "stroke": "#1e755d"}
        elif (r, n) in co:
            cell = {"lines": [f"C {cnt_co[(r, n)]}/{total[n]}"], "fill": "#e3f1ec", "textColor": "#17212d", "stroke": "#9fc5b6"}
        else:
            cell = {"lines": ["—"], "fill": "#ffffff", "textColor": "#9aa4ae", "stroke": "#dce3e8"}
        nodes.append({"id": f"c{i}_{j}", "kind": "step", "shape": "rect", "x": x, "y": y, "w": CW, "h": CH, "fontSize": 14, **cell})
W = X0 + RW + 10 + len(nodes_) * (CW + 6) + 40; H = Y0 + HH + 8 + len(roles) * (CH + 6) + 40
doc = {"meta": {"id": "matrix_paichan", "title": "责任矩阵·角色×节点（09-02）", "date": "2026-09-02", "W": W, "H": H, "fs": {"title": 22, "body": 14}}, "nodes": nodes, "edges": edges}
out = os.path.join(ROOT, "data", "matrix_paichan.json"); json.dump(doc, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1); open(out, "a").write("\n")
print("写出", out, len(nodes), "格", W, "x", H)
