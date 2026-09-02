#!/usr/bin/env python3
"""类图 / 实体关系图(排产采集一期):实体 = factory-core 的表,关系 = 1:n。单源在这里,改完重跑。
类框 = 矩形节点:第一行实体名,下面每行一个属性(带类型);关系 = 无箭头实线 + 标签「1 — n」。"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ENT = {  # id: (中文名, 表名, 属性)  写法:field [PK|FK→表|NN|UQ] 说明;*_snapshot = 采集那一刻的不可变快照
 "req": ("需求单", "requirements", ["id PK 需求单号", "name NN 任务名", "requester 需求人", "target_hours / target_episodes 目标", "status NN 状态机(草稿→待评审→试采→Demo待确认→开放…)", "sop_version 冻结的 SOP 版本", "daily_quota / assign_quota 日配额 / 分配池", "concurrent_limit 并发上限", "version 需求版本"]),
 "tok": ("任务令牌", "tokens", ["id PK 令牌号", "requirement_id FK→requirements NN", "collector / shift / station / robot_id NN 四项绑定,领取后不可变", "monitor 监控员", "sop_version 冻结版本", "source NN claim|assign", "accept_status 待接受|已接受|已拒绝(仅 assign)", "status NN 待开工|在采|已收工|已超时回收|已拒绝", "expires_at 过期时间"]),
 "ses": ("采集会话", "sessions", ["id PK 会话号", "token_id FK→tokens NN", "station_snapshot / robot_snapshot 快照", "status NN 进行中|已结束|失败", "reconnects / max_reconnect_seconds", "started_at / ended_at"]),
 "ep":  ("Episode", "episodes", ["id PK Episode 号(包内 meta 同值)", "session_id FK→sessions", "token_id / requirement_id 血缘快照(不可变)", "collector/station/robot/shift/sop 快照", "disk_id 盘号 · package_dir 落盘目录", "bytes / duration_seconds / fps", "status NN 主状态(已落盘→预检通过|隔离区→待搬运→已上云→…)", "reason_code 原因码", "meta_json 双写元数据", "cloud_receipt_at · cleanup_deadline(回执+对账通过+非隔离才置)", "batch_id FK→batches 0..1"]),
 "file": ("Episode 文件", "episode_files", ["PK(episode_id, rel_path)", "episode_id FK→episodes", "rel_path 相对路径", "bytes", "sha256 NN"]),
 "pc":  ("预检结果", "precheck_results", ["PK(episode_id, rule)", "episode_id FK→episodes", "rule NN 规则名", "rule_version NN 规则版本", "passed NN", "reason_code", "detail · checked_at"]),
 "q":   ("隔离记录", "episode_quarantines", ["id PK", "episode_id FK→episodes NN", "reason_code NN", "source_path / quarantine_path", "entered_at NN", "released_at(未关闭不得进批次/清理)", "reviewer / disposition 复核人 / 处置"]),
 "bat": ("交付批次", "batches", ["id PK 批次号", "episode_count / bytes 封板快照", "manifest_path 逐文件 sha256 清单", "checksum_status NN 待对账|通过|不一致", "cloud_receipt NN 未确认|已确认", "created_at / verified_at"]),
 "ev":  ("事件流", "events", ["seq PK", "at NN", "kind NN 事件类型(前缀=对象类型)", "ref_type NN + ref_id 关联对象", "actor 操作人", "detail 明细"]),
}
REL = [  # (from, to, 起点基数, 终点基数, 关系名)
 ("req", "tok", "1", "0..*", ""), ("tok", "ses", "1", "0..*", ""), ("ses", "ep", "1", "0..*", ""),
 ("ep", "file", "1", "1..*", ""), ("ep", "pc", "1", "1..*", ""), ("ep", "q", "1", "0..*", "隔离"),
 ("bat", "ep", "0..1", "0..*", "batch_id"), ("req", "ep", "1", "0..*", "血缘快照(虚线)"), ("ev", "ep", "0..*", "1", "ref_type=episode"),
]
POS = {  # 网格坐标(列,行):主链一行排开;Episode 的三张从表在右侧上下排;批次在 Episode 正下方,事件在会话正下方
 "req": (0, 0), "tok": (1, 0), "ses": (2, 0), "ep": (3, 0), "file": (4, 0), "q": (4, 1), "pc": (4, 2), "bat": (3, 1), "ev": (2, 1),
}
CW, RH, X0, Y0, GX, GY = 360, 24, 60, 150, 90, 120
def tw(t): return sum(15 if ord(c) > 255 else 8 for c in t)
def wrap(t, maxw):   # 属性行太长就在分隔符处折成两行,别横出框外
    if tw(t) <= maxw: return [t]
    cut = None
    for i, c in enumerate(t):
        if c in " ,;/→|·(" and tw(t[:i + 1]) <= maxw: cut = i
    if cut is None: return [t]
    return [t[:cut + 1].rstrip(), "    " + t[cut + 1:].lstrip()]
nodes, edges = [], []
nodes.append({"id": "title", "kind": "text", "x": 40, "y": 30, "w": 1500, "h": 52, "lines": ["排产采集 · 一期数据模型（类图 / 实体关系）v5"], "fontSize": 32, "bold": True, "textColor": "#0b1220"})
nodes.append({"id": "legend", "kind": "text", "x": 40, "y": 86, "w": 1600, "h": 34, "lines": ["方框 = 实体(表):标题带为实体名,下面是字段 [PK 主键 | FK→表 外键 | NN 非空];两端标基数(1 / 0..1 / 0..* / 1..*);实线 = 外键关系,虚线 = 血缘快照(派生);清理前置 = 云端回执 + 批次对账通过 + 无未关闭隔离"], "fontSize": 15, "textColor": "#48586a"})
LINES, heights = {}, {}
for eid, (name, table, attrs) in ENT.items():
    ls = [f"{name}  «{table}»"]
    for a in attrs: ls += wrap(a, CW - 28)
    LINES[eid] = ls; heights[eid] = 52 + RH * (len(ls) - 1) + 14
rowh = [max(heights[e] for e in ENT if POS[e][1] == rr) for rr in range(3)]
def xy(eid):
    c, r = POS[eid]; return X0 + c * (CW + GX), Y0 + sum(rowh[:r]) + r * GY
for eid in ENT:
    x, y = xy(eid)
    nodes.append({"id": eid, "kind": "classbox", "shape": "classbox", "x": x, "y": y, "w": CW, "h": heights[eid], "lines": LINES[eid], "fontSize": 15, "fill": "#ffffff", "stroke": "#48586a"})
def box(eid):
    x, y = xy(eid); return x, y, x + CW, y + heights[eid]
def frac(eid, px, py):   # 绝对点 → 相对锚点
    x1, y1, x2, y2 = box(eid); return {"x": round((px - x1) / CW, 3), "y": round((py - y1) / heights[eid], 3)}
def rel(i, a, b, m1, m2, name, A, B, verts=(), dashed=False):
    e = {"id": f"r{i}", "from": a, "to": b, "fromAnchor": frac(a, *A), "toAnchor": frac(b, *B), "color": "#1f6389", "width": 2, "arrow": "none", "router": "normal",
         "labels": [{"text": m1, "position": 0.07}, {"text": m2, "position": 0.93}]}
    if verts: e["vertices"] = [{"x": x, "y": y} for x, y in verts]
    if name: e["labels"].append({"text": name, "position": {"distance": 0.82, "offset": {"x": 0, "y": -14}}})   # 关系名贴近终点端、浮在线上方,不悬在走廊中间
    if dashed: e["dash"] = "dashed"
    edges.append(e)
# 每条关系显式给定两端轮廓锚点 + 折点,走线完全可控:主链同排直连(标题带高度处),从表走列间走廊,批次正下方直连
HY = 36   # 同排直连的高度(标题带中线)
for i, (a, b, m1, m2, name) in enumerate(REL):
    ax1, ay1, ax2, ay2 = box(a); bx1, by1, bx2, by2 = box(b)
    if POS[a][1] == POS[b][1] and POS[b][0] == POS[a][0] + 1:            # 同排相邻:直线
        rel(i, a, b, m1, m2, name, (ax2, ay1 + HY), (bx1, by1 + HY)); continue
    if (a, b) == ("ep", "q"):                                            # 右侧列间走廊,下到隔离记录
        cx = bx1 - 25; rel(i, a, b, m1, m2, name, (ax2, ay1 + HY + 70), (bx1, by1 + HY), [(cx, ay1 + HY + 70), (cx, by1 + HY)]); continue
    if (a, b) == ("ep", "pc"):
        cx = bx1 - 60; rel(i, a, b, m1, m2, name, (ax2, ay1 + HY + 140), (bx1, by1 + HY), [(cx, ay1 + HY + 140), (cx, by1 + HY)]); continue
    if (a, b) == ("bat", "ep"):                                          # 正下方:竖直直连
        mx = ax1 + CW / 2; rel(i, a, b, m1, m2, name, (mx, ay1), (mx, by2)); continue
    if (a, b) == ("ev", "ep"):                                           # 事件流(会话正下方)→ 走列间走廊,从 Episode 左边下部进入;标签放走廊左侧空白
        cx = bx1 - 45; yy = by2 - 40
        rel(i, a, b, m1, m2, name, (ax2, ay1 + HY), (bx1, yy), [(cx, ay1 + HY), (cx, yy)])
        edges[-1]["labels"].append({"text": name, "position": {"distance": 0.5, "offset": {"x": -64, "y": 28}}}); edges[-1].pop("label", None); continue
    if (a, b) == ("req", "ep"):                                          # 血缘快照:沿第 0/1 排之间的走廊走虚线,终点在 Episode 底边左 1/4,避开正中的批次线
        yg = Y0 + rowh[0] + 60; mx = ax1 + CW / 2; tx = bx1 + CW * 0.25
        rel(i, a, b, m1, m2, name, (mx, ay2), (tx, by2), [(mx, yg), (tx, yg)], dashed=True); continue
    rel(i, a, b, m1, m2, name, (ax2, ay1 + HY), (bx1, by1 + HY))
W = X0 + 5 * (CW + GX); H = Y0 + sum(rowh) + 2 * GY + 60
doc = {"meta": {"id": "er_paichan", "title": "类图·排产采集数据模型（09-02）", "date": "2026-09-02", "order": 20, "W": W, "H": H, "fs": {"title": 24, "body": 17}}, "nodes": nodes, "edges": edges}
out = os.path.join(ROOT, "data", "er_paichan.json"); json.dump(doc, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1); open(out, "a").write("\n")
print("写出", out, len(nodes), "节点", len(edges), "边", W, "x", H)
