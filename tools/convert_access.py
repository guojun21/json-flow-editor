#!/usr/bin/env python3
"""访问权限矩阵(一期):人员角色 × 一期功能 × 查看/操作/审批。这是提案,会上要拍板;系统/服务身份用 ACL 单列。"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUN = ["需求单", "任务广场/令牌", "分配(定向指派)", "工位开工/收工", "Episode 入库", "预检结果/隔离处置", "交付批次/对账", "验收看板", "系统配置(两池/规则)"]
ROLES = ["数采员", "组长", "监控员", "质检员", "质检组长", "设备运维", "IT/云运维", "算法(需求方)", "工厂管理员/运营", "数据运营", "搬运/物流"]
V, O, A = "查看", "操作", "审批"
M = {  # 角色: {功能: 权限集合}
 "数采员": {"任务广场/令牌": {V, O}, "工位开工/收工": {V, O}, "Episode 入库": {V}, "预检结果/隔离处置": {V}, "验收看板": {V}},
 "组长": {"任务广场/令牌": {V, O}, "分配(定向指派)": {V, O}, "工位开工/收工": {V, O}, "Episode 入库": {V}, "预检结果/隔离处置": {V, O}, "验收看板": {V}},
 "监控员": {"工位开工/收工": {V}, "Episode 入库": {V}, "预检结果/隔离处置": {V, O}, "验收看板": {V}},
 "质检员": {"Episode 入库": {V}, "预检结果/隔离处置": {V, O}, "交付批次/对账": {V}, "验收看板": {V}},
 "质检组长": {"预检结果/隔离处置": {V, O, A}, "交付批次/对账": {V, A}, "验收看板": {V}},
 "设备运维": {"工位开工/收工": {V, O}, "Episode 入库": {V}, "验收看板": {V}},
 "IT/云运维": {"Episode 入库": {V, O}, "交付批次/对账": {V, O}, "验收看板": {V}, "系统配置(两池/规则)": {V}},
 "算法(需求方)": {"需求单": {V, O}, "任务广场/令牌": {V}, "预检结果/隔离处置": {V}, "交付批次/对账": {V}, "验收看板": {V}},
 "工厂管理员/运营": {"需求单": {V, A}, "任务广场/令牌": {V, O}, "分配(定向指派)": {V, O, A}, "工位开工/收工": {V}, "预检结果/隔离处置": {V}, "交付批次/对账": {V, O}, "验收看板": {V}, "系统配置(两池/规则)": {V, O}},
 "数据运营": {"需求单": {V, O}, "任务广场/令牌": {V}, "分配(定向指派)": {V}, "Episode 入库": {V}, "预检结果/隔离处置": {V}, "交付批次/对账": {V, O, A}, "验收看板": {V, O}, "系统配置(两池/规则)": {V, O, A}},
 "搬运/物流": {"交付批次/对账": {V, O}, "验收看板": {V}},
}
SVC = [("工控机采集 Agent", "开工/收工、Episode 入库 —— 设备身份"), ("平台任务中心", "令牌签发/回收、状态机、预检、批次 —— 服务身份"), ("数据平台(云端)", "回执、质检结论回传 —— 服务身份"), ("调度器 «timer»", "超时回收、余量回流 —— 系统内部")]
CW, CH, RW, X0, Y0, HH = 148, 50, 220, 40, 130, 66
nodes = []
nodes.append({"id": "title", "kind": "text", "x": 40, "y": 30, "w": 1500, "h": 50, "lines": ["访问权限矩阵（提案） · 人员角色 × 一期功能"], "fontSize": 30, "bold": True, "textColor": "#0b1220"})
nodes.append({"id": "legend", "kind": "text", "x": 40, "y": 80, "w": 1700, "h": 30, "lines": ["查 = 查看;操 = 发起/修改/执行;审 = 审批/终审/解除隔离;— = 无权限。职责分离:需求方不终审、物流只做交接确认、终审限质检组长/数据运营。数据范围(本班组/本批次)另定。系统/服务身份走 ACL(下表)"], "fontSize": 14, "textColor": "#48586a"})
nodes.append({"id": "h0", "kind": "pill", "x": X0, "y": Y0, "w": RW, "h": HH, "lines": ["角色 \\ 功能"], "fontSize": 15, "fill": "#17212d", "textColor": "#fff"})
for j, f in enumerate(FUN):
    nodes.append({"id": f"h{j+1}", "kind": "pill", "x": X0 + RW + 10 + j * (CW + 6), "y": Y0, "w": CW, "h": HH, "lines": [f], "fontSize": 13, "fill": "#17212d", "textColor": "#fff"})
for i, r in enumerate(ROLES):
    y = Y0 + HH + 8 + i * (CH + 6)
    nodes.append({"id": f"r{i}", "kind": "step", "shape": "rect", "x": X0, "y": y, "w": RW, "h": CH, "lines": [r], "fontSize": 15, "fill": "#ffffff", "stroke": "#48586a", "textColor": "#17212d"})
    for j, f in enumerate(FUN):
        x = X0 + RW + 10 + j * (CW + 6); perm = M.get(r, {}).get(f, set())
        txt = " ".join(t for t, k in (("查", V), ("操", O), ("审", A)) if k in perm) or "—"
        fill = "#1e755d" if A in perm else "#5aa085" if O in perm else "#e3f1ec" if V in perm else "#ffffff"
        color = "#ffffff" if (A in perm or O in perm) else "#17212d" if V in perm else "#9aa4ae"
        nodes.append({"id": f"c{i}_{j}", "kind": "step", "shape": "rect", "x": x, "y": y, "w": CW, "h": CH, "lines": [txt], "fontSize": 14, "fill": fill, "textColor": color, "stroke": "#dce3e8" if not perm else fill})
y = Y0 + HH + 8 + len(ROLES) * (CH + 6) + 30
nodes.append({"id": "svc_t", "kind": "text", "x": X0, "y": y, "w": 1500, "h": 30, "lines": ["系统 / 服务身份（ACL，不走人员权限）"], "fontSize": 18, "bold": True, "textColor": "#0b1220"}); y += 40
for i, (svc, desc) in enumerate(SVC):
    nodes.append({"id": f"s{i}", "kind": "step", "shape": "rect", "x": X0, "y": y + i * (CH + 6), "w": RW, "h": CH, "lines": ["«service» " + svc], "fontSize": 13, "fill": "#edf1f4", "stroke": "#48586a", "textColor": "#17212d"})
    nodes.append({"id": f"sd{i}", "kind": "step", "shape": "rect", "x": X0 + RW + 10, "y": y + i * (CH + 6), "w": len(FUN) * (CW + 6) - 6, "h": CH, "lines": [desc], "fontSize": 14, "fill": "#ffffff", "stroke": "#dce3e8", "textColor": "#17212d"})
W = X0 + RW + 10 + len(FUN) * (CW + 6) + 40; H = y + len(SVC) * (CH + 6) + 60
doc = {"meta": {"id": "access_paichan", "title": "访问权限矩阵·角色×功能（09-02）", "date": "2026-09-02", "order": 41, "W": W, "H": H, "fs": {"title": 22, "body": 14}}, "nodes": nodes, "edges": []}
out = os.path.join(ROOT, "data", "access_paichan.json"); json.dump(doc, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1); open(out, "a").write("\n")
print("写出", out, len(nodes), "格", W, "x", H)
