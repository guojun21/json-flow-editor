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
POS = {  # 网格坐标(列,行):主链一行排开;Episode 的三张从表在右侧上下排;批次/事件在下
 "req": (0, 0), "tok": (1, 0), "ses": (2, 0), "ep": (3, 0), "file": (4, 0), "q": (4, 1), "pc": (4, 2), "bat": (3, 1), "ev": (2, 1),
}
CW, RH, X0, Y0, GX, GY = 330, 24, 60, 150, 80, 110
nodes, edges = [], []
nodes.append({"id": "title", "kind": "text", "x": 40, "y": 30, "w": 1500, "h": 52, "lines": ["排产采集 · 一期数据模型（类图 / 实体关系）v4"], "fontSize": 32, "bold": True, "textColor": "#0b1220"})
nodes.append({"id": "legend", "kind": "text", "x": 40, "y": 86, "w": 1600, "h": 34, "lines": ["方框 = 实体(表):标题带为实体名,下面是字段 [PK 主键 | FK→表 外键 | NN 非空];两端标基数(1 / 0..1 / 0..* / 1..*);实线 = 外键关系,虚线 = 血缘快照(派生);清理前置 = 云端回执 + 批次对账通过 + 无未关闭隔离;来源 = factory-core/db.mjs,与线上库一致"], "fontSize": 16, "textColor": "#48586a"})
heights = {}
for eid, (name, table, attrs) in ENT.items():
    c, r = POS[eid]
    h = 52 + RH * len(attrs) + 14
    heights[eid] = h
for eid, (name, table, attrs) in ENT.items():
    c, r = POS[eid]
    x = X0 + c * (CW + GX)
    rowh = [max(heights[e] for e in ENT if POS[e][1] == rr) for rr in range(3)]
    y = Y0 + sum(rowh[:r]) + r * GY
    nodes.append({"id": eid, "kind": "classbox", "shape": "classbox", "x": x, "y": y, "w": CW, "h": heights[eid],
                  "lines": [f"{name}  «{table}»"] + attrs, "fontSize": 15, "fill": "#ffffff", "stroke": "#48586a"})
for i, (a, b, m1, m2, name) in enumerate(REL):
    e = {"id": f"r{i}", "from": a, "to": b, "color": "#1f6389", "width": 2, "arrow": "none",
         "labels": [{"text": m1, "position": 0.12}, {"text": m2, "position": 0.88}],
         "router": "manhattan" if (a, b) in (("req", "ep"), ("ev", "ep"), ("ep", "pc")) else "orth"}
    if name: e["label"] = name
    if a == "req" and b == "ep": e["dash"] = "dashed"; e["labels"] = [{"text": m1, "position": 0.04}, {"text": m2, "position": 0.96}]   # 派生/快照关系用虚线,基数贴两端
    edges.append(e)
W = X0 + 5 * (CW + GX); H = Y0 + 3 * (max(heights.values()) + GY) + 40
doc = {"meta": {"id": "er_paichan", "title": "类图·排产采集数据模型（09-02）", "date": "2026-09-02", "W": W, "H": H, "fs": {"title": 24, "body": 17}}, "nodes": nodes, "edges": edges}
out = os.path.join(ROOT, "data", "er_paichan.json"); json.dump(doc, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1); open(out, "a").write("\n")
print("写出", out, len(nodes), "节点", len(edges), "边", W, "x", H)
